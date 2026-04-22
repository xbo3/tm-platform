// Commit (2) smoke — verifies the dial transaction emits the right SQL in the
// right order and handles the already_locked race. Uses an in-memory mock pool
// so no Postgres needed. Real Railway PG verification happens once phone (③)
// and agent.html (⑤) are wired in an integration test.
//
// Usage: node server/ws-lock-smoke.mjs

import http from 'http';
import { attachWs } from './ws.js';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

const SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026';

// ─── Mock pool: captures issued SQL + emulates first-writer-wins claim ───
function makeMockPool({ customers, nextCallId }) {
  const issued = [];
  const client = {
    released: false,
    async query(sql, params = []) {
      issued.push({ sql: sql.trim().split('\n')[0], params });
      if (/^BEGIN/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^COMMIT/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^ROLLBACK/i.test(sql)) return { rows: [], rowCount: 0 };
      // claim UPDATE
      if (/UPDATE customers[\s\S]+unmasked_at = NOW\(\)/i.test(sql)) {
        const [agent_name, customer_id] = params;
        const row = customers.find((c) => c.id === customer_id);
        if (!row || row.unmasked_at) return { rows: [], rowCount: 0 };
        row.unmasked_at = new Date();
        row.unmasked_by = agent_name;
        row.status = 'calling';
        return { rows: [{ phone_number: row.phone_number, center_id: row.center_id }], rowCount: 1 };
      }
      // sibling block UPDATE
      if (/UPDATE customers[\s\S]+reserved_blocked/i.test(sql)) {
        const [phone, exceptId] = params;
        let n = 0;
        for (const c of customers) {
          if (c.phone_number === phone && c.id !== exceptId && (c.status === 'pending' || c.status === 'reserved')) {
            c.status = 'reserved_blocked';
            n++;
          }
        }
        return { rows: [], rowCount: n };
      }
      // INSERT calls
      if (/INSERT INTO calls/i.test(sql)) {
        return { rows: [{ id: nextCallId() }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { this.released = true; },
  };
  const pool = {
    issued,
    connect: async () => client,
    _client: client,
  };
  return pool;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok) => {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else    { fail++; console.log(`  FAIL  ${name}`); }
  };

  // Scenario 1: two customer rows with the SAME phone number in different DBs
  // (simulates list overlap). Dial c1 → c1 locked, c2 auto-blocks.
  const customers = [
    { id: 101, phone_number: '010-1234-5678', center_id: 1, status: 'pending', unmasked_at: null, unmasked_by: null },
    { id: 102, phone_number: '010-1234-5678', center_id: 1, status: 'pending', unmasked_at: null, unmasked_by: null },
    { id: 103, phone_number: '010-9999-0000', center_id: 1, status: 'pending', unmasked_at: null, unmasked_by: null },
  ];
  let callIdCounter = 500;
  const pool = makeMockPool({ customers, nextCallId: () => ++callIdCounter });

  const server = http.createServer();
  const ctx = attachWs(server, { pool });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `ws://127.0.0.1:${port}`;

  const mkToken = (u) => jwt.sign(u, SECRET, { expiresIn: '5m' });
  const agentToken = mkToken({ id: 10, role: 'agent', phone_id: 7, agent_name: 'A', center_id: 1, name: 'A' });

  const consoleWs = new WebSocket(`${base}/ws/console?token=${agentToken}`, { perMessageDeflate: false });
  const consoleMsgs = [];
  consoleWs.on('message', (raw) => consoleMsgs.push(JSON.parse(raw.toString())));
  await new Promise((r) => consoleWs.once('open', r));

  const device = new WebSocket(`${base}/ws/device?token=${agentToken}`, { perMessageDeflate: false });
  const deviceMsgs = [];
  device.on('message', (raw) => deviceMsgs.push(JSON.parse(raw.toString())));
  await new Promise((r) => device.once('open', r));
  await sleep(80);

  // ── Test 1: first dial succeeds
  consoleWs.send(JSON.stringify({ type: 'dial', customer_id: 101 }));
  await sleep(100);

  const dialForwarded = deviceMsgs.find((m) => m.type === 'dial' && m.customer_id === 101);
  check('device received dial after tx', !!dialForwarded);
  check('dial carries server-trusted phone_number', dialForwarded?.phone === '010-1234-5678');
  check('dial callId is DB calls.id (501)', dialForwarded?.callId === 501);
  check('console echoed dial_started', consoleMsgs.some((m) => m.type === 'dial_started' && m.customer_id === 101 && m.callId === 501));
  check('customer 101 marked calling', customers[0].status === 'calling' && customers[0].unmasked_by === 'A');
  check('customer 102 auto-reserved_blocked (sibling phone)', customers[1].status === 'reserved_blocked');
  check('customer 103 unaffected (different phone)', customers[2].status === 'pending');

  // ── Test 2: second dial on SAME customer → already_locked
  const preErrors = consoleMsgs.filter((m) => m.type === 'error').length;
  consoleWs.send(JSON.stringify({ type: 'dial', customer_id: 101 }));
  await sleep(100);
  const errAfter = consoleMsgs.find((m, i) => i >= preErrors && m.type === 'error' && m.error === 'already_locked');
  check('duplicate dial rejected with already_locked', !!errAfter);

  // ── Test 3: dial without customer_id → error
  consoleWs.send(JSON.stringify({ type: 'dial', phone: '010-1234-5678' }));
  await sleep(100);
  check('dial without customer_id rejected', consoleMsgs.some((m) => m.type === 'error' && m.error === 'customer_id required'));

  // ── Test 4: SQL sequence sanity — transaction bracketed correctly
  const issuedStarters = pool.issued.map((q) => q.sql);
  const firstTxSlice = issuedStarters.slice(0, 5);
  check('first dial tx has BEGIN', firstTxSlice.includes('BEGIN'));
  check('first dial tx ends with COMMIT', firstTxSlice.includes('COMMIT'));
  check('sibling block UPDATE issued before COMMIT',
    issuedStarters.indexOf('UPDATE customers') < issuedStarters.indexOf('COMMIT') ||
    issuedStarters.findIndex((q) => q.startsWith('UPDATE customers')) < issuedStarters.indexOf('COMMIT'));

  // ── Test 5: client released after happy path
  check('db client released after commit', pool._client.released === true);

  // ── Cleanup
  consoleWs.close();
  device.close();
  await sleep(50);
  ctx.shutdown();
  server.close();

  console.log(`\n[lock-smoke] ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[lock-smoke] crash:', err);
  process.exit(1);
});
