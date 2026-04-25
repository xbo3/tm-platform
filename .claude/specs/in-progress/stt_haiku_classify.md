# SPEC: STT + Claude Haiku Classify 실연결

작성: 2026-04-25 / 오사장 (Opus 4.7)
요청자: 우팀장
배경: README v8 / `routes/classify.js` 가 duration 기반 mock + STT placeholder. 실 통화 분류 0%.

## 목표

통화 종료 → 녹음 업로드 → STT(faster-whisper) 텍스트 추출 → Claude Haiku 4.5 분류 → DB 저장 → 고객 status 동기화.

## Why (우팀장 결정)

- 통화량: 5명 × 일 200콜 = 1000콜/일, 연결콜 1/3 = 333콜/일 STT 필요
- 평균 통화 2분 가정 = 19,980분/월
- OpenAI Whisper API: $120/월 vs faster-whisper 자체 호스팅 ~$10/월 → **자체 호스팅 채택 (월 ₩146,000 절약)**
- 동시 통화 5max + 사후 분류 → 1~2분 처리 지연 OK

## 변경 대상

### A. 신규: `tm-platform/stt-service/`
별도 Python sidecar (Railway 새 서비스 `tm-stt-service`).

```
stt-service/
├── Dockerfile
├── requirements.txt
├── main.py          # FastAPI POST /transcribe
└── README.md
```

**Dockerfile**: python:3.11-slim + ffmpeg + faster-whisper + uvicorn
**main.py**: FastAPI app, lazy-load faster-whisper (small 또는 medium 한국어), `POST /transcribe` (multipart `file`) → `{ok, text, duration_sec, language}`. `GET /health` → `{ok, model, loaded}`.
**모델**: `small` (470MB, 한국어 80% 정확도, CPU 1분 처리) 우선. 품질 부족하면 `medium` (1.5GB, 한국어 90%, CPU 3분 처리)로 업그레이드.

### B. 수정: `tm-platform/server/routes/classify.js`
- mock duration 분기 제거
- 호출 chain: 녹음 path 조회 → tm-stt POST `/transcribe` → STT 텍스트 받음 → Anthropic Haiku 호출 → JSON 분류 결과 받음 → DB upsert
- 실패 시 fallback: STT 실패 → mock duration 분기 유지 (graceful degradation)

### C. 수정: `tm-platform/package.json`
- `@anthropic-ai/sdk` 추가 (^0.30.0 또는 최신)

### D. Railway env 추가
- `STT_SERVICE_URL`: tm-stt-service 내부 URL (예: `https://tm-stt-service-production.up.railway.app`)
- `ANTHROPIC_API_KEY`: 자비스2와 공유
- `STT_TIMEOUT_MS`: 기본 120000 (2분, 큐 지연 감수)

## Haiku Prompt (요지)

```
시스템: 한국어 텔레마케팅 통화 STT 텍스트를 읽고 6단계 분류.
   결번 / 휴면 / 부재 / 거절 / 재콜 / 긍정
   재콜이면 시간(ISO) 추출. 긍정이면 사인(주소/계좌/상담) 추출.
   JSON only: {category, confidence, recall_at?, positive_signals?, summary}

사용자: STT 텍스트: """{stt_text}"""
```

모델: `claude-haiku-4-5-20251001`. max_tokens 500. temp 0.1.

## 검증 (CLAUDE.md 8단계)

1. ✅ 파일 수정 — git diff 확인
2. ✅ 문법 — `node -c server/routes/classify.js`, `python -c "import ast; ast.parse(open('stt-service/main.py').read())"`
3. ✅ Railway 배포 — `railway up` 또는 git push 후 빌드 성공 확인
4. ✅ 배포 반영 — `curl tm-stt-service/health` 200 + `curl tm-web/api/health` 200
5. ✅ E2E — 실 녹음 1건 업로드 → `POST /api/classify/:call_id` → `category` 정상 반환 + DB `call_classifications` row 추가
6. ✅ STT 폴백 — STT 다운 시 mock 분기 그대로 동작
7. ✅ Haiku 폴백 — Haiku 다운 시 STT 텍스트만 저장 + category=null

## 롤백

- 새 서비스이므로 환경변수 `STT_SERVICE_URL` 비우면 mock 분기 fallback
- classify.js 변경은 단일 커밋 → revert 즉시
- tm-stt-service 는 별도 서비스 → 끄거나 죽여도 tm-web 영향 0

## 예상 시간

- A (sidecar 구현 + Dockerfile): 1.5h
- B (classify chain + Haiku prompt): 1h
- D (Railway 새 서비스 + env): 1h
- 검증 + 폴백 테스트: 1h
- **총 4.5h**

## Phase 진행

1. spec 박음 ✅ (이 문서)
2. tm-stt-service 폴더 + 코드 작성
3. classify.js 수정
4. 로컬 lint + 커밋
5. Railway 새 서비스 생성 + push + 빌드 확인
6. tm-web 배포
7. E2E 1건 + 보고
8. 본 문서 → `plans-executed/` 이동
