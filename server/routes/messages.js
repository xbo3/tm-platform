import { Router } from 'express';
import { query } from '../db.js';
import { auth, requireRole } from '../auth.js';
import { sendToDevice, broadcastToCenter } from '../ws.js';

const router = Router();

// 한국 모바일 / +82 / +84 정규화 (smsotp 의 normalizePhone 와 동일 정책 축약판)
function normalizePhone(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.startsWith('82') && (digits.length === 12 || digits.length === 13)) {
    const local = '0' + digits.substring(2);
    if (/^01[0-9]\d{7,8}$/.test(local)) return local;
  }
  if (hasPlus && digits.length >= 10 && digits.length <= 15) return '+' + digits;
  if (digits.length === 10 && digits.startsWith('10')) return '0' + digits;
  if (/^01[0-9]\d{7,8}$/.test(digits)) return digits;
  if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith('0')) return '+' + digits;
  return null;
}

// 폰이 수신 SMS forward — 폰 JWT 토큰으로 인증 (phone_id 포함)
// body: { messages: [{ from, body, ts_ms? }, ...] } 또는 단건 { from, body }
router.post('/phone/inbox', auth, async (req, res) => {
  const u = req.user;
  if (!u.phone_id || !u.center_id) return res.status(403).json({ error: 'phone identity required' });

  const raw = req.body || {};
  const list = Array.isArray(raw.messages)
    ? raw.messages
    : (raw.from && raw.body ? [{ from: raw.from, body: raw.body, ts_ms: raw.ts_ms }] : []);
  if (!list.length) return res.status(400).json({ error: 'messages (array) or {from,body} required' });

  const accepted = [];
  const rejected = [];
  for (const m of list) {
    const norm = normalizePhone(m.from);
    if (!norm) { rejected.push({ from: m.from, reason: 'invalid_from' }); continue; }
    const body = String(m.body || '').slice(0, 2000);
    if (!body) { rejected.push({ from: m.from, reason: 'empty_body' }); continue; }

    // 매칭: 같은 center 의 customers 중 phone_number 일치 가장 최근
    const match = await query(
      `SELECT id, status FROM customers
        WHERE center_id=$1 AND phone_number=$2
        ORDER BY updated_at DESC LIMIT 1`,
      [u.center_id, norm]
    );
    const customer_id = match.rows[0]?.id || null;

    const ins = await query(
      `INSERT INTO customer_messages
         (customer_id, center_id, phone_id, phone_number, body, direction, status, is_read, received_at)
       VALUES ($1, $2, $3, $4, $5, 'inbound', 'received', false, NOW())
       RETURNING id, received_at`,
      [customer_id, u.center_id, u.phone_id, norm, body]
    );
    const row = ins.rows[0];
    accepted.push({ id: row.id, from: norm, customer_id });

    // 라이브 푸시 — 같은 센터의 모든 콘솔에 알림 (AgentView/ManagerView 가 적절히 표시)
    broadcastToCenter(u.center_id, {
      type: 'sms_inbound',
      message_id: row.id,
      customer_id,
      phone_number: norm,
      body,
      phone_id: u.phone_id,
      received_at: row.received_at,
    });
  }

  res.json({ accepted_count: accepted.length, rejected_count: rejected.length, accepted, rejected });
});

// 폰이 발송 결과 보고 (sms_send 명령 후 결과)
router.post('/phone/sms-result', auth, async (req, res) => {
  const u = req.user;
  if (!u.phone_id) return res.status(403).json({ error: 'phone identity required' });
  const { message_id, ok, error } = req.body || {};
  if (!message_id) return res.status(400).json({ error: 'message_id required' });

  const status = ok ? 'sent' : 'failed';
  const r = await query(
    `UPDATE customer_messages
        SET status=$1, error_msg=$2, sent_at = CASE WHEN $1='sent' THEN NOW() ELSE sent_at END
      WHERE id=$3 AND phone_id=$4 AND direction='outbound'
      RETURNING id, customer_id, center_id`,
    [status, error || null, message_id, u.phone_id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'not found or not yours' });

  broadcastToCenter(r.rows[0].center_id, {
    type: 'sms_status',
    message_id: r.rows[0].id,
    customer_id: r.rows[0].customer_id,
    status,
    error: error || null,
  });
  res.json({ ok: true });
});

// 어드민/상담원/센터장 — 미읽음 카운트 + 최근 스레드 요약 (홈/배지용)
router.get('/messages/summary', auth, async (req, res) => {
  const u = req.user;
  if (!u.center_id) return res.json({ total_unread: 0, threads: [] });
  const unread = await query(
    `SELECT COUNT(*)::int AS cnt FROM customer_messages
      WHERE center_id=$1 AND direction='inbound' AND is_read=false`,
    [u.center_id]
  );
  res.json({ total_unread: unread.rows[0].cnt });
});

// 스레드 목록 (고객별 최신 메시지 + 미읽음 카운트)
router.get('/messages/threads', auth, async (req, res) => {
  const u = req.user;
  if (!u.center_id) return res.json({ threads: [] });
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  const r = await query(
    `SELECT
       COALESCE(m.customer_id::text, 'orphan:' || m.phone_number) AS thread_key,
       m.customer_id, m.phone_number,
       c.name AS customer_name,
       MAX(m.received_at) AS last_at,
       COUNT(*) AS total_count,
       SUM(CASE WHEN m.direction='inbound' AND m.is_read=false THEN 1 ELSE 0 END) AS unread_count,
       (SELECT body FROM customer_messages WHERE
          (customer_id = m.customer_id AND m.customer_id IS NOT NULL)
          OR (m.customer_id IS NULL AND phone_number = m.phone_number AND customer_id IS NULL)
          ORDER BY received_at DESC LIMIT 1) AS last_body,
       (SELECT direction FROM customer_messages WHERE
          (customer_id = m.customer_id AND m.customer_id IS NOT NULL)
          OR (m.customer_id IS NULL AND phone_number = m.phone_number AND customer_id IS NULL)
          ORDER BY received_at DESC LIMIT 1) AS last_direction
     FROM customer_messages m
     LEFT JOIN customers c ON c.id = m.customer_id
     WHERE m.center_id=$1
     GROUP BY thread_key, m.customer_id, m.phone_number, c.name
     ORDER BY last_at DESC
     LIMIT $2`,
    [u.center_id, limit]
  );

  res.json({ threads: r.rows });
});

// 스레드 상세 (한 고객 또는 한 orphan 전화번호의 메시지 전부 시간순)
// query: customer_id 또는 phone_number
router.get('/messages/thread', auth, async (req, res) => {
  const u = req.user;
  const customer_id = req.query.customer_id ? parseInt(req.query.customer_id, 10) : null;
  const phone_number = req.query.phone_number ? normalizePhone(req.query.phone_number) : null;
  if (!customer_id && !phone_number) return res.status(400).json({ error: 'customer_id or phone_number required' });

  const where = customer_id
    ? 'customer_id=$2 AND center_id=$1'
    : 'customer_id IS NULL AND phone_number=$2 AND center_id=$1';
  const param2 = customer_id || phone_number;

  const r = await query(
    `SELECT id, customer_id, phone_id, phone_number, body, direction, status, error_msg, is_read, sent_by, received_at, sent_at
       FROM customer_messages
      WHERE ${where}
      ORDER BY received_at ASC, id ASC
      LIMIT 500`,
    [u.center_id, param2]
  );

  // 읽음 처리 (inbound 만)
  await query(
    `UPDATE customer_messages SET is_read=true
      WHERE ${where} AND direction='inbound' AND is_read=false`,
    [u.center_id, param2]
  );

  res.json({ messages: r.rows });
});

// 발신 (신규 또는 답장). 어드민/상담원 호출. WS로 폰에 sms_send 명령 forward.
// body: { customer_id?, phone_number?, body, phone_id? }
//   - customer_id 우선: customer 조회해서 phone_number 채움
//   - phone_id 미지정 시: req.user.phone_id (상담원 본인 폰) 사용
router.post('/messages/send', auth, async (req, res) => {
  const u = req.user;
  if (!u.center_id) return res.status(403).json({ error: 'center required' });
  const { customer_id, phone_number, body, phone_id: bodyPhoneId } = req.body || {};
  const phone_id = bodyPhoneId || u.phone_id;
  if (!phone_id) return res.status(400).json({ error: 'phone_id required (no phone bound to user)' });
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return res.status(400).json({ error: 'body required' });
  const content = text.slice(0, 1000);

  let target = null;
  let resolved_customer = null;
  if (customer_id) {
    const c = await query(
      `SELECT id, phone_number FROM customers WHERE id=$1 AND center_id=$2`,
      [customer_id, u.center_id]
    );
    if (c.rowCount === 0) return res.status(404).json({ error: 'customer not found' });
    target = c.rows[0].phone_number;
    resolved_customer = c.rows[0].id;
  } else if (phone_number) {
    target = normalizePhone(phone_number);
    if (!target) return res.status(400).json({ error: 'invalid phone_number' });
  } else {
    return res.status(400).json({ error: 'customer_id or phone_number required' });
  }

  // 폰이 같은 센터인지 확인
  const ph = await query(`SELECT id, center_id FROM phones WHERE id=$1`, [phone_id]);
  if (ph.rowCount === 0) return res.status(404).json({ error: 'phone not found' });
  if (ph.rows[0].center_id !== u.center_id) return res.status(403).json({ error: 'phone not in your center' });

  // INSERT outbound 메시지 (pending)
  const ins = await query(
    `INSERT INTO customer_messages
       (customer_id, center_id, phone_id, phone_number, body, direction, status, sent_by, received_at)
     VALUES ($1, $2, $3, $4, $5, 'outbound', 'pending', $6, NOW())
     RETURNING id, received_at`,
    [resolved_customer, u.center_id, phone_id, target, content, u.agent_name || u.name || u.email]
  );
  const message_id = ins.rows[0].id;

  // WS로 폰에 sms_send 명령
  const delivered = sendToDevice(phone_id, {
    type: 'sms_send',
    message_id,
    phone: target,
    content,
  });

  if (!delivered) {
    await query(`UPDATE customer_messages SET status='failed', error_msg='device offline' WHERE id=$1`, [message_id]);
    return res.status(503).json({ error: 'phone offline', message_id });
  }

  // 동일 센터 콘솔들에 outbound 표시
  broadcastToCenter(u.center_id, {
    type: 'sms_outbound_pending',
    message_id,
    customer_id: resolved_customer,
    phone_number: target,
    body: content,
    phone_id,
    sent_by: u.agent_name || u.name || u.email,
  });

  res.json({ ok: true, message_id });
});

export default router;
