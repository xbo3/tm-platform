import { useEffect, useState } from 'react';
import { post } from '../api.js';

// 5명 균등 분할 표기 (백엔드가 권위)
function fmtSplit(split) {
  return Object.values(split).join(' · ');
}

export default function DistributeModal({ list, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [chunkSize, setChunkSize] = useState(1000);

  // 초기 preview: chunk_size 미지정 → remaining 전체 확인
  useEffect(() => {
    if (!list) return;
    setLoading(true);
    setErr('');
    setChunkSize(1000);
    post('/dist/preview', { list_id: list.id })
      .then(p => {
        setPreview(p);
        // 잔여보다 작은 값으로 default 1000 클램프
        setChunkSize(Math.min(1000, p.remaining || p.total || 1000));
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [list]);

  // chunk_size 바뀔 때 preview 재조회 (디바운스 300ms)
  useEffect(() => {
    if (!list || !preview) return;
    const handle = setTimeout(() => {
      post('/dist/preview', { list_id: list.id, chunk_size: chunkSize })
        .then(setPreview)
        .catch(e => setErr(e.message));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkSize]);

  const confirm = async () => {
    setSubmitting(true);
    setErr('');
    try {
      await post('/dist/execute', {
        list_id: list.id,
        category: list.category || null,
        supplier_tg: list.supplier_tg || null,
        chunk_size: chunkSize,
      });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setSubmitting(false);
  };

  if (!list) return null;

  const remaining = preview?.remaining ?? 0;
  const used = preview?.used ?? 0;
  const total = preview?.total ?? 0;
  const presets = [
    { label: '500', v: Math.min(500, remaining) },
    { label: '1K', v: Math.min(1000, remaining) },
    { label: '2K', v: Math.min(2000, remaining) },
    { label: '5K', v: Math.min(5000, remaining) },
    { label: '전체', v: remaining },
  ].filter((p, i, arr) => p.v > 0 && (i === 0 || p.v !== arr[i - 1].v));

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
        </div>

        {loading && <div className="modal-highlight">미리보기 불러오는 중…</div>}

        {!loading && preview && (
          <>
            {/* chunk_size 입력 + preset */}
            <div className="modal-highlight" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>이번 라운드 분배 건수</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  분배 가능 풀 <strong style={{ color: 'var(--text)' }}>{remaining.toLocaleString()}</strong>건
                  {used > 0 && <> · 사용됨 <span style={{ color: 'var(--text-dim)' }}>{used.toLocaleString()}</span></>}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  value={chunkSize}
                  onChange={e => {
                    const n = Math.max(0, parseInt(e.target.value) || 0);
                    setChunkSize(Math.min(n, remaining));
                  }}
                  className="mono"
                  style={{
                    flex: 1, fontSize: 18, fontWeight: 700, padding: '8px 12px',
                    textAlign: 'right', color: 'var(--accent)',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>건</span>
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {presets.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setChunkSize(p.v)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      background: chunkSize === p.v ? 'var(--accent)' : 'transparent',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      color: chunkSize === p.v ? '#fff' : 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            {/* 분배 미리보기 */}
            <div className="modal-highlight">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>이번 분배</span>
                <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {total.toLocaleString()}건
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{preview.agents.length}명 균등</span>
                <span className="mono">{fmtSplit(preview.split)}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 6, color: 'var(--text-dim)', fontSize: 11 }}>
                ✓ 사용한 번호 자동 제외 · 회수된 번호 우선 분배 · {preview.agents.length}의 배수 아니어도 OK
              </div>
            </div>
          </>
        )}

        {err && <div className="modal-highlight" style={{ color: 'var(--neg)' }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={submitting}>취소</button>
          <button className="btn primary" onClick={confirm} disabled={loading || submitting || !preview || total === 0}>
            {submitting ? '분배 중…' : `${total.toLocaleString()}건 분배`}
          </button>
        </div>
      </div>
    </div>
  );
}
