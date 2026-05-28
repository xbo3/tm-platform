import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 고객 카드용 SMS 대화 패널.
 * customer_id 주어지면 자동으로 스레드 로드 + WS sms_* 이벤트 반영.
 *
 * Props:
 *   customerId: number (필수) — null 이면 빈 패널
 *   phoneNumber: string (옵션) — orphan 매칭 표시용
 *   wsBus: { addListener(type, cb): unsubscribe } — sms_inbound / sms_outbound_pending / sms_status push 구독
 *   compact: bool — 짧은 모드 (작은 카드용)
 */
export default function SmsThread({ customerId, phoneNumber, wsBus, compact = false }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [err, setErr] = useState(null);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    if (!customerId && !phoneNumber) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerId) params.set('customer_id', customerId);
      else if (phoneNumber) params.set('phone_number', phoneNumber);
      const res = await fetch('/api/messages/thread?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('tm_token') },
      });
      const j = await res.json();
      if (res.ok) {
        setMessages(j.messages || []);
        setErr(null);
      } else {
        setErr(j.error || 'load failed');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, phoneNumber]);

  useEffect(() => { load(); }, [load]);

  // WS push 반영
  useEffect(() => {
    if (!wsBus) return;
    const unsubInbound = wsBus.addListener('sms_inbound', (msg) => {
      if ((customerId && msg.customer_id === customerId) ||
          (!customerId && phoneNumber && msg.phone_number === phoneNumber)) {
        setMessages(prev => [...prev, {
          id: msg.message_id,
          customer_id: msg.customer_id,
          phone_id: msg.phone_id,
          phone_number: msg.phone_number,
          body: msg.body,
          direction: 'inbound',
          status: 'received',
          received_at: msg.received_at,
          is_read: false,
        }]);
      }
    });
    const unsubOutPending = wsBus.addListener('sms_outbound_pending', (msg) => {
      if ((customerId && msg.customer_id === customerId) ||
          (!customerId && phoneNumber && msg.phone_number === phoneNumber)) {
        setMessages(prev => prev.some(m => m.id === msg.message_id) ? prev : [...prev, {
          id: msg.message_id,
          customer_id: msg.customer_id,
          phone_id: msg.phone_id,
          phone_number: msg.phone_number,
          body: msg.body,
          direction: 'outbound',
          status: 'pending',
          sent_by: msg.sent_by,
          received_at: new Date().toISOString(),
        }]);
      }
    });
    const unsubStatus = wsBus.addListener('sms_status', (msg) => {
      setMessages(prev => prev.map(m =>
        m.id === msg.message_id ? { ...m, status: msg.status, error_msg: msg.error } : m
      ));
    });
    return () => { unsubInbound?.(); unsubOutPending?.(); unsubStatus?.(); };
  }, [wsBus, customerId, phoneNumber]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('tm_token'),
        },
        body: JSON.stringify({
          customer_id: customerId || null,
          phone_number: customerId ? null : phoneNumber,
          body: text,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'send failed');
      setBody('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  if (!customerId && !phoneNumber) {
    return <div style={{ padding: 12, color: 'var(--text-faint)', fontSize: 12 }}>고객 선택 시 SMS 스레드 표시</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: compact ? '4px 0 6px' : '6px 0 8px',
        fontSize: 11, color: 'var(--text-dim)',
      }}>
        <span>SMS 대화 {messages.length > 0 && `(${messages.length})`}</span>
        <button onClick={load} disabled={loading}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11 }}>
          {loading ? '로딩…' : '↻'}
        </button>
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        padding: 6, background: 'var(--bg)', borderRadius: 6,
        minHeight: compact ? 100 : 160, maxHeight: compact ? 200 : 360,
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ color: 'var(--text-faint)', fontSize: 11, textAlign: 'center', padding: 12 }}>
            메시지 없음
          </div>
        )}
        {messages.map(m => {
          const isOut = m.direction === 'outbound';
          const bg = isOut ? 'var(--accent)' : 'var(--card)';
          const color = isOut ? '#000' : 'var(--text)';
          const align = isOut ? 'flex-end' : 'flex-start';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: align, marginBottom: 6 }}>
              <div style={{
                maxWidth: '78%', padding: '6px 10px', borderRadius: 10,
                background: bg, color, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                opacity: m.status === 'pending' ? 0.6 : 1,
              }}>
                {m.body}
                <div style={{ fontSize: 9, opacity: 0.65, marginTop: 3 }}>
                  {(m.received_at || '').slice(11, 19)}
                  {isOut && m.status && ` · ${m.status}`}
                  {m.error_msg && ` · ${m.error_msg}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          placeholder="SMS 답장 (Ctrl+Enter 발송)"
          rows={compact ? 1 : 2}
          style={{ flex: 1, resize: 'none', fontSize: 12, padding: 6 }}
        />
        <button onClick={send} disabled={sending || !body.trim()}
          style={{ padding: '0 12px', fontSize: 12 }}>
          {sending ? '…' : '전송'}
        </button>
      </div>
      {err && <div style={{ color: 'var(--neg)', fontSize: 11, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
