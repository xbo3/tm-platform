package com.tm.bicall

import android.content.Context
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * Watches the phone's call state and emits lifecycle events tied to a specific
 * callId (the DB calls.id assigned by the server on dial). duration_sec is
 * measured from the moment the call goes offhook to when it goes idle —
 * matches what the TM policy treats as "actual talk time".
 *
 * Uses TelephonyCallback on API 31+ (non-deprecated path) and
 * PhoneStateListener on API 26-30 (app minSdk=26).
 */
class CallTracker(
    private val ctx: Context,
    private val onEvent: (Event) -> Unit,
) {
    sealed class Event {
        data class Ringing(val callId: Any?) : Event()
        data class Offhook(val callId: Any?) : Event()
        data class Idle(val callId: Any?, val durationSec: Int) : Event()
    }

    @Volatile private var activeCallId: Any? = null
    @Volatile private var offhookAt: Long = 0L
    @Volatile private var inOffhook: Boolean = false

    private val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private var cb: TelephonyCallback? = null
    private var legacy: PhoneStateListener? = null

    fun register() {
        if (Build.VERSION.SDK_INT >= 31) registerModern() else registerLegacy()
    }

    fun unregister() {
        if (Build.VERSION.SDK_INT >= 31) {
            cb?.let { tm.unregisterTelephonyCallback(it) }
            cb = null
        } else {
            legacy?.let { tm.listen(it, PhoneStateListener.LISTEN_NONE) }
            legacy = null
        }
    }

    fun attachCallId(id: Any) {
        activeCallId = id
        inOffhook = false
        offhookAt = 0L
    }

    // API 31+: TelephonyCallback.CallStateListener
    private fun registerModern() {
        val exec = Executors.newSingleThreadExecutor()
        val c = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) { handle(state) }
        }
        cb = c
        tm.registerTelephonyCallback(exec, c)
    }

    // API 26-30: deprecated PhoneStateListener (still supported)
    private fun registerLegacy() {
        val l = object : PhoneStateListener() {
            @Deprecated("pre-31 path")
            override fun onCallStateChanged(state: Int, phoneNumber: String?) { handle(state) }
        }
        legacy = l
        tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
    }

    private fun handle(state: Int) {
        val id = activeCallId
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                onEvent(Event.Ringing(id))
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (!inOffhook) {
                    inOffhook = true
                    offhookAt = System.currentTimeMillis()
                }
                onEvent(Event.Offhook(id))
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                val dur = if (offhookAt > 0) ((System.currentTimeMillis() - offhookAt) / 1000L).toInt() else 0
                onEvent(Event.Idle(id, dur))
                // reset for the next dial
                activeCallId = null
                inOffhook = false
                offhookAt = 0L
            }
        }
    }
}
