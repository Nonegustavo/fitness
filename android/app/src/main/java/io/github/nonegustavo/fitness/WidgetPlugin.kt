package io.github.nonegustavo.fitness

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * Receives the day's numbers from the web app (src/features/widget/sync.ts), keeps them for the
 * home-screen widget and redraws it. Texts, the bars' fill and flags are all kept as text.
 */
@CapacitorPlugin(name = "Widget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val editor = context.getSharedPreferences(QuickWidget.PREFS, Context.MODE_PRIVATE).edit()
        for (key in QuickWidget.KEYS) {
            val value = call.data.opt(key)
            editor.putString(key, if (value == null || value == JSONObject.NULL) "" else value.toString())
        }
        editor.apply()
        QuickWidget.refreshAll(context)
        call.resolve()
    }
}
