package com.tm.bicall

import android.util.Log
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Wraps the OkHttp WebSocket connecting to `${serverUrl}/ws/device?token=...`.
 * Reconnects automatically on failure with exponential-ish backoff (2s..30s).
 *
 * Incoming messages are parsed as JSON and dispatched to `listener`.
 * Outgoing helpers expose the device-side vocabulary:
 *   sendCallState(callId, state, duration, number?)
 *   sendDialAck(callId, ok, error?)
 */
class WsClient(
    private val serverUrl: String,       // https://host or http://host
    private val token: String,
    private val listener: Listener,
) {

    interface Listener {
        fun onOpen() {}
        fun onClose(code: Int, reason: String) {}
        fun onError(t: Throwable) {}
        fun onMessage(obj: JSONObject)   // parsed; raw text ignored
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)   // streaming
        .build()

    @Volatile private var ws: WebSocket? = null
    @Volatile private var closed = false
    @Volatile private var attempt = 0

    fun connect() {
        closed = false
        dial()
    }

    fun close() {
        closed = true
        ws?.close(1000, "client closed")
        ws = null
    }

    fun send(obj: JSONObject): Boolean {
        val w = ws ?: return false
        return w.send(obj.toString())
    }

    fun sendCallState(callId: Any?, state: String, durationSec: Int, number: String? = null, recordingUrl: String? = null) {
        val o = JSONObject()
            .put("type", "call_state")
            .put("state", state)
            .put("duration", durationSec)
        if (callId != null) o.put("callId", callId)
        if (number != null) o.put("number", number)
        if (recordingUrl != null) o.put("recording_url", recordingUrl)
        send(o)
    }

    fun sendDialAck(callId: Any?, ok: Boolean, error: String? = null) {
        val o = JSONObject().put("type", "dial_ack").put("ok", ok)
        if (callId != null) o.put("callId", callId)
        if (error != null) o.put("error", error)
        send(o)
    }

    // ---- internals ----

    private fun dial() {
        if (closed) return
        val wsUrl = serverUrl
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
            .trimEnd('/') + "/ws/device?token=$token"

        val req = Request.Builder().url(wsUrl).build()
        Log.i("bicall", "ws connect → $wsUrl")
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                attempt = 0
                listener.onOpen()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    listener.onMessage(JSONObject(text))
                } catch (e: Exception) {
                    Log.w("bicall", "non-json ws frame: ${e.message}")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                listener.onClose(code, reason)
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                listener.onError(t)
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (closed) return
        val delayMs = (2000L * (1L shl minOf(attempt, 4))).coerceAtMost(30_000L)
        attempt++
        Thread {
            try { Thread.sleep(delayMs) } catch (_: InterruptedException) {}
            if (!closed) dial()
        }.also { it.isDaemon = true }.start()
    }
}
