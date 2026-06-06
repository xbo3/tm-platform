package com.tm.bicall

import android.content.Context
import android.os.Environment
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Grabs the system's native voice call recording from Samsung Galaxy's Call folder.
 * Instead of direct MediaRecorder MIC capture, this watches /sdcard/Recordings/Call
 * for the newly generated [phone]_[YYMMDD]_[HHMMSS].m4a file, copies it to app cache
 * for a safe upload, and leaves the system original intact.
 */
class Recorder(private val ctx: Context) {

    fun start(callId: Any?): Boolean {
        // No-op for native recording, return true to signify tracker path active
        Log.i("bicall", "system recording watcher active for callId=$callId")
        return true
    }

    /**
     * Polls the Galaxy call recording folder for the specified phone number,
     * copies the match to app cache, and returns it.
     */
    fun stop(phone: String?): File? {
        if (phone.isNullOrEmpty()) return null
        
        // Clean phone format: strip dash for match, keep dash version as fallback
        val cleanPhone = phone.replace("[^0-9]".toRegex(), "")
        val formattedPhone = phone.trim()

        val candidateDirs = listOf(
            File("/storage/emulated/0/Recordings/Call"),
            File(Environment.getExternalStorageDirectory(), "Recordings/Call"),
            File("/sdcard/Recordings/Call")
        )

        var matchedFile: File? = null
        val maxAttempts = 6 // 3 seconds total (500ms * 6)
        
        Log.i("bicall", "starting system recording folder scan for: $cleanPhone / $formattedPhone")

        for (attempt in 1..maxAttempts) {
            for (dir in candidateDirs) {
                if (!dir.exists() || !dir.isDirectory) continue
                
                val files = dir.listFiles() ?: continue
                // Sort by last modified descending
                val sorted = files.filter { f ->
                    f.isFile && (f.name.endsWith(".m4a") || f.name.endsWith(".mp3") || f.name.endsWith(".amr"))
                }.sortedByDescending { it.lastModified() }

                for (f in sorted) {
                    val name = f.name
                    val isMatch = name.contains(cleanPhone) || name.contains(formattedPhone) ||
                                 (cleanPhone.length >= 8 && name.contains(cleanPhone.substring(cleanPhone.length - 8)))
                    
                    // File must be modified within the last 15 seconds to prevent grabbing old calls
                    val ageMs = System.currentTimeMillis() - f.lastModified()
                    if (isMatch && ageMs < 15000) {
                        matchedFile = f
                        break
                    }
                }
                if (matchedFile != null) break
            }
            
            if (matchedFile != null) {
                Log.i("bicall", "found match: ${matchedFile.name} on attempt $attempt")
                break
            }
            
            try { Thread.sleep(500) } catch (_: InterruptedException) {}
        }

        if (matchedFile == null) {
            Log.w("bicall", "no native call recording found for: $phone")
            return null
        }

        // Copy to app cache to prevent locking/modifying the original system file
        try {
            val dest = File(ctx.cacheDir, "native_call_${System.currentTimeMillis()}_${matchedFile.name}")
            FileInputStream(matchedFile).use { input ->
                FileOutputStream(dest).use { output ->
                    input.copyTo(output)
                }
            }
            Log.i("bicall", "safely copied ${matchedFile.name} -> ${dest.name} (${dest.length()} bytes)")
            return dest
        } catch (e: Exception) {
            Log.e("bicall", "failed to copy system recording file", e)
            return null
        }
    }
}
