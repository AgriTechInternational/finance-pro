import React, { useState } from 'react';
import { supabase, tables } from '../supabase';

const LAST_EMAIL_KEY = 'agritech_last_email';

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading]   = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!data.user) throw new Error('Sign up failed');

        const defaultRole = email.toLowerCase() === 'agritech-production@hotmail.com' ? 'SUPER_ADMIN' : 'PENDING';
        
        const { error: profileError } = await supabase
          .from(tables.PROFILES)
          .upsert({ id: data.user.id, email, role: defaultRole });

        if (profileError) throw profileError;
        // Remember email for next visit
        localStorage.setItem(LAST_EMAIL_KEY, email);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (!data.user) throw new Error('Sign in failed');
        // Remember email for next visit (persistent login UX)
        localStorage.setItem(LAST_EMAIL_KEY, email);

        // Check if profile exists, if not create as PENDING
        const { data: profile } = await supabase
          .from(tables.PROFILES)
          .select('role')
          .eq('id', data.user.id)
          .single();
        
        if (email.toLowerCase() === 'agritech-production@hotmail.com' && profile?.role !== 'SUPER_ADMIN') {
          await supabase.from(tables.PROFILES).update({ role: 'SUPER_ADMIN' }).eq('id', data.user.id);
        } else if (!profile) {
          await supabase.from(tables.PROFILES).insert({ id: data.user.id, email, role: 'PENDING' });
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen-v2">
      <div className="login-v2-glow-top" />
      <div className="login-v2-glow-bottom" />
      
      <div className="login-v2-card-wrap">
        <div className="login-v2-logo-container">
          <div className="login-v2-logo-badge">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h2 className="login-v2-title">{isSignUp ? 'Request Clearance' : 'System Authentication'}</h2>
          <p className="login-v2-subtitle">AgriTech Master Command Center</p>
        </div>

        <div className="login-v2-card">
          <form className="login-v2-form" onSubmit={handleLogin}>
            {error && (
              <div className="login-v2-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>{error}</span>
              </div>
            )}
            
            <div className="login-v2-field">
              <label>Clearance Ident</label>
              <input type="email" required placeholder="engineer@agritech.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="login-v2-field">
              <label>Access Protocol</label>
              <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="login-v2-actions">
              <button type="submit" disabled={loading} className="login-v2-btn-primary">
                {loading ? 'Decrypting Payload...' : isSignUp ? 'Submit Request' : 'Authorize Login'}
              </button>
              
              <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="login-v2-btn-secondary">
                {isSignUp ? 'Already Registered? Login' : 'Don\'t have access? Sign Up Here'}
              </button>
            </div>
          </form>
        </div>
        
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <p className="login-v2-footer-text flex items-center justify-center gap-2" style={{ marginTop: 0 }}>
            <span>Secure Cloud Proxy Subsystem</span>
            <span style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', border: '1px solid #334155', fontSize: '8px', color: '#64748b' }}>v1.0.1</span>
          </p>
          
          <button 
            type="button"
            onClick={() => {
              if (window.confirm("This will clear your local session and release browser locks to fix the 'Lock Stolen' error. Use this if the system feels stuck. Proceed?")) {
                localStorage.clear();
                window.location.reload(true);
              }
            }}
            style={{ 
              background: 'transparent', border: '1px solid rgba(255,255,255,0.05)', 
              color: '#475569', fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', 
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', letterSpacing: '0.1em' 
            }}
          >
            ⚙️ Reset System State
          </button>
        </div>
      </div>

    </div>
  );
};

export default LoginScreen;
