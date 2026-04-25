FROM python:3.11-slim

# ffmpeg for audio decoding (m4a/mp3/opus/wav…)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache pip layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-warm the model so first request doesn't pay 30s cold start.
# Build arg so we can switch model without code edits. Default: small (~470MB).
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

COPY main.py .

# Railway provides $PORT. Bind 0.0.0.0.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
