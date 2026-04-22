package com.tm.bicall

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup.LayoutParams
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

/**
 * Login screen.
 * Server URL + email + password → POST /api/auth/login → store JWT + identity → MainActivity.
 * If already logged in, skips straight to MainActivity.
 */
class LoginActivity : AppCompatActivity() {

    private val http = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Prefs.isLoggedIn(this)) {
            goMain()
            return
        }

        val prefs = Prefs.get(this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
        }
        setContentView(ScrollView(this).apply { addView(root) })

        TextView(this).apply {
            text = "bicall · 실장 단말 로그인"
            textSize = 22f
            setPadding(0, 0, 0, 28)
        }.also(root::addView)

        val serverEdit = EditText(this).apply {
            hint = "서버 주소 (예: https://tm-web-production.up.railway.app)"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString(Prefs.KEY_SERVER_URL, "") ?: "")
        }
        root.addView(serverEdit)

        val emailEdit = EditText(this).apply {
            hint = "이메일 (agenta@tm.co.kr)"
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(prefs.getString(Prefs.KEY_EMAIL, "") ?: "")
        }
        root.addView(emailEdit)

        val pwEdit = EditText(this).apply {
            hint = "비밀번호"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(pwEdit)

        val status = TextView(this).apply {
            text = ""
            setPadding(0, 24, 0, 0)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(status)

        Button(this).apply {
            text = "로그인"
            textSize = 18f
            setOnClickListener {
                val server = serverEdit.text.toString().trim().trimEnd('/')
                val email = emailEdit.text.toString().trim()
                val pw = pwEdit.text.toString()
                if (server.isEmpty() || email.isEmpty() || pw.isEmpty()) {
                    status.text = "모든 필드 입력"
                    return@setOnClickListener
                }
                if (!server.startsWith("http://") && !server.startsWith("https://")) {
                    status.text = "서버 주소는 http(s):// 로 시작"
                    return@setOnClickListener
                }
                status.text = "로그인 중..."
                isEnabled = false
                doLogin(server, email, pw, status) { ok ->
                    runOnUiThread { isEnabled = true }
                    if (ok) {
                        runOnUiThread { goMain() }
                    }
                }
            }
        }.also {
            root.addView(it, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
                .apply { topMargin = 16 })
        }
    }

    private fun doLogin(server: String, email: String, pw: String, status: TextView, cb: (Boolean) -> Unit) {
        val payload = JSONObject().apply {
            put("email", email)
            put("password", pw)
        }.toString()

        val req = Request.Builder()
            .url("$server/api/auth/login")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread { status.text = "연결 실패: ${e.message}" }
                cb(false)
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        runOnUiThread { status.text = "로그인 실패 (${response.code}): $body" }
                        cb(false); return
                    }
                    try {
                        val json = JSONObject(body)
                        val token = json.optString("token", "")
                        val user = json.optJSONObject("user")
                        val agentName = user?.optString("agent_name", "") ?: ""
                        if (token.isEmpty()) {
                            runOnUiThread { status.text = "토큰 누락 — 응답: $body" }
                            cb(false); return
                        }
                        Prefs.get(this@LoginActivity).edit()
                            .putString(Prefs.KEY_SERVER_URL, server)
                            .putString(Prefs.KEY_TOKEN, token)
                            .putString(Prefs.KEY_EMAIL, email)
                            .putString(Prefs.KEY_AGENT_NAME, agentName)
                            .apply()
                        Log.i("bicall", "login ok · agent=$agentName")
                        cb(true)
                    } catch (e: Exception) {
                        runOnUiThread { status.text = "응답 파싱 실패: ${e.message}" }
                        cb(false)
                    }
                }
            }
        })
    }

    private fun goMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
