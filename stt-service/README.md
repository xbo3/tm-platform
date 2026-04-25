# tm-stt-service

faster-whisper sidecar for tm-platform. Runs as a separate Railway service alongside `tm-web`.

## Endpoints

- `GET  /`           — service info
- `GET  /health`     — `{ok, model, loaded, device}`
- `POST /transcribe` — multipart `file` → `{ok, text, duration_sec, language, ...}`

## Env

| Var | Default | Notes |
|---|---|---|
| `PORT` | 8000 | Railway injects |
| `WHISPER_MODEL` | `small` | tiny/base/small/medium/large-v3 |
| `WHISPER_DEVICE` | `cpu` | Railway is CPU-only |
| `WHISPER_COMPUTE` | `int8` | int8 is lightest CPU mode |
| `WHISPER_LANG` | `ko` | language hint (Korean) |
| `MAX_AUDIO_BYTES` | 52428800 | 50MB upload cap |

## Local dev

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# test
curl -F "file=@sample.m4a" http://localhost:8000/transcribe
```

## Notes

- First request pays ~5–30s for model download + load (cold). Dockerfile pre-warms during build to avoid this on Railway.
- CPU transcription speed: `small` model ~5–10s per minute of audio. `medium` ~15–30s/min.
- VAD trims silence → faster on partial-speech calls.
- For Korean, `small` ≈ 80% accuracy, `medium` ≈ 90%. Upgrade if classification accuracy is too low.

## Switching model

Set Railway service env `WHISPER_MODEL=medium` and redeploy. Dockerfile build arg pre-downloads it.
