package io.github.nonegustavo.fitness

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The workout notification's bridge to the web app (src/features/training/workoutNotification.ts):
 * it takes the workout's state, hands back what was done in the notification, and tells the app when
 * a button is tapped while it runs. The notification itself is WorkoutNotification.
 */
@CapacitorPlugin(name = "Workout")
class WorkoutPlugin : Plugin() {
    override fun load() {
        current = this
    }

    override fun handleOnDestroy() {
        if (current === this) current = null
    }

    // The same moments as the web app's "pause" and "resume" events, which decide who rings at the
    // end of the rest: the app's bar on screen, the notification off it.
    override fun handleOnResume() {
        WorkoutNotification.onScreen = true
        WorkoutNotification.dismissAlert(context)
    }

    override fun handleOnPause() {
        WorkoutNotification.onScreen = false
    }

    /** { state, ack }: the workout as the app has it, and the last queued action it applied. */
    @PluginMethod
    fun show(call: PluginCall) {
        val state = call.getObject("state")
        if (state == null) {
            call.reject("Estado do treino ausente")
            return
        }
        // optLong: a small number arrives as an Integer, which PluginCall.getLong ignores.
        WorkoutNotification.show(context, state, call.data.optLong("ack", 0))
        call.resolve()
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        WorkoutNotification.clear(context)
        call.resolve()
    }

    /** { actions }: what was done in the notification and not acknowledged yet, oldest first. */
    @PluginMethod
    fun drain(call: PluginCall) {
        call.resolve(JSObject().put("actions", WorkoutNotification.queued(context)))
    }

    private fun emitAction() {
        notifyListeners("workoutAction", JSObject())
    }

    companion object {
        @Volatile
        private var current: WorkoutPlugin? = null

        /** Tells the app, when it's running, that the notification has something for it. */
        fun notifyAction() {
            current?.emitAction()
        }
    }
}
