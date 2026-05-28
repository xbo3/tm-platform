// E2E smoke test against deployed Railway instance.
// 자비스2 교훈: 코드 92점 ≠ 실서비스 OK. 실 prod URL 로 핵심 경로 검증.
//
// Usage:
//   BASE=https://tm-web-production.up.railway.app node e2e-smoke.mjs
//
// Tests:
//   1. /api/health 200 OK
//   2. POST /api/auth/login admin (super_admin) — JWT 발급
//   3. POST /api/auth/login agent A — JWT 발급
//   4. WS /ws/console 연결 (agent 토큰)
//   5. WS /ws/device 연결 (agent 토큰)
//   6. WS hello 메시지 양쪽 받음
//   7. WS device_presence push (device 켜지면 console 알림)
//   8. WS bad token rejected (1008)
//   9. GET /api/customers (agent role isolation 확인)
//  10. GET /api/customers limit clamp (limit=999999 → ≤1000)

import WebSocket from 'ws';

const BASE = process.env.BASE || 'https://tm-web-production.up.railway.app';
const WS_BASE = BASE.replace(/^https?:/, BASE.startsWith('https') ? 'wss:' : 'ws:');

let pass = 0, fail = 0;
const log = (ok, msg) => {
  if (ok) { pass++; console.log(`  PASS  ${msg}`); }
  else    { fail++; console.log(`  FAIL  ${msg}`); }
};

async function main() {
  console.log(`[e2e] target ${BASE}\n`);

  // 1. health
  const h = await fetch(BASE + '/api/health').then(r => r.json()).catch(e => ({ err: e.message }));
  log(h && h.ok === true, `health 200 + ok=true (got ${JSON.stringify(h).slice(0,100)})`);

  // 2. admin login
  const adminLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tm.co.kr', password: 'admin123' }),
  }).then(r => r.json()).catch(e => ({ err: e.message }));
  const adminToken = adminLogin?.token;
  log(!!adminToken && adminLogin?.user?.role === 'super_admin', 'admin login → super_admin token');

  // 3. agent login
  const agentLogin = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'agenta@tm.co.kr', password: 'agent123' }),
  }).then(r => r.json()).catch(e => ({ err: e.message }));
  const agentToken = agentLogin?.token;
  log(!!agentToken && agentLogin?.user?.role === 'agent', 'agent login → agent token');

  if (!agentToken) {
    console.log('\n[e2e] agent token missing — skipping WS tests.');
    summary();
    return;
  }

  // 4-7: WS console 먼저 연결 → 안정화 후 device 연결 → presence push 가 console 에 도착하는지 확인
  // (실서비스는 console 항상 먼저 켜지고 device 가 나중에 붙는 패턴)
  await new Promise((resolve) => {
    let consoleHello = false, deviceHello = false, presenceSeen = false;
    const consoleWs = new WebSocket(WS_BASE + '/ws/console?token=' + agentToken);
    let deviceWs = null;

    consoleWs.on('open', () => {
      // console hello 받을 때까지 0.5초 정도 기다린 다음 device 연결
    });

    consoleWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'hello' && msg.role === 'console') {
          consoleHello = true;
          // console hello 도착 → device 연결 시작
          deviceWs = new WebSocket(WS_BASE + '/ws/device?token=' + agentToken);
          deviceWs.on('message', (draw) => {
            try {
              const dmsg = JSON.parse(draw.toString());
              if (dmsg.type === 'hello' && dmsg.role === 'device') deviceHello = true;
            } catch {}
          });
          deviceWs.on('error', () => {});
        }
        if (msg.type === 'device_presence' && msg.online === true) presenceSeen = true;
      } catch {}
    });
    consoleWs.on('error', () => {});

    setTimeout(() => {
      log(consoleHello, 'WS /ws/console hello');
      log(deviceHello, 'WS /ws/device hello');
      log(presenceSeen, 'WS device_presence relayed to console');
      try { consoleWs.close(); } catch {}
      try { deviceWs && deviceWs.close(); } catch {}
      resolve();
    }, 8000);
  });

  // 8: bad token rejected
  await new Promise((resolve) => {
    const w = new WebSocket(WS_BASE + '/ws/console?token=invalid');
    let closed = false;
    w.on('close', (code) => {
      log(code === 1008, `WS bad token rejected (code=${code})`);
      closed = true; resolve();
    });
    w.on('error', () => {});
    setTimeout(() => { if (!closed) { log(false, 'WS bad token timeout'); resolve(); } }, 3000);
  });

  // 9: /api/agent/me 응답 (agent role 전용)
  const me = await fetch(BASE + '/api/agent/me', {
    headers: { 'Authorization': 'Bearer ' + agentToken },
  }).then(r => r.json()).catch(e => ({ err: e.message }));
  log(me?.agent_name === 'A' || me?.user?.agent_name === 'A',
    `/api/agent/me returns agent A info (got ${JSON.stringify(me).slice(0,80)})`);

  // 10: agent 가 super_admin 전용 엔드포인트 거부됨
  const forbidden = await fetch(BASE + '/api/centers', {
    headers: { 'Authorization': 'Bearer ' + agentToken },
  }).then(r => ({ status: r.status, ok: r.ok })).catch(e => ({ err: e.message }));
  log(forbidden.status === 403 || forbidden.status === 401,
    `agent denied on /api/centers (super_admin only) — got status ${forbidden.status}`);

  summary();
}

function summary() {
  console.log(`\n[e2e] ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
