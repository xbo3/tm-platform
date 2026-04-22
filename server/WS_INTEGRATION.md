# WS Integration Smoke (commits 1–6)

Recap of what lives on main after commit ⑥, how to exercise it end-to-end
against a real Railway deployment, and what was deliberately left as TODO.

## Surface

| Layer | Entry point | Notes |
|---|---|---|
| Server WS | `/ws/device?token=<jwt>` | agent role + phone_id required |
| Server WS | `/ws/console?token=<jwt>` | any role (client-side feature filters by role) |
| Server HTTP | `POST /api/recordings/:call_id` (multer) | agent may upload own calls only |
| Server HTTP | `GET  /api/recordings/file/:id` | center/super; 410 on expired |
| Server HTTP | `POST /api/classify/:call_id` | mock Haiku — classify.js §TODO |
| DB | `customers.unmasked_at/_by`, `status CHECK` expanded | migration 003_ws_lock.sql (idempotent) |
| Cron | recordings cleanup every 1h | 7-day retention per policy §7 |
| Android | `com.tm.bicall` | APK from `android-app/` |

## WS message schema

### console → server
- `{type:"dial", customer_id}` → runs claim tx, forwards `dial` to device, echoes `dial_started`
- `{type:"hangup", callId}` → forwards to device (device may or may not honour, OEM dependent)
- `{type:"ping"}` → `{type:"pong", t}`

### device → server
- `{type:"call_state", state, duration, number?, recording_url?, callId?}`
- `{type:"dial_ack", callId, ok, error?}`
- `{type:"ping"}` → `{type:"pong"}`

### server → console
- `{type:"hello", role:"console", agentId, deviceId, deviceOnline}`
- `{type:"device_presence", deviceId, online}`
- `{type:"dial_started", callId, customer_id, phone}`
- `{type:"dial_ack", deviceId, callId, ok, error}`
- `{type:"call_state", deviceId, callId, state, duration, number, recording_url}`
- `{type:"error", error, ...}`

### server → device
- `{type:"hello", role:"device", deviceId, agentId}`
- `{type:"dial", callId, phone, customer_id}`
- `{type:"hangup", callId}`

## Local smokes (ran on every commit)

```
node server/ws-smoke.mjs        # 10 assertions — WS relay paths
node server/ws-lock-smoke.mjs   # 13 assertions — claim tx + race path (mock pg)
```

Both must show `0 failed` before a commit is staged.

## End-to-end flow on a real deployment

1. Seed DB (initDB runs migrations 002 + 003; super/center/5 agents inserted
   if users table empty).
2. `center@tm.co.kr / center123` — upload a 2-row DB (ManagerView), press 분배
   confirm-modal.
3. `agenta@tm.co.kr / agent123` — open AgentView:
   - status strip shows 서버=connected, 폰=waiting until phone signs in
4. Install `bicall` APK on a phone (debug APK at
   `android-app/app/build/outputs/apk/debug/app-debug.apk`).
   - Login with same agent credentials + server URL
   - Phone LED flips to online in the web UI
5. Web: press NEXT CALL. Expect:
   - `/api/calls/next` returns a customer row
   - WS `dial` → server lock tx → `dial_started{callId, phone}` echoed back
   - Phone gets `dial{callId, phone}` → opens system dialer → call is placed
   - Phone state → `call_state{ringing|offhook|idle, duration}` round-trips
   - On idle: duration snaps, recording uploads via multipart POST
6. Web: agent marks result → `PUT /api/calls/:id/end` → `/classify/:id` mock
   returns ai_category.

## Known limitations (deliberate — not bugs)

- MIC-only recording (remote leg uncaptured; needs SIP-side capture)
- `hangup` frame is advisory; OEM restrictions prevent cross-app force-end
- `/api/calls/start` legacy REST still exists but unused; removing it is a
  separate breaking-change commit once we're sure no external caller
- Haiku real classify is stubbed; duration-based mock is fine for the loop

## Environment variables

| Name | Where | Default |
|---|---|---|
| `DATABASE_URL` | Railway | (required) |
| `JWT_SECRET` | Railway (set to a real secret) | `tm-platform-secret-2026` (dev fallback) |
| `RECORDINGS_DIR` | Railway (optional) | `./recordings` |
| `PORT` | Railway auto | 3000 |

## Checklist before `git push origin main`

- [x] ws-smoke 10/10
- [x] ws-lock-smoke 13/13
- [x] `node --check server.js` OK
- [x] Android assembleDebug OK
- [x] Vite build OK
- [x] migration 003 idempotent (tested locally via rerun)
- [x] recordings cron actually unlinks files (no longer path-only log)
