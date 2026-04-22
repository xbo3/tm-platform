package com.tm.bicall

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Thin wrapper over MediaRecorder. One call → one file.
 *
 * Source strategy:
 *  - We try MediaRecorder.AudioSource.MIC. Capturing the remote leg would need
 *    VOICE_CALL which is privileged on modern Android; MIC records only the
 *    agent's side but is reliable across OEMs. STT on the remote leg will
 *    need a different capture channel (SIP server-side) in the future.
 *
 * File location: app cacheDir/call_<callId>_<ts>.m4a
 * After the WS upload completes the caller should delete the file.
 */
class Recorder(private val ctx: Context) {

    private var rec: MediaRecorder? = null
    private var currentFile: File? = null

    fun start(callId: Any?): File? {
        stopSilent()
        val file = File(ctx.cacheDir, "call_${callId ?: "x"}_${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(16_000)
            r.setAudioChannels(1)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(file.absolutePath)
            r.prepare()
            r.start()
            rec = r
            currentFile = file
            Log.i("bicall", "rec start → ${file.name}")
            return file
        } catch (e: Exception) {
            Log.e("bicall", "rec start failed", e)
            try { r.release() } catch (_: Exception) {}
            rec = null
            currentFile = null
            return null
        }
    }

    /** Returns the finalized file (may be null on error). Caller owns deletion. */
    fun stop(): File? {
        val r = rec ?: return null
        val f = currentFile
        try {
            r.stop()
        } catch (e: Exception) {
            Log.w("bicall", "rec stop failed (possibly too short)", e)
        } finally {
            try { r.release() } catch (_: Exception) {}
            rec = null
            currentFile = null
        }
        return f
    }

    private fun stopSilent() {
        try { rec?.stop() } catch (_: Exception) {}
        try { rec?.release() } catch (_: Exception) {}
        rec = null
        currentFile = null
    }
}
