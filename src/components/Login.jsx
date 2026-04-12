import React, { useState } from 'react';
import { supabase } from '../supabase';

function Login({ onLogin }) {
  const [email, setEmail]       = useState("agritech-production@hotmail.com");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!password) { setError("Please enter your protocol password."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      onLogin(data.user);
    } catch(e) { 
      setError(`Access Denied: ${e.message}`); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-bg"/><div className="login-grid"/>
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-mark">💵</div>
          <div className="login-title">AgriTech Finance</div>
          <div className="login-sub">Secure Professional Ledger</div>
        </div>
        {error && <div className="login-error">⚠ {error}</div>}
        <form className="form-grid" onSubmit={handleLogin}>
          <div className="field">
            <label>Master Identity</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email..." />
          </div>
          <div className="field">
            <label>Access Protocol</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password..." autoFocus/>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{width:"100%",justifyContent:"center",padding:"12px"}}>
            {loading ? "Decrypting Ledger..." : "Authorize Access"}
          </button>
        </form>
        <div className="login-hint">Connect via your AgriTech Pro credentials.<br/><span style={{color:"var(--accent3)"}}>Admin: agritech-production@hotmail.com</span></div>
      </div>
    </div>
  );
}

export default Login;
