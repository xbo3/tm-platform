import { useEffect, useState } from 'react';

const VIEW_LABELS = {
  admin: { label: '슈퍼어드민', tag: '★ 전용' },
  manager: { label: '센터장', tag: 'VIEW' },
  lead: { label: '실장', tag: 'VIEW' },
  agent: { label: '상담원', tag: 'VIEW' },
};

// role(super_admin/center_admin/agent/lead_monitor) 별로 노출 가능한 view
function viewsForRole(role) {
  if (role === 'super_admin') return ['admin', 'manager', 'lead', 'agent'];
  if (role === 'center_admin') return ['manager', 'lead'];
  if (role === 'lead_monitor') return ['lead'];
  if (role === 'agent') return ['agent'];
  return [];
}

export default function Topbar({ user, view, onViewChange, onLogout }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const views = viewsForRole(user.role);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 24px', height: 56,
      background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em' }}>
          <span style={{ color: 'var(--accent)' }}>TM</span>
          <span style={{ color: 'var(--text-faint)', marginLeft: 6, fontSize: 11, fontWeight: 500 }}>v8</span>
        </div>

        {views.length > 1 && (
          <div className="role-tabs" style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
            {views.map(v => {
              const isActive = view === v;
              const isAdmin = v === 'admin';
              return (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  className={`role-tab${isActive ? ' active' : ''}`}
                  style={{
                    background: isActive
                      ? (isAdmin ? 'var(--accent-soft)' : 'var(--bg-elev-2)')
                      : 'transparent',
                    color: isActive
                      ? (isAdmin ? 'var(--accent)' : 'var(--text)')
                      : 'var(--text-dim)',
                    border: '1px solid ' + (isActive ? (isAdmin ? 'var(--accent-soft)' : 'var(--border)') : 'transparent'),
                    borderRadius: 8,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    minWidth: 84,
                    textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isActive ? 'inherit' : 'var(--text-faint)', marginBottom: 1 }}>
                    {VIEW_LABELS[v].tag}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{VIEW_LABELS[v].label}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {now.toLocaleTimeString('ko-KR', { hour12: false })}
        </span>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--pos)', boxShadow: '0 0 6px rgba(74,222,128,0.6)', animation: 'lp 2s ease-in-out infinite' }} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{user.name || user.email}</span>
        <button className="btn" onClick={onLogout} style={{ padding: '5px 12px', fontSize: 11 }}>LOGOUT</button>
      </div>
    </div>
  );
}
