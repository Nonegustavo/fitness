package io.github.nonegustavo.fitness

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONArray

/**
 * Tells when the coach sends new workouts, even with the app closed. Every 3 hours (WorkManager, with
 * a network) the published Garmin calendar is read straight from its link, and its SisRUN workouts
 * (named with their day, "06/11 Sex - …") from today to the end of the second week ahead are compared
 * with the ones already known: the ones the app saw in its calendar (src/features/sisrun/watch.ts)
 * and the ones told about before. Only Garmin's calendar is read here, never SisRUN: the app reads
 * the steps from SisRUN when it opens.
 *
 * The keys are the app's (src/features/calendar/agenda.ts, eventKey and keyedEvents), so both sides
 * agree on what was seen: "t:" + the name without accents, in lower case, + "|" + the day.
 */
object SisrunWatch {
    const val PREFS = "sisrun_watch"
    private const val WORK = "sisrun-watch"
    private const val CHANNEL = "sisrun"
    private const val NOTIFICATION_ID = 3001
    private const val TIMEOUT_MS = 30_000
    /** The weeks after the current one the app can read from SisRUN. */
    private const val WEEKS_AHEAD = 2L
    /** Known workouts are forgotten a week after their day. */
    private const val KEEP_DAYS = 7L
    private const val TEAL = 0xFF0F766E.toInt()
    private val WEEKDAYS = arrayOf("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")

    private val FROM_COACH = Regex("^\\s*\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\s+\\p{L}{3,}\\.?\\s*[-–—:]")
    private val DAY_PREFIX = Regex("^\\s*\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\s+\\p{L}{3,}\\.?\\s*[-–—:]\\s*")
    private val REST = Regex("\\b(descanso|folga|repouso|rest|off)\\b")
    private val START = Regex("^(\\d{4})(\\d{2})(\\d{2})(?:T(\\d{2})(\\d{2})(\\d{2})(Z)?)?$")
    private val ESCAPE = Regex("\\\\([\\\\;,nN])")
    private val KEY_DAY = Regex("\\|(\\d{4}-\\d{2}-\\d{2})")

    data class Workout(val key: String, val date: LocalDate, val title: String)

    private class Event(val date: LocalDate, val time: Long?, val title: String, val description: String)

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<SisrunWatchWorker>(3, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        // KEEP: opening the app doesn't push the next check further away.
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }

    /**
     * What the app knows: the calendar's link (kept when not sent), the SisRUN workouts it has in its
     * calendar (joining the ones known, so one told about meanwhile isn't told again) and the hidden ones.
     */
    fun configure(context: Context, url: String?, known: List<String>, hidden: List<String>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val all = prune(strings(prefs.getString("known", null)) + known, LocalDate.now())
        val editor = prefs.edit().putString("known", JSONArray(all).toString()).putString("hidden", JSONArray(hidden).toString())
        if (url != null) editor.putString("url", url)
        editor.apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    /** The calendar's SisRUN workouts not known yet; with `tell`, a notification about them, and they become known. */
    fun check(context: Context, tell: Boolean): List<Workout> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = prefs.getString("url", null) ?: return emptyList()
        val text = fetch(url) ?: return emptyList()
        val today = LocalDate.now()
        val known = strings(prefs.getString("known", null))
        val hidden = strings(prefs.getString("hidden", null))
        val found = keyed(parse(text))
            .filter { (event, key) ->
                key !in hidden && key !in known && inWindow(event.date, today) &&
                    FROM_COACH.containsMatchIn(event.title) && !REST.containsMatchIn(plain(event.title))
            }
            .map { (event, key) -> Workout(key, event.date, event.title) }
        if (tell && found.isNotEmpty()) {
            notify(context, found)
            prefs.edit().putString("known", JSONArray(prune(known + found.map { it.key }, today)).toString()).apply()
        }
        return found
    }

    private fun fetch(url: String): String? =
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("Accept", "text/calendar, */*")
            try {
                if (connection.responseCode in 200..299) connection.inputStream.bufferedReader(Charsets.UTF_8).readText() else null
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }

    private fun unescape(text: String): String =
        ESCAPE.replace(text) { match -> match.groupValues[1].let { if (it == "n" || it == "N") "\n" else it } }

    /** "20261106" (a day), "20261106T070000Z" (UTC) or "20261106T070000" (local): the local day, and the time when there is one. */
    private fun start(value: String): Pair<LocalDate, Long?>? {
        val match = START.matchEntire(value.trim()) ?: return null
        val groups = match.groupValues
        val date = LocalDate.of(groups[1].toInt(), groups[2].toInt(), groups[3].toInt())
        if (groups[4].isEmpty()) return date to null
        val local = LocalDateTime.of(date, LocalTime.of(groups[4].toInt(), groups[5].toInt(), groups[6].toInt()))
        val instant = if (groups[7].isNotEmpty()) local.toInstant(ZoneOffset.UTC) else local.atZone(ZoneId.systemDefault()).toInstant()
        return instant.atZone(ZoneId.systemDefault()).toLocalDate() to instant.toEpochMilli()
    }

    /** The calendar's events, as src/features/garmin/calendar.ts reads them. */
    private fun parse(text: String): List<Event> {
        val lines = text.replace("\r\n", "\n").replace("\r", "\n").replace(Regex("\n[ \t]"), "").split("\n")
        val events = mutableListOf<Event>()
        var fields: MutableMap<String, String>? = null
        for (line in lines) {
            if (line == "BEGIN:VEVENT") {
                fields = mutableMapOf()
            } else if (line == "END:VEVENT" && fields != null) {
                val start = fields["DTSTART"]?.let { start(it) }
                val title = unescape(fields["SUMMARY"] ?: "").trim()
                if (start != null && title.isNotEmpty()) {
                    events += Event(start.first, start.second, title, unescape(fields["DESCRIPTION"] ?: "").trim())
                }
                fields = null
            } else if (fields != null) {
                val colon = line.indexOf(':')
                if (colon > 0) fields[line.substring(0, colon).split(';')[0].uppercase(Locale.ROOT)] = line.substring(colon + 1)
            }
        }
        return events.sortedWith(compareBy<Event> { it.date }.thenBy { it.time ?: 0L })
    }

    private fun plain(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "").lowercase(Locale.ROOT)

    private fun baseKey(event: Event): String = "t:" + plain(event.title).replace(Regex("(?U)\\s+"), " ").trim() + "|" + event.date

    /** Each event with its key; two with the same name on the same day get "#2", "#3"…, ordered by time and description. */
    private fun keyed(events: List<Event>): List<Pair<Event, String>> {
        val groups = LinkedHashMap<String, MutableList<Event>>()
        for (event in events) groups.getOrPut(baseKey(event)) { mutableListOf() } += event
        val keys = HashMap<Event, String>()
        for ((base, group) in groups) {
            group.sortedWith(compareBy<Event> { it.time ?: -1L }.thenBy { it.description }).forEachIndexed { i, event ->
                keys[event] = if (i == 0) base else "$base#${i + 1}"
            }
        }
        return events.map { it to keys.getValue(it) }
    }

    private fun monday(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    private fun inWindow(date: LocalDate, today: LocalDate): Boolean =
        !date.isBefore(today) && ChronoUnit.WEEKS.between(monday(today), monday(date)) <= WEEKS_AHEAD

    private fun strings(json: String?): Set<String> {
        if (json.isNullOrEmpty()) return emptySet()
        val array = JSONArray(json)
        return (0 until array.length()).map { array.optString(it) }.toSet()
    }

    private fun prune(keys: Collection<String>, today: LocalDate): List<String> {
        val oldest = today.minusDays(KEEP_DAYS).toString()
        return keys.filter { (KEY_DAY.find(it)?.groupValues?.get(1) ?: "") >= oldest }.distinct()
    }

    /** "Intervalado ativo 4,48 - 4,97 Km": without SisRUN's day and the "Corrida" the notification already says. */
    private fun shortTitle(title: String): String {
        val name = title.replace(DAY_PREFIX, "").trim().ifEmpty { title.trim() }
        val short = name.replace(Regex("(?i)^corrida\\b\\s*[-–:]?\\s*"), "")
        return short.ifEmpty { name }.replaceFirstChar { it.uppercase(Locale.ROOT) }
    }

    private fun dayLabel(date: LocalDate): String = "${WEEKDAYS[date.dayOfWeek.value - 1]}, ${date.dayOfMonth}/${date.monthValue}"

    /** "Treino novo do SisRUN" with each one's day and name; a tap opens the calendar on the first one's day. */
    @SuppressLint("MissingPermission")
    private fun notify(context: Context, found: List<Workout>) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) == null) {
            val channel = NotificationChannel(CHANNEL, "Treinos novos do SisRUN", NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "Avisa quando o treinador manda treinos novos para o calendário"
            manager.createNotificationChannel(channel)
        }
        val sorted = found.sortedBy { it.date }
        val lines = sorted.map { "${dayLabel(it.date)} · ${shortTitle(it.title)}" }
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("fitness://app/calendario?dia=${sorted.first().date}"), context, MainActivity::class.java)
        val tap = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fitness)
            .setColor(TEAL)
            .setContentTitle(if (found.size == 1) "Treino novo do SisRUN" else "${found.size} treinos novos do SisRUN")
            .setContentText(if (lines.size == 1) lines[0] else "${lines[0]} e mais ${lines.size - 1}")
            .setStyle(NotificationCompat.BigTextStyle().bigText(lines.take(6).joinToString("\n")))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }
}

/** The check every 3 hours; a failed fetch just waits for the next one. */
class SisrunWatchWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        SisrunWatch.check(applicationContext, tell = true)
        return Result.success()
    }
}

/** The web app's side of the watch: what it knows, on or off, and a check on demand. */
@CapacitorPlugin(name = "SisrunWatch")
class SisrunWatchPlugin : Plugin() {
    private val background = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun configure(call: PluginCall) {
        if (call.getBoolean("enabled", false) != true) {
            SisrunWatch.clear(context)
            SisrunWatch.cancel(context)
            call.resolve()
            return
        }
        val known = call.getArray("known", JSArray())?.toList<String>() ?: emptyList()
        val hidden = call.getArray("hidden", JSArray())?.toList<String>() ?: emptyList()
        SisrunWatch.configure(context, call.getString("url"), known, hidden)
        SisrunWatch.schedule(context)
        call.resolve()
    }

    /** The calendar's SisRUN workouts not known yet; with `tell`, the notification too (the app does it after its own sync). */
    @PluginMethod
    fun check(call: PluginCall) {
        val tell = call.getBoolean("tell", false) == true
        background.execute {
            val found = JSArray()
            for (workout in SisrunWatch.check(context, tell)) {
                found.put(JSObject().put("key", workout.key).put("date", workout.date.toString()).put("title", workout.title))
            }
            call.resolve(JSObject().put("found", found))
        }
    }
}
