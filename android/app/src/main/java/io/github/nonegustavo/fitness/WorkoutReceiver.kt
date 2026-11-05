package io.github.nonegustavo.fitness

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The workout notification's buttons, its end-of-rest alarm and its swipe, also with the app closed. */
class WorkoutReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        WorkoutNotification.handle(context, intent)
    }
}
