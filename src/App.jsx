import { useState, useEffect } from "react";
import Dashboard from "./Dashboard.jsx";
import AgentPage from "./AgentPage.jsx";

const T = {
  bg: "#0c0c10", card: "#111116", border: "#1c1c24",
  text: "#e8e8ee", dim: "#7a7a8a", muted: "#3a3a48",
  cyan: "#00e5ff", green: "#00ff88", red: "#ff2d55", purple: "#b388ff",
};

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Login failed"); setLoading(false); return; }
      localStorage.setItem("tm_token", data.token);
      localStorage.setItem("tm_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch { setErr("Server error"); }
    setLoading(false);
  };

  const quick = (e) => { setEmail(e); setPass("1234"); };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <div style={{ width: 380, padding: "40px 32px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.cyan, letterSpacing: "0.08em" }}>TM</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4, letterSpacing: "0.06em" }}>COMMAND CENTER</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, letterSpacing: "0.06em" }}>EMAIL</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@tm.kr"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, fontFamily: "'Poppins',sans-serif", outline: "none" }}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, letterSpacing: "0.06em" }}>PASSWORD</div>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="****"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 14, fontFamily: "'Poppins',sans-serif", outline: "none" }}
            onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        {err && <div style={{ fontSize: 11, color: T.red, marginBottom: 12, textAlign: "center" }}>{err}</div>}

        <button onClick={submit} disabled={loading} style={{
          width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
          background: T.cyan, color: "#000", fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Poppins',sans-serif", letterSpacing: "0.04em",
          opacity: loading ? 0.6 : 1,
        }}>{loading ? "..." : "LOGIN"}</button>

        <div style={{ marginTop: 24, fontSize: 10, color: T.muted, textAlign: "center", letterSpacing: "0.04em" }}>QUICK LOGIN</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { label: "센터장", email: "center@tm.kr", color: T.cyan },
            { label: "A", email: "agenta@tm.kr", color: T.dim },
            { label: "B", email: "agentb@tm.kr", color: T.dim },
            { label: "C", email: "agentc@tm.kr", color: T.dim },
            { label: "D", email: "agentd@tm.kr", color: T.dim },
            { label: "E", email: "agente@tm.kr", color: T.dim },
          ].map(q => (
            <button key={q.email} onClick={() => quick(q.email)} style={{
              padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.border}`,
              background: email === q.email ? `${T.cyan}12` : "transparent",
              color: email === q.email ? T.cyan : q.color,
              fontSize: 11, cursor: "pointer", fontFamily: "'Poppins',sans-serif",
            }}>{q.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("tm_user"));
      if (u) setUser(u);
    } catch {}
  }, []);

  const logout = () => {
    localStorage.removeItem("tm_token");
    localStorage.removeItem("tm_user");
    setUser(null);
  };

  if (!user) return <LoginPage onLogin={setUser} />;
  if (user.role === "center_admin" || user.role === "super_admin") return <Dashboard user={user} onLogout={logout} />;
  if (user.role === "agent") return <AgentPage user={user} onLogout={logout} />;

  return <LoginPage onLogin={setUser} />;
}
