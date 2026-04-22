// WS relay smoke test — isolated from the full server boot chain (no DB needed).
// Spins a throwaway HTTP server, attaches attachWs(), opens device + console
// sockets with minted JWTs, and exercises the dial / call_state relay paths.
//
// Usage: node server/ws-smoke.mjs
// Exit code 0 on all pass, 1 otherwise.

import http from 'http';
import { attachWs } from './ws.js';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

const SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026';

const server = http.createServer();
const wsCtx = attachWs(server);

server.listen(0, '127.0.0.1', run);

async function run() {
  const port = server.address().port;
  const base = `ws://127.0.0.1:${port}`;
  console.log(`[smoke] ws server on ${base}`);

  const mkToken = (u) => jwt.sign(u, SECRET, { expiresIn: '5m' });
  const deviceToken = mkToken({ id: 101, role: 'agent', phone_id: 7, name: 'A', agent_name: 'A' });
  const consoleToken = mkToken({ id: 101, role: 'agent', phone_id: 7, name: 'A', agent_name: 'A' });

  let pass = 0, fail = 0;
  const check = (name, ok) => {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else    { fail++; console.log(`  FAIL  ${name}`); }
  };

  // Open console first (real-world ordering: web UI runs before phone app comes online).
  // Listeners must be wired BEFORE waiting for open, otherwise the hello frame is missed.
  const consoleWs = new WebSocket(`${base}/ws/console?token=${consoleToken}`, { perMessageDeflate: false });
  const consoleMsgs = [];
  consoleWs.on('message', (raw) => consoleMsgs.push(JSON.parse(raw.toString())));
  await new Promise((r) => consoleWs.once('open', r));
  await sleep(80);

  const device = new WebSocket(`${base}/ws/device?token=${deviceToken}`, { perMessageDeflate: false });
  const deviceMsgs = [];
  device.on('message', (raw) => deviceMsgs.push(JSON.parse(raw.toString())));
  await new Promise((r) => device.once('open', r));
  await sleep(150);

  check('device hello received', deviceMsgs.some((m) => m.type === 'hello' && m.role === 'device' && m.deviceId === 7));
  check('console hello received', consoleMsgs.some((m) => m.type === 'hello' && m.role === 'console'));
  check('console notified device online (presence push)', consoleMsgs.some((m) => m.type === 'device_presence' && m.online === true));

  // dial relay
  consoleWs.send(JSON.stringify({ type: 'dial', phone: '010-1234-5678', callId: 'call-smoke-1' }));
  await sleep(120);
  check('device received dial command', deviceMsgs.some((m) => m.type === 'dial' && m.callId === 'call-smoke-1' && m.phone === '010-1234-5678'));

  // call_state ringing
  device.send(JSON.stringify({ type: 'call_state', state: 'ringing', callId: 'call-smoke-1', duration: 0 }));
  await sleep(120);
  check('console received call_state ringing', consoleMsgs.some((m) => m.type === 'call_state' && m.state === 'ringing' && m.callId === 'call-smoke-1'));

  // call_state idle with duration_sec (key for quality metrics)
  device.send(JSON.stringify({ type: 'call_state', state: 'idle', callId: 'call-smoke-1', duration: 42, number: '010-1234-5678' }));
  await sleep(120);
  check('console received call_state idle with duration=42',
    consoleMsgs.some((m) => m.type === 'call_state' && m.state === 'idle' && m.duration === 42));

  // dial_ack from device
  device.send(JSON.stringify({ type: 'dial_ack', callId: 'call-smoke-1', ok: true }));
  await sleep(100);
  check('console received dial_ack', consoleMsgs.some((m) => m.type === 'dial_ack' && m.callId === 'call-smoke-1' && m.ok === true));

  // hangup from console → device
  consoleWs.send(JSON.stringify({ type: 'hangup', callId: 'call-smoke-1' }));
  await sleep(120);
  check('device received hangup', deviceMsgs.some((m) => m.type === 'hangup' && m.callId === 'call-smoke-1'));

  // bad token is rejected with 1008
  const badResult = await new Promise((resolve) => {
    const bad = new WebSocket(`${base}/ws/device?token=garbage`, { perMessageDeflate: false });
    let settled = false;
    const finish = (code) => { if (!settled) { settled = true; resolve(code); } };
    bad.on('close', (code) => finish(code));
    bad.on('error', () => finish(-1));
    setTimeout(() => finish(0), 1000);
  });
  check('bad token rejected (close code 1008)', badResult === 1008);

  // missing phone_id on device role → reject
  const noPhoneToken = mkToken({ id: 202, role: 'agent', name: 'B' });
  const noPhoneResult = await new Promise((resolve) => {
    const bad = new WebSocket(`${base}/ws/device?token=${noPhoneToken}`, { perMessageDeflate: false });
    let settled = false;
    const finish = (code) => { if (!settled) { settled = true; resolve(code); } };
    bad.on('close', (code) => finish(code));
    bad.on('error', () => finish(-1));
    setTimeout(() => finish(0), 1000);
  });
  check('device without phone_id rejected (1008)', noPhoneResult === 1008);

  // center_admin role tries to register as device → reject (device channel is agent/super_admin only)
  const mgrToken = mkToken({ id: 303, role: 'center_admin', phone_id: 9, name: 'C' });
  const mgrResult = await new Promise((resolve) => {
    const bad = new WebSocket(`${base}/ws/device?token=${mgrToken}`, { perMessageDeflate: false });
    let settled = false;
    const finish = (code) => { if (!settled) { settled = true; resolve(code); } };
    bad.on('close', (code) => finish(code));
    bad.on('error', () => finish(-1));
    setTimeout(() => finish(0), 1000);
  });
  check('center_admin rejected on device channel (1008)', mgrResult === 1008);

  // close healthy sockets
  device.close();
  consoleWs.close();

  await sleep(150);

  console.log(`\n[smoke] ${pass} passed, ${fail} failed`);
  console.log('[smoke] final stats:', wsCtx.stats());
  wsCtx.shutdown();
  server.close();
  process.exit(fail === 0 ? 0 : 1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
