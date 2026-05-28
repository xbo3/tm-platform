package com.tm.bicall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * SMS_RECEIVED 브로드캐스트 핸들러.
 * 멀티파트 SMS 를 originatingAddress 별로 합쳐 /api/phone/inbox 로 POST.
 *
 * JWT 토큰은 Prefs 에서 읽어와 Authorization 헤더로 전송.
 * 권한 부족(REGISTRATION_DELAYED, 토큰 만료 등) 시는 재시도하지 않음 — 단순 fire-and-forget.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (msgs.isEmpty()) return

        // 멀티파트 합치기 (sender 별)
        val bySender = HashMap<String, StringBuilder>()
        val tsBySender = HashMap<String, Long>()
        for (m in msgs) {
            val from = m.originatingAddress ?: continue
            val sb = bySender.getOrPut(from) { StringBuilder() }
            sb.append(m.messageBody ?: "")
            tsBySender[from] = m.timestampMillis
        }
        if (bySender.isEmpty()) return

        val prefs = Prefs.get(context)
        val server = prefs.getString(Prefs.KEY_SERVER_URL, null) ?: return
        val token = prefs.getString(Prefs.KEY_TOKEN, null) ?: return

        val arr = JSONArray()
        for ((from, body) in bySender) {
            val o = JSONObject()
                .put("from", from)
                .put("body", body.toString())
            tsBySender[from]?.let { o.put("ts_ms", it) }
            arr.put(o)
        }
        val root = JSONObject().put("messages", arr).toString()

        Thread {
            try {
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .callTimeout(15, TimeUnit.SECONDS)
                    .build()
                val req = Request.Builder()
                    .url(server.trimEnd('/') + "/api/phone/inbox")
                    .addHeader("Authorization", "Bearer $token")
                    .addHeader("Content-Type", "application/json")
                    .post(root.toRequestBody("application/json".toMediaTypeOrNull()))
                    .build()
                client.newCall(req).execute().use { resp ->
                    Log.i("bicall.SmsReceiver", "inbox post → ${resp.code}")
                }
            } catch (e: Exception) {
                Log.w("bicall.SmsReceiver", "inbox post failed: ${e.message}")
            }
        }.start()
    }
}
