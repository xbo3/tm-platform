export function Led({ color = 'var(--pos)', size = 7, pulse }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      animation: pulse ? 'lp 2s ease-in-out infinite' : 'none',
    }} />
  );
}

export function Bar({ pct, color = 'var(--accent)', h = 6 }) {
  return (
    <div style={{ width: '100%', height: h, borderRadius: h, background: 'var(--bg-elev-2)', overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(Math.max(pct, 0.5), 100)}%`,
        height: '100%', borderRadius: h, background: color,
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

export function Stat({ label, value, color = 'var(--text)', sub }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function fmtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function gradeFromRate(rate) {
  if (rate >= 30) return { grade: 'A', color: 'var(--pos)' };
  if (rate >= 20) return { grade: 'B', color: 'var(--info)' };
  if (rate >= 10) return { grade: 'C', color: 'var(--warn)' };
  return { grade: 'D', color: 'var(--neg)' };
}
