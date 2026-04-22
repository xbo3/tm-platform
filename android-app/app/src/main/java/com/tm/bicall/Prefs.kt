package com.tm.bicall

import android.content.Context
import android.content.SharedPreferences

/**
 * Persistent device-side state: server URL + JWT + agent identity.
 * Kept in SharedPreferences so a reboot/app-kill doesn't require re-login.
 */
object Prefs {
    private const val FILE = "bicall_prefs"
    const val KEY_SERVER_URL = "server_url"   // e.g. https://tm-web-production.up.railway.app
    const val KEY_TOKEN = "jwt_token"
    const val KEY_AGENT_NAME = "agent_name"
    const val KEY_PHONE_ID = "phone_id"
    const val KEY_EMAIL = "email"

    fun get(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun clearSession(ctx: Context) {
        get(ctx).edit()
            .remove(KEY_TOKEN)
            .remove(KEY_AGENT_NAME)
            .remove(KEY_PHONE_ID)
            .apply()
    }

    fun isLoggedIn(ctx: Context): Boolean {
        val p = get(ctx)
        return !p.getString(KEY_TOKEN, null).isNullOrEmpty()
                && !p.getString(KEY_SERVER_URL, null).isNullOrEmpty()
    }
}
