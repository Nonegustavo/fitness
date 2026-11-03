package io.github.nonegustavo.fitness

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import kotlin.reflect.KClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Read-only bridge to Health Connect for the web app (src/features/healthconnect): the scale's
 * body measurements and the watch's sleep stages. Names match the TypeScript side.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    private val bodyTypes: Map<String, KClass<out Record>> = mapOf(
        "weight" to WeightRecord::class,
        "bodyFat" to BodyFatRecord::class,
        "leanMass" to LeanBodyMassRecord::class,
        "boneMass" to BoneMassRecord::class,
        "bodyWater" to BodyWaterMassRecord::class,
        "bmr" to BasalMetabolicRateRecord::class,
    )

    private val readPermissions: Map<String, String> =
        (bodyTypes + ("sleep" to SleepSessionRecord::class)).mapValues { HealthPermission.getReadPermission(it.value) }

    override fun handleOnDestroy() {
        scope.cancel()
    }

    @PluginMethod
    fun availability(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun checkAccess(call: PluginCall) = launchFor(call) { call.resolve(grantedAccess()) }

    /** Opens Health Connect's permission screen for every type, plus history when the phone has it. */
    @PluginMethod
    fun requestAccess(call: PluginCall) {
        val permissions = readPermissions.values.toMutableSet()
        if (historyAvailable()) permissions += HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)
        startActivityForResult(call, intent, "afterAccessRequest")
    }

    @ActivityCallback
    private fun afterAccessRequest(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        launchFor(call) { call.resolve(grantedAccess()) }
    }

    /** Body measurements in [from, to] (ms), one sample per record, any app that wrote them. */
    @PluginMethod
    fun readBody(call: PluginCall) = launchFor(call) {
        val range = range(call)
        val granted = client.permissionController.getGrantedPermissions()
        val samples = JSArray()
        for ((type, recordType) in bodyTypes) {
            if (readPermissions[type] !in granted) continue
            for (record in readAll(recordType, range)) samples.put(bodySample(type, record))
        }
        call.resolve(JSObject().put("samples", samples))
    }

    /** Sleep sessions that end in [from, to] (ms), each with its stages. */
    @PluginMethod
    fun readSleep(call: PluginCall) = launchFor(call) {
        val sessions = JSArray()
        if (readPermissions["sleep"] in client.permissionController.getGrantedPermissions()) {
            for (session in readAll(SleepSessionRecord::class, range(call))) {
                val stages = JSArray()
                for (stage in session.stages) {
                    stages.put(
                        JSObject()
                            .put("start", stage.startTime.toEpochMilli())
                            .put("end", stage.endTime.toEpochMilli())
                            .put("stage", stage.stage),
                    )
                }
                sessions.put(
                    JSObject()
                        .put("id", session.metadata.id)
                        .put("start", session.startTime.toEpochMilli())
                        .put("end", session.endTime.toEpochMilli())
                        .put("origin", session.metadata.dataOrigin.packageName)
                        .put("stages", stages),
                )
            }
        }
        call.resolve(JSObject().put("sessions", sessions))
    }

    /** Runs a Health Connect call off the bridge thread; a failure rejects the JS promise. */
    private fun launchFor(call: PluginCall, block: suspend () -> Unit) {
        scope.launch {
            try {
                block()
            } catch (error: Exception) {
                call.reject(error.message ?: error.toString())
            }
        }
    }

    private fun historyAvailable(): Boolean =
        client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    private suspend fun grantedAccess(): JSObject {
        val granted = client.permissionController.getGrantedPermissions()
        val types = JSArray()
        for ((type, permission) in readPermissions) if (permission in granted) types.put(type)
        return JSObject()
            .put("granted", types)
            .put("history", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted)
            .put("historyAvailable", historyAvailable())
    }

    private fun range(call: PluginCall): TimeRangeFilter =
        TimeRangeFilter.between(Instant.ofEpochMilli(millis(call, "from")), Instant.ofEpochMilli(millis(call, "to")))

    // Epoch milliseconds arrive as a Long, which PluginCall.getDouble doesn't convert; read any number.
    private fun millis(call: PluginCall, name: String): Long =
        (call.data.opt(name) as? Number)?.toLong() ?: throw IllegalArgumentException("Faltou o período ($name).")

    private suspend fun <T : Record> readAll(type: KClass<T>, range: TimeRangeFilter): List<T> {
        val records = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(type, range, pageToken = pageToken))
            records += response.records
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    private fun bodySample(type: String, record: Record): JSObject {
        val (time, value) = when (record) {
            is WeightRecord -> record.time to record.weight.inKilograms
            is BodyFatRecord -> record.time to record.percentage.value
            is LeanBodyMassRecord -> record.time to record.mass.inKilograms
            is BoneMassRecord -> record.time to record.mass.inKilograms
            is BodyWaterMassRecord -> record.time to record.mass.inKilograms
            is BasalMetabolicRateRecord -> record.time to record.basalMetabolicRate.inKilocaloriesPerDay
            else -> throw IllegalStateException("Unexpected record ${record::class.simpleName}")
        }
        return JSObject()
            .put("type", type)
            .put("id", record.metadata.id)
            .put("time", time.toEpochMilli())
            .put("value", value)
            .put("origin", record.metadata.dataOrigin.packageName)
    }
}
