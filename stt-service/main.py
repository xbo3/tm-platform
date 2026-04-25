"""
tm-stt-service — faster-whisper sidecar for tm-platform.

POST /transcribe (multipart `file`) → {ok, text, duration_sec, language, segments_count}
GET  /health                       → {ok, model, loaded, device}
GET  /                             → {service: "tm-stt", version}

Designed for Railway PRO (CPU-only). Lazy-loads model on first request.
Audio formats accepted: anything ffmpeg can decode (m4a/mp3/wav/opus/...).
"""
import os
import tempfile
import time
import logging
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("tm-stt")

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")  # tiny/base/small/medium/large-v3
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")        # Railway = cpu
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")  # int8 = lightest CPU
LANG_HINT = os.environ.get("WHISPER_LANG", "ko")
MAX_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(50 * 1024 * 1024)))  # 50MB

app = FastAPI(title="tm-stt-service", version="0.1.0")

_model = None
_load_error: Optional[str] = None


def _get_model():
    """Lazy-load faster-whisper model on first call. Cached process-wide."""
    global _model, _load_error
    if _model is not None:
        return _model
    if _load_error:
        raise RuntimeError(f"model previously failed to load: {_load_error}")
    try:
        from faster_whisper import WhisperModel
        log.info(f"loading faster-whisper model={MODEL_NAME} device={DEVICE} compute={COMPUTE_TYPE}")
        t0 = time.time()
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        log.info(f"model loaded in {time.time()-t0:.1f}s")
        return _model
    except Exception as e:
        _load_error = str(e)
        log.error(f"model load failed: {e}")
        raise


@app.get("/")
def root():
    return {"service": "tm-stt", "version": "0.1.0", "model_name": MODEL_NAME}


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "loaded": _model is not None,
        "load_error": _load_error,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe an uploaded audio file. Streams to a temp file then runs whisper."""
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, f"file too large: {len(raw)} > {MAX_BYTES}")

    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        model = _get_model()
        t0 = time.time()
        segments, info = model.transcribe(
            tmp_path,
            language=LANG_HINT,
            beam_size=1,           # CPU-friendly. beam=5 가 더 정확하지만 5x 느림.
            vad_filter=True,       # silence trim → 짧은 통화에서 처리 시간 단축
            vad_parameters={"min_silence_duration_ms": 500},
        )
        seg_list = list(segments)  # generator → list (실제 transcription)
        text = " ".join(s.text.strip() for s in seg_list).strip()
        elapsed = time.time() - t0
        log.info(
            f"transcribed {file.filename} bytes={len(raw)} "
            f"audio={info.duration:.1f}s wall={elapsed:.1f}s "
            f"lang={info.language}({info.language_probability:.2f}) chars={len(text)}"
        )
        return {
            "ok": True,
            "text": text,
            "duration_sec": info.duration,
            "language": info.language,
            "language_probability": info.language_probability,
            "segments_count": len(seg_list),
            "wall_sec": round(elapsed, 2),
            "model": MODEL_NAME,
        }
    except Exception as e:
        log.exception("transcribe failed")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
