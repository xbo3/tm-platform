import { useEffect, useState } from 'react';
import './styles/tokens.css';

import Topbar from './components/Topbar.jsx';
import AdminView from './views/AdminView.jsx';
import ManagerView from './views/ManagerView.jsx';
import LeadMonitorView from './views/LeadMonitorView.jsx';
import AgentView from './views/AgentView.jsx';

function defaultViewForRole(role) {
  if (role === 'super_admin') return 'admin';
  if (role === 'center_admin') return 'manager';
  if (role === 'lead_monitor') return 'lead';
  return 'agent';
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Login failed'); setLoading(false); return; }
      localStorage.setItem('tm_token', data.token);
      localStorage.setItem('tm_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch { setErr('Server error'); }
    setLoading(false);
  };

  const quick = (e, p = 'admin123') => {
    setEmail(e);
    setPass(p);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 380, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em' }}>TM</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, letterSpacing: '0.08em' }}>COMMAND CENTER · v8</div>
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, letterSpacing: '0.05em' }}>EMAIL</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@tm.co.kr"
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={{ width: '100%' }} />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, letterSpacing: '0.05em' }}>PASSWORD</div>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="****"
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={{ width: '100%' }} />
        </label>

        {err && <div style={{ fontSize: 11, color: 'var(--neg)', marginBottom: 10, textAlign: 'center' }}>{err}</div>}

        <button className="btn primary" onClick={submit} disabled={loading} style={{ width: '100%', padding: 12, fontSize: 13 }}>
          {loading ? '...' : 'LOGIN'}
        </button>

        <div style={{ marginTop: 24, fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', letterSpacing: '0.04em' }}>QUICK LOGIN</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: '슈퍼', email: 'admin@tm.co.kr', pw: 'admin123' },
            { label: '센터장', email: 'center@tm.co.kr', pw: 'center123' },
            { label: 'A', email: 'agenta@tm.co.kr', pw: 'agent123' },
            { label: 'B', email: 'agentb@tm.co.kr', pw: 'agent123' },
            { label: 'C', email: 'agentc@tm.co.kr', pw: 'agent123' },
            { label: 'D', email: 'agentd@tm.co.kr', pw: 'agent123' },
            { label: 'E', email: 'agente@tm.co.kr', pw: 'agent123' },
          ].map(q => (
            <button
              key={q.email}
              onClick={() => quick(q.email, q.pw)}
              className="btn"
              style={{ fontSize: 10, padding: '4px 10px', borderColor: email === q.email ? 'var(--accent)' : 'var(--border)' }}>
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('tm_user'));
      if (u) {
        setUser(u);
        setView(defaultViewForRole(u.role));
      }
    } catch {}
  }, []);

  const handleLogin = (u) => {
    setUser(u);
    setView(defaultViewForRole(u.role));
  };

  const logout = () => {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_user');
    setUser(null);
    setView(null);
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar user={user} view={view} onViewChange={setView} onLogout={logout} />
      {view === 'admin' && <AdminView user={user} />}
      {view === 'manager' && <ManagerView user={user} />}
      {view === 'lead' && <LeadMonitorView user={user} />}
      {view === 'agent' && <AgentView user={user} />}
    </div>
  );
}
