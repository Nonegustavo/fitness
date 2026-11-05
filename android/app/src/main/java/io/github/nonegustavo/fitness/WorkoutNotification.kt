package io.github.nonegustavo.fitness

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToLong
import org.json.JSONArray
import org.json.JSONObject

/**
 * The workout in progress in the notification shade and on the lock screen: the current set with
 * −/+ for the load and the reps and "Concluir", then the rest's countdown with "+15 s" and "Pular".
 *
 * The web app (src/features/training/workoutNotification.ts) sends the sets still to do, in order, and
 * the rest running. The buttons work without it, even with the app's process gone: each tap changes
 * what is shown and goes into a queue the app applies to the workout when it runs again. What is shown
 * is always the app's last state with the queue it hasn't acknowledged on top.
 */
object WorkoutNotification {
    private const val PREFIX = "io.github.nonegustavo.fitness.workout."
    const val LOAD_DOWN = PREFIX + "LOAD_DOWN"
    const val LOAD_UP = PREFIX + "LOAD_UP"
    const val VALUE_DOWN = PREFIX + "VALUE_DOWN"
    const val VALUE_UP = PREFIX + "VALUE_UP"
    const val COMPLETE = PREFIX + "COMPLETE"
    const val REST_ADD = PREFIX + "REST_ADD"
    const val REST_SKIP = PREFIX + "REST_SKIP"
    const val REST_END = PREFIX + "REST_END"
    const val DISMISSED = PREFIX + "DISMISSED"

    private const val PREFS = "workout"
    private const val NOTIFICATION_ID = 2001
    private const val ALERT_ID = 2002
    private const val CHANNEL = "treino"
    // Created by the web app with its other channels (src/features/notifications/native.ts).
    private const val ALERT_CHANNEL = "descanso"
    private const val TEAL = 0xFF0F766E.toInt()
    // An end of rest found this late (an alarm lost to a reboot, say) no longer rings.
    private const val ALERT_STALE_MS = 15 * 60_000L
    private val VALUE_KEYS = listOf("weightKg", "reps", "durationSec")

    /** Whether the app is on screen: its rest bar rings at the end then, and this side stays quiet. */
    @Volatile
    var onScreen = false

    /** The app's state, shown with the queue it hasn't applied on top; what it applied leaves the queue. */
    fun show(context: Context, state: JSONObject, ack: Long) {
        synchronized(this) {
            val prefs = prefs(context)
            val old = queue(prefs)
            val queue = JSONArray()
            for (i in 0 until old.length()) {
                val action = old.optJSONObject(i) ?: continue
                if (action.optLong("id") > ack) queue.put(action)
            }
            prefs.edit().putString("state", state.toString()).putString("queue", queue.toString()).commit()
            refresh(context, prefs)
        }
    }

    /** No workout in progress: no notification, alarm or queue. The ids carry on, so the app never mixes them up. */
    fun clear(context: Context) {
        synchronized(this) {
            prefs(context).edit().remove("state").remove("queue").remove("alertAt").commit()
            cancelAll(context)
        }
    }

    /** What was done in the notification and not acknowledged by the app yet, oldest first. */
    fun queued(context: Context): JSONArray = synchronized(this) { queue(prefs(context)) }

    /** The app came to the screen, where its bar shows the rest: an end-of-rest notification is old news. */
    fun dismissAlert(context: Context) {
        NotificationManagerCompat.from(context).cancel(ALERT_ID)
    }

    /**
     * A button, the end-of-rest alarm, the notification swiped away (Android 14+ allows it) or the
     * phone restarted: the notification is drawn again in every case.
     */
    fun handle(context: Context, intent: Intent) {
        synchronized(this) {
            val prefs = prefs(context)
            val display = display(prefs)
            if (display == null) {
                cancelAll(context)
                return
            }
            val now = System.currentTimeMillis()
            val key = intent.data?.schemeSpecificPart
            val action = when (intent.action) {
                LOAD_DOWN -> adjust(display, key, load = true, up = false)
                LOAD_UP -> adjust(display, key, load = true, up = true)
                VALUE_DOWN -> adjust(display, key, load = false, up = false)
                VALUE_UP -> adjust(display, key, load = false, up = true)
                COMPLETE -> complete(display, key, now)
                REST_ADD -> changeRest(display, now, add = true)
                REST_SKIP -> changeRest(display, now, add = false)
                REST_END -> {
                    restEnded(context, prefs, display, now)
                    null
                }
                else -> null
            }
            if (action != null) {
                val id = prefs.getLong("nextId", 1)
                val queue = queue(prefs).put(action.put("id", id))
                prefs.edit().putLong("nextId", id + 1).putString("queue", queue.toString()).commit()
                dismissAlert(context)
            }
            refresh(context, prefs)
            if (action != null) WorkoutPlugin.notifyAction()
        }
    }

    private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun queue(prefs: SharedPreferences): JSONArray =
        prefs.getString("queue", null)?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()

    /** The app's last state with the queue on top; null when no workout is in progress. */
    private fun display(prefs: SharedPreferences): JSONObject? {
        val state = prefs.getString("state", null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
        val queue = queue(prefs)
        for (i in 0 until queue.length()) {
            val action = queue.optJSONObject(i) ?: continue
            apply(state, action)
        }
        return state
    }

    /** The same as the app does with an action (src/features/training/workoutQueue.ts), on the state shown. */
    private fun apply(display: JSONObject, action: JSONObject) {
        val type = action.optString("type")
        if (type == "rest") {
            display.put("rest", action.opt("rest") ?: JSONObject.NULL)
            return
        }
        val sets = display.optJSONArray("sets") ?: return
        val setKey = action.optString("setKey")
        val index = (0 until sets.length()).firstOrNull { sets.optJSONObject(it)?.optString("setKey") == setKey }
        if (type == "values" && index != null) {
            val set = sets.getJSONObject(index)
            for (key in VALUE_KEYS) if (action.has(key)) set.put(key, action.get(key))
        } else if (type == "complete") {
            if (index != null) sets.remove(index)
            if (action.has("rest")) display.put("rest", action.get("rest"))
        }
    }

    /** The set shown, if the tap was on it: a notification about to be redrawn may still show another. */
    private fun shown(display: JSONObject, setKey: String?): JSONObject? {
        val set = display.optJSONArray("sets")?.optJSONObject(0) ?: return null
        return set.takeIf { setKey != null && it.optString("setKey") == setKey }
    }

    private fun setAction(type: String, display: JSONObject, set: JSONObject): JSONObject = JSONObject()
        .put("type", type)
        .put("sessionId", display.optString("sessionId"))
        .put("exerciseKey", set.optString("exerciseKey"))
        .put("setKey", set.optString("setKey"))

    /** −/+ on the set shown: the load by its equipment's step, the reps by one, a duration by 5 s. */
    private fun adjust(display: JSONObject, setKey: String?, load: Boolean, up: Boolean): JSONObject? {
        val set = shown(display, setKey) ?: return null
        val type = set.optString("type")
        if (load && type != "weight_reps") return null
        val field = when {
            load -> "weightKg"
            type == "time" -> "durationSec"
            else -> "reps"
        }
        val value = number(set, field)
        val step = set.optDouble("step", 2.5).takeIf { it > 0 } ?: 2.5
        val next = when {
            // Nothing in the app for it yet: the exercise's latest set today, or a usual start.
            value == null -> number(set.optJSONObject("seed"), field) ?: when (field) {
                "weightKg" -> if (up) step else return null
                "durationSec" -> 30.0
                else -> 10.0
            }
            field == "weightKg" -> max(0.0, ((value + if (up) step else -step) * 100).roundToLong() / 100.0)
            field == "durationSec" -> max(5.0, value + if (up) 5 else -5)
            else -> max(1.0, value + if (up) 1 else -1)
        }
        if (next == value) return null
        val stored: Any = if (field == "weightKg") next else next.roundToLong()
        return setAction("values", display, set).put(field, stored)
    }

    /** "Concluir": the set done with the values shown, as checking it in the app, and its rest from now. */
    private fun complete(display: JSONObject, setKey: String?, now: Long): JSONObject? {
        val set = shown(display, setKey) ?: return null
        val action = setAction("complete", display, set).put("at", now)
        when (set.optString("type")) {
            "time" -> action.put("durationSec", number(set, "durationSec")?.roundToLong() ?: return null)
            "reps" -> action.put("reps", number(set, "reps")?.roundToLong() ?: return null)
            else -> {
                action.put("reps", number(set, "reps")?.roundToLong() ?: return null)
                number(set, "weightKg")?.let { action.put("weightKg", it) }
            }
        }
        val restSec = set.optInt("restSec")
        if (restSec > 0) {
            val rest = JSONObject()
                .put("endsAt", now + restSec * 1000L)
                .put("totalSec", restSec)
                .put("label", set.optString("exercise"))
            action.put("rest", rest)
        }
        return action
    }

    /** "+15 s" or "Pular" on the rest running: the rest as it is after the tap. */
    private fun changeRest(display: JSONObject, now: Long, add: Boolean): JSONObject? {
        val rest = display.optJSONObject("rest")?.takeIf { it.optLong("endsAt") > now } ?: return null
        val changed: Any = if (add) {
            JSONObject(rest.toString())
                .put("endsAt", rest.optLong("endsAt") + 15_000)
                .put("totalSec", rest.optInt("totalSec") + 15)
        } else {
            JSONObject.NULL
        }
        return JSONObject().put("type", "rest").put("rest", changed)
    }

    /** The alarm at the end of the rest: one ring, unless the app is on screen, where its bar rings. */
    private fun restEnded(context: Context, prefs: SharedPreferences, display: JSONObject, now: Long) {
        val alertAt = prefs.getLong("alertAt", 0)
        if (alertAt == 0L || alertAt > now) return
        prefs.edit().putLong("alertAt", 0).commit()
        if (!onScreen && now - alertAt < ALERT_STALE_MS) alert(context, display)
    }

    /** Draws the notification for the state shown, and sets the alarm for the end of the rest. */
    private fun refresh(context: Context, prefs: SharedPreferences) {
        val display = display(prefs)
        if (display == null) {
            cancelAll(context)
            return
        }
        val now = System.currentTimeMillis()
        planAlert(context, prefs, display, now)
        post(context, NOTIFICATION_ID, build(context, display, now))
    }

    /**
     * The end of the rest rings once, through an exact alarm that also brings the set back. A rest
     * skipped (or cut short in the app, whose bar rings then) before its end takes the alarm away; one
     * that ended keeps it until it rings, even after the app stops its timer a few seconds later.
     */
    private fun planAlert(context: Context, prefs: SharedPreferences, display: JSONObject, now: Long) {
        val endsAt = display.optJSONObject("rest")?.optLong("endsAt") ?: 0L
        var alertAt = prefs.getLong("alertAt", 0)
        if (endsAt > now) {
            alertAt = endsAt
        } else if (alertAt > now) {
            alertAt = 0
        }
        prefs.edit().putLong("alertAt", alertAt).commit()
        val alarms = context.getSystemService(AlarmManager::class.java)
        val alarm = alarmIntent(context)
        if (alertAt == 0L) {
            alarms.cancel(alarm)
            return
        }
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alertAt, alarm)
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alertAt, alarm)
            }
        } catch (error: SecurityException) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alertAt, alarm)
        }
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        1,
        Intent(context, WorkoutReceiver::class.java).setAction(REST_END),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun build(context: Context, display: JSONObject, now: Long): Notification {
        val rest = display.optJSONObject("rest")?.takeIf { it.optLong("endsAt") > now }
        val next = display.optJSONArray("sets")?.optJSONObject(0)
        val builder = NotificationCompat.Builder(context, channel(context))
            .setSmallIcon(R.drawable.ic_stat_fitness)
            .setColor(TEAL)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            // On the lock screen too, buttons and all: it's only sets and loads.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Not to the watch: every tap redraws it. The end-of-rest notification does go.
            .setLocalOnly(true)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setContentIntent(openApp(context, display))
            .setDeleteIntent(broadcast(context, DISMISSED, null))
        when {
            rest != null -> restViews(context, builder, rest, next, now)
            next != null -> setViews(context, builder, next)
            else -> doneViews(context, builder, display)
        }
        return builder.build()
    }

    /** The current set: collapsed with its check button, expanded with −/+ too. */
    private fun setViews(context: Context, builder: NotificationCompat.Builder, set: JSONObject) {
        val key = set.optString("setKey")
        val type = set.optString("type")
        val time = type == "time"
        val name = set.optString("exercise")
        // Like the app, a set needs its reps (or its time) to be checked.
        val ready = number(set, if (time) "durationSec" else "reps") != null
        val hint = when {
            ready -> ""
            time -> " · defina o tempo"
            else -> " · defina as repetições"
        }
        val line = summary(set, withExercise = false) + hint
        val complete = broadcast(context, COMPLETE, key)

        val small = RemoteViews(context.packageName, R.layout.workout_set)
        small.setTextViewText(R.id.workout_title, name)
        small.setTextViewText(R.id.workout_text, line)
        small.setViewVisibility(R.id.workout_complete, if (ready) View.VISIBLE else View.GONE)
        small.setOnClickPendingIntent(R.id.workout_complete, complete)

        val big = RemoteViews(context.packageName, R.layout.workout_set_big)
        big.setTextViewText(R.id.workout_title, name)
        big.setTextViewText(R.id.workout_text, set.optString("label"))
        big.setViewVisibility(R.id.workout_load_row, if (type == "weight_reps") View.VISIBLE else View.GONE)
        big.setTextViewText(R.id.workout_load, number(set, "weightKg")?.let { "${kg(it)} kg" } ?: "— kg")
        big.setOnClickPendingIntent(R.id.workout_load_down, broadcast(context, LOAD_DOWN, key))
        big.setOnClickPendingIntent(R.id.workout_load_up, broadcast(context, LOAD_UP, key))
        val value = if (time) {
            number(set, "durationSec")?.let { clock(it.roundToLong()) } ?: "—"
        } else {
            number(set, "reps")?.let { reps(it.roundToLong()) } ?: "— reps"
        }
        big.setTextViewText(R.id.workout_value, value)
        big.setContentDescription(R.id.workout_value_down, if (time) "Menos 5 segundos" else "Menos uma repetição")
        big.setContentDescription(R.id.workout_value_up, if (time) "Mais 5 segundos" else "Mais uma repetição")
        big.setOnClickPendingIntent(R.id.workout_value_down, broadcast(context, VALUE_DOWN, key))
        big.setOnClickPendingIntent(R.id.workout_value_up, broadcast(context, VALUE_UP, key))
        big.setViewVisibility(R.id.workout_complete, if (ready) View.VISIBLE else View.GONE)
        big.setOnClickPendingIntent(R.id.workout_complete, complete)

        builder.setContentTitle(name).setContentText(line).setCustomContentView(small).setCustomBigContentView(big)
    }

    /** The rest: a countdown that ticks on its own, what comes next, "+15 s" and "Pular". */
    private fun restViews(context: Context, builder: NotificationCompat.Builder, rest: JSONObject, next: JSONObject?, now: Long) {
        val endsAt = rest.optLong("endsAt")
        // The chronometer counts in the time since boot.
        val base = SystemClock.elapsedRealtime() + (endsAt - now)
        val key = endsAt.toString()
        val upNext = next?.let { "A seguir: ${summary(it, withExercise = true)}" } ?: "Todas as séries feitas"

        val small = RemoteViews(context.packageName, R.layout.workout_rest)
        val big = RemoteViews(context.packageName, R.layout.workout_rest_big)
        for (views in listOf(small, big)) {
            views.setChronometer(R.id.workout_clock, base, null, true)
            views.setChronometerCountDown(R.id.workout_clock, true)
            views.setOnClickPendingIntent(R.id.workout_skip, broadcast(context, REST_SKIP, key))
        }
        small.setTextViewText(R.id.workout_next, upNext)
        big.setTextViewText(R.id.workout_next, next?.let { "A seguir: ${it.optString("exercise")}" } ?: "Todas as séries feitas")
        big.setTextViewText(R.id.workout_next_detail, next?.let { summary(it, withExercise = false) } ?: "")
        big.setViewVisibility(R.id.workout_next_detail, if (next != null) View.VISIBLE else View.GONE)
        big.setOnClickPendingIntent(R.id.workout_add, broadcast(context, REST_ADD, key))

        builder.setContentTitle("Descanso").setContentText(upNext).setCustomContentView(small).setCustomBigContentView(big)
    }

    /** Every set checked: the workout waits to be finished in the app. */
    private fun doneViews(context: Context, builder: NotificationCompat.Builder, display: JSONObject) {
        val title = display.optString("title").ifEmpty { "Treino" }
        val text = "Todas as séries feitas · toque para finalizar"
        val small = RemoteViews(context.packageName, R.layout.workout_set)
        small.setTextViewText(R.id.workout_title, title)
        small.setTextViewText(R.id.workout_text, text)
        small.setViewVisibility(R.id.workout_complete, View.GONE)
        builder.setContentTitle(title).setContentText(text).setCustomContentView(small)
    }

    /** "Fim do descanso" with sound and vibration, on the channel of the app's end-of-rest notification. */
    private fun alert(context: Context, display: JSONObject) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(ALERT_CHANNEL) == null) {
            // The app creates it when it starts; this is only in case it never did.
            val channel = NotificationChannel(ALERT_CHANNEL, "Fim do descanso", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Avisa quando o descanso entre séries acaba"
            channel.enableVibration(true)
            channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            manager.createNotificationChannel(channel)
        }
        val next = display.optJSONArray("sets")?.optJSONObject(0)
        val notification = NotificationCompat.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fitness)
            .setColor(TEAL)
            .setContentTitle("Fim do descanso")
            .setContentText(next?.let { "A seguir: ${summary(it, withExercise = true)}" } ?: "Hora de finalizar o treino.")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(context, display))
            .build()
        post(context, ALERT_ID, notification)
    }

    /**
     * Its own channel: silent, but of default importance, since Android may leave low-importance
     * ("silent") notifications off the lock screen.
     */
    private fun channel(context: Context): String {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) == null) {
            val channel = NotificationChannel(CHANNEL, "Treino em andamento", NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "A série atual e o descanso, com botões, enquanto um treino está aberto"
            channel.setSound(null, null)
            channel.enableVibration(false)
            channel.setShowBadge(false)
            channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            manager.createNotificationChannel(channel)
        }
        return CHANNEL
    }

    @SuppressLint("MissingPermission")
    private fun post(context: Context, id: Int, notification: Notification) {
        // Without the permission (Android 13+) nothing shows; the app asks for it when a workout starts.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        NotificationManagerCompat.from(context).notify(id, notification)
    }

    private fun cancelAll(context: Context) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(NOTIFICATION_ID)
        manager.cancel(ALERT_ID)
        context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context))
    }

    /** Opens the workout in the app (fitness://app/<route>, as the shortcuts and the widget do). */
    private fun openApp(context: Context, display: JSONObject): PendingIntent {
        val uri = Uri.parse("fitness://app/treinos/sessao/" + Uri.encode(display.optString("sessionId")))
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** A button's broadcast. The key (the set, or the rest's end) makes one per set, so a tap says what it saw. */
    private fun broadcast(context: Context, action: String, key: String?): PendingIntent {
        val intent = Intent(context, WorkoutReceiver::class.java).setAction(action)
        if (key != null) intent.data = Uri.fromParts("workout", key, null)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** A number of the state; null when missing (JSON leaves out what the app has as undefined). */
    private fun number(json: JSONObject?, key: String): Double? {
        if (json == null || !json.has(key) || json.isNull(key)) return null
        return json.optDouble(key).takeIf { !it.isNaN() }
    }

    /** "Série 2 de 4 · 60 kg × 10", with the exercise in front for what comes next. */
    private fun summary(set: JSONObject, withExercise: Boolean): String {
        val parts = mutableListOf<String>()
        if (withExercise) parts += set.optString("exercise")
        parts += set.optString("label")
        amounts(set)?.let { parts += it }
        return parts.filter { it.isNotEmpty() }.joinToString(" · ")
    }

    /** "60 kg × 10", "12 reps" or "0:45", as the set would be checked; null when there's nothing yet. */
    private fun amounts(set: JSONObject): String? {
        val count = number(set, "reps")?.roundToLong()
        val weight = number(set, "weightKg")?.takeIf { it > 0 }
        return when (set.optString("type")) {
            "time" -> number(set, "durationSec")?.let { clock(it.roundToLong()) }
            "reps" -> count?.let { reps(it) }
            else -> when {
                weight != null && count != null -> "${kg(weight)} kg × $count"
                weight != null -> "${kg(weight)} kg"
                count != null -> reps(count)
                else -> null
            }
        }
    }

    /** 62.5 -> "62,5", as the app writes loads. */
    private fun kg(value: Double): String = DecimalFormat("0.##", DecimalFormatSymbols(Locale.forLanguageTag("pt-BR"))).format(value)

    private fun reps(count: Long): String = if (count == 1L) "1 rep" else "$count reps"

    /** 45 -> "0:45". */
    private fun clock(seconds: Long): String = "%d:%02d".format(seconds / 60, seconds % 60)
}
