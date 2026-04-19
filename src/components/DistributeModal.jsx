import { useEffect, useState } from 'react';
import { post } from '../api.js';

// 5명 균등 분할 (나머지는 1건씩 추가) — preview 가 동일 결과 반환하므로 백엔드 신뢰
function fmtSplit(split) {
  return Object.values(split).join(' · ');
}

export default function DistributeModal({ list, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!list) return;
    setLoading(true);
    setErr('');
    post('/dist/preview', { list_id: list.id })
      .then(setPreview)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [list]);

  const confirm = async () => {
    setSubmitting(true);
    setErr('');
    try {
      await post('/dist/execute', {
        list_id: list.id,
        category: list.category || null,
        supplier_tg: list.supplier_tg || null,
      });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setSubmitting(false);
  };

  if (!list) return null;

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal-box">
        <div className="modal-title">
          <span style={{ fontSize: 20 }}>⚡</span>
          분배하시겠습니까?
        </div>

        <div className="modal-body">
          <strong>{list.title}</strong>{' '}
          {list.supplier_tg && (
            <span className="mono" style={{ color: 'var(--info)' }}>{list.supplier_tg}</span>
          )}
          의 남은 번호를 실장 5명에게 균등 분배합니다.
        </div>

        {loading && <div className="modal-highlight">미리보기 불러오는 중…</div>}

        {!loading && preview && (
          <div className="modal-highlight">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>분배할 건수</span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {preview.total.toLocaleString()}건
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{preview.agents.length}명 균등</span>
              <span className="mono">{fmtSplit(preview.split)}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 6, color: 'var(--text-dim)' }}>
              ✓ 나머지는 차례로 1건씩 추가 · {preview.agents.length}의 배수 아니어도 OK
            </div>
          </div>
        )}

        {err && <div className="modal-highlight" style={{ color: 'var(--neg)' }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={submitting}>취소</button>
          <button className="btn primary" onClick={confirm} disabled={loading || submitting || !preview || preview.total === 0}>
            {submitting ? '분배 중…' : '확인 · 분배 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}
