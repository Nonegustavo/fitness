package io.github.nonegustavo.fitness

import androidx.core.content.pm.PackageInfoCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Tells the web app (src/ota) which APK it runs in: the native level it was built with
 * (native-level.json, through build.gradle) decides whether a downloaded web version can run here.
 */
@CapacitorPlugin(name = "AppInfo")
class AppInfoPlugin : Plugin() {
    @PluginMethod
    fun info(call: PluginCall) {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val result = JSObject()
        result.put("nativeLevel", context.resources.getInteger(R.integer.native_level))
        result.put("versionCode", PackageInfoCompat.getLongVersionCode(packageInfo))
        result.put("versionName", packageInfo.versionName ?: "")
        call.resolve(result)
    }
}
