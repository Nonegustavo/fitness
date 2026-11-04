package io.github.nonegustavo.fitness

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Receives the day's numbers from the web app (src/features/widget/sync.ts), already as text, keeps
 * them for the home-screen widget and redraws it.
 */
@CapacitorPlugin(name = "Widget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val editor = context.getSharedPreferences(QuickWidget.PREFS, Context.MODE_PRIVATE).edit()
        for (key in QuickWidget.KEYS) editor.putString(key, call.getString(key) ?: "")
        editor.apply()
        QuickWidget.refreshAll(context)
        call.resolve()
    }
}
