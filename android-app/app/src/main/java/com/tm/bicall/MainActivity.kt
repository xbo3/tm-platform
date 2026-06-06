package com.tm.bicall

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import android.view.Gravity
import android.view.ViewGroup.LayoutParams
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Device home screen. Connects to /ws/device, routes incoming `dial` commands
 * into the system dialer (ACTION_CALL), watches TelephonyManager for call
 * state transitions, and echoes call_state {ringing | offhook | idle, duration}
 * back to the server.
 *
 * The agent never taps a number on this screen — the web console drives.
 * This screen is a status board the phone holder can glance at.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val PERMS_REQ = 101
    }

    private lateinit var statusText: TextView
    private lateinit var logText: TextView
    private val logLines = ArrayDeque<String>()

    private var ws: WsClient? = null
    private var tracker: CallTracker? = null
    private var recorder: Recorder? = null
    @Volatile private var activePhoneNumber: String? = null
    private val uploadHttp = OkHttpClient.Builder()
        .callTimeout(60, TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!Prefs.isLoggedIn(this)) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 64, 40, 40)
        }
        setContentView(ScrollView(this).apply { addView(root) })

        TextView(this).apply {
            text = "bicall · 단말 대기 중"
            textSize = 22f
            setPadding(0, 0, 0, 16)
        }.also(root::addView)

        val prefs = Prefs.get(this)
        TextView(this).apply {
            text = "실장: ${prefs.getString(Prefs.KEY_AGENT_NAME, "?")}  ·  서버: ${prefs.getString(Prefs.KEY_SERVER_URL, "?")}"
            textSize = 12f
            setPadding(0, 0, 0, 24)
        }.also(root::addView)

        statusText = TextView(this).apply {
            text = "상태: 초기화 중"
            textSize = 16f
            setPadding(0, 0, 0, 24)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(statusText)

        Button(this).apply {
            text = "로그아웃"
            setOnClickListener { logoutAndExit() }
        }.also {
            root.addView(it, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        }

        TextView(this).apply {
            text = "\n이벤트 로그"
            textSize = 14f
            setPadding(0, 24, 0, 8)
        }.also(root::addView)

        logText = TextView(this).apply {
            text = ""
            textSize = 11f
        }
        root.addView(logText)

        ensurePermissions()
    }

    override fun onDestroy() {
        super.onDestroy()
        ws?.close()
        ws = null
        tracker?.unregister()
        tracker = null
        try { recorder?.stop(null)?.delete() } catch (_: Exception) {}
        recorder = null
    }

    private fun uploadRecording(callId: Int, file: File) {
        val prefs = Prefs.get(this)
        val server = prefs.getString(Prefs.KEY_SERVER_URL, null) ?: return
        val token = prefs.getString(Prefs.KEY_TOKEN, null) ?: return

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                file.name,
                RequestBody.create("audio/mp4".toMediaTypeOrNull(), file)
            )
            .build()
        val req = Request.Builder()
            .url("${server.trimEnd('/')}/api/recordings/$callId")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()

        uploadHttp.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w("bicall", "rec upload fail: ${e.message}")
                log("rec upload FAIL · ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val ok = response.isSuccessful
                    log("rec upload ${if (ok) "ok" else "FAIL ${response.code}"} · ${file.length()}B")
                    file.delete()
                }
            }
        })
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // 권한 결과와 무관하게 무조건 세션 시작 (예스/노 팝업 바이패스)
        startSession()
    }

    private fun ensurePermissions() {
        // 권한 팝업 절차를 우회하고 즉시 서버 연결 및 세션 구동
        startSession()
    }

    private fun startSession() {
        val prefs = Prefs.get(this)
        val server = prefs.getString(Prefs.KEY_SERVER_URL, null)
        val token = prefs.getString(Prefs.KEY_TOKEN, null)
        if (server.isNullOrEmpty() || token.isNullOrEmpty()) {
            logoutAndExit(); return
        }

        recorder = Recorder(this)

        tracker = CallTracker(this) { ev ->
            when (ev) {
                is CallTracker.Event.Ringing -> emitCallState(ev.callId, "ringing", 0)
                is CallTracker.Event.Offhook -> {
                    // Start recording once the call is actually connected; MIC source
                    // captures the agent's side reliably on every OEM.
                    val started = recorder?.start(ev.callId) != null
                    log("offhook · rec=${if (started) "on" else "off"}")
                    emitCallState(ev.callId, "offhook", 0)
                }
                is CallTracker.Event.Idle -> {
                    val phone = activePhoneNumber
                    activePhoneNumber = null
                    val file = recorder?.stop(phone)
                    emitCallState(ev.callId, "idle", ev.durationSec)
                    log("idle · duration=${ev.durationSec}s · callId=${ev.callId}")
                    // Best-effort upload, then delete local file. Happens off the main thread.
                    val callIdInt = (ev.callId as? Number)?.toInt()
                        ?: (ev.callId as? String)?.toIntOrNull()
                    if (file != null && file.length() > 0 && callIdInt != null) {
                        uploadRecording(callIdInt, file)
                    } else {
                        file?.delete()
                    }
                }
            }
        }.also { it.register() }

        ws = WsClient(server, token, object : WsClient.Listener {
            override fun onOpen() {
                setStatus("서버 연결됨")
                log("ws open")
            }
            override fun onClose(code: Int, reason: String) {
                setStatus("연결 끊김 ($code)")
                log("ws close · $code $reason")
            }
            override fun onError(t: Throwable) {
                setStatus("연결 오류: ${t.message ?: "unknown"}")
                log("ws err · ${t.message}")
            }
            override fun onMessage(obj: JSONObject) {
                handleServerFrame(obj)
            }
        }).also { it.connect() }
    }

    private fun handleServerFrame(obj: JSONObject) {
        when (obj.optString("type")) {
            "hello" -> {
                setStatus("서버 연결됨 · device=${obj.optString("deviceId")}")
                log("hello · deviceId=${obj.optString("deviceId")}")
            }
            "ping" -> { /* keepalive from server */ }
            "dial" -> {
                val callId = obj.opt("callId")
                val phone = obj.optString("phone")
                log("dial · $phone · callId=$callId")
                if (phone.isNullOrEmpty()) {
                    ws?.sendDialAck(callId, false, "no_phone")
                    return
                }
                tracker?.attachCallId(callId ?: "unknown")
                val ok = placeCall(phone)
                ws?.sendDialAck(callId, ok, if (ok) null else "call_intent_failed")
                if (!ok) setStatus("전화 실패")
            }
            "hangup" -> {
                log("hangup · callId=${obj.opt("callId")} (ignored — 사용자 수동 종료 필요)")
            }
            "sms_send" -> {
                val msgId = obj.opt("message_id")
                val phone = obj.optString("phone")
                val content = obj.optString("content")
                log("sms_send · $phone · message_id=$msgId")
                Thread { handleSmsSend(msgId, phone, content) }.start()
            }
            else -> Log.d("bicall", "unknown frame: $obj")
        }
    }

    private fun handleSmsSend(messageId: Any?, phone: String?, content: String?) {
        if (messageId == null || phone.isNullOrEmpty() || content.isNullOrEmpty()) {
            reportSmsResult(messageId, ok = false, error = "missing fields")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            reportSmsResult(messageId, ok = false, error = "SEND_SMS permission missing")
            return
        }
        try {
            val sms = android.telephony.SmsManager.getDefault()
            val parts = sms.divideMessage(content)
            if (parts.size == 1) {
                sms.sendTextMessage(phone, null, parts[0], null, null)
            } else {
                sms.sendMultipartTextMessage(phone, null, parts, null, null)
            }
            reportSmsResult(messageId, ok = true, error = null)
            log("sms sent · $phone")
        } catch (e: Exception) {
            Log.e("bicall", "sms send failed", e)
            reportSmsResult(messageId, ok = false, error = e.message ?: "send_failed")
        }
    }

    private fun reportSmsResult(messageId: Any?, ok: Boolean, error: String?) {
        val prefs = Prefs.get(this)
        val server = prefs.getString(Prefs.KEY_SERVER_URL, null) ?: return
        val token = prefs.getString(Prefs.KEY_TOKEN, null) ?: return
        val body = JSONObject().apply {
            put("message_id", messageId)
            put("ok", ok)
            if (error != null) put("error", error)
        }.toString()
        try {
            val req = Request.Builder()
                .url(server.trimEnd('/') + "/api/phone/sms-result")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
                .build()
            uploadHttp.newCall(req).execute().use { resp ->
                Log.i("bicall", "sms-result post → ${resp.code}")
            }
        } catch (e: Exception) {
            Log.w("bicall", "sms-result post failed: ${e.message}")
        }
    }

    private fun emitCallState(callId: Any?, state: String, durationSec: Int) {
        ws?.sendCallState(callId, state, durationSec)
    }

    private fun placeCall(phone: String): Boolean {
        return try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE)
                != PackageManager.PERMISSION_GRANTED
            ) {
                Toast.makeText(this, "CALL_PHONE 권한 없음", Toast.LENGTH_LONG).show()
                return false
            }
            activePhoneNumber = phone
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            setStatus("발신 · $phone")
            true
        } catch (e: Exception) {
            Log.e("bicall", "dial intent error", e)
            false
        }
    }

    private fun setStatus(s: String) {
        main.post { statusText.text = "상태: $s" }
    }

    private fun log(s: String) {
        val ts = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.KOREA)
            .format(java.util.Date())
        val line = "$ts  $s"
        main.post {
            logLines.addFirst(line)
            while (logLines.size > 40) logLines.removeLast()
            logText.text = logLines.joinToString("\n")
        }
    }

    private fun logoutAndExit() {
        Prefs.clearSession(this)
        ws?.close(); ws = null
        tracker?.unregister(); tracker = null
        startActivity(Intent(this, LoginActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        })
        finish()
    }
}
