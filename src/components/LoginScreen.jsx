import React, { useState } from 'react';
import { supabase, tables } from '../supabase';

const LAST_EMAIL_KEY = 'agritech_last_email';

const LoginScreen = ({ setUser }) => {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading]   = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showRescue, setShowRescue] = useState(false);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true); 
    setError('');
    setShowRescue(false);

    // Force sign out first to clear any "ghost" sessions that might be holding a lock
    try { 
      await supabase.auth.signOut().catch(() => {}); 
      localStorage.removeItem('agritech-finance-v1'); // Manual purge to be absolutely sure
    } catch (err) { console.warn('Pre-login purge ignored:', err); }

    // Safety Timeout: Prevent indefinite hang if Supabase takes too long
    const timeoutId = setTimeout(() => {
      setLoading(currentLoading => {
        if (currentLoading) {
          setError('Connection Timeout: The security vault is not responding. This usually happens during high network congestion or session lockups.');
          setShowRescue(true);
          return false;
        }
        return false;
      });
    }, 12000); // 12 seconds for extra buffer

    try {
      if (isSignUp) {
        console.log('[Auth] Attempting Sign Up...');
        const { data, error: signUpError } = await supabase.auth.signUp({ 
          email: cleanEmail, 
          password 
        });
        if (signUpError) throw signUpError;
        if (!data.user) throw new Error('Sign up failed');

        const defaultRole = cleanEmail.toLowerCase() === 'agritech-production@hotmail.com' ? 'SUPER_ADMIN' : 'PENDING';
        
        const { error: profileError } = await supabase
          .from(tables.PROFILES)
          .upsert({ id: data.user.id, email: cleanEmail, role: defaultRole });

        if (profileError) throw profileError;
        localStorage.setItem(LAST_EMAIL_KEY, cleanEmail);
      } else {
        console.log('[Auth] Attempting Sign In...');
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ 
          email: cleanEmail, 
          password 
        });
        
        if (signInError) throw signInError;
        if (!data.user) throw new Error('Sign in failed');
        
        localStorage.setItem(LAST_EMAIL_KEY, cleanEmail);
        console.log('[Auth] Sign In Successful - Direct Injecting User State');
        
        // DIRECT INJECT: Bypass the background listener for immediate UI transition
        if (setUser) setUser(data.user);
      }
    } catch (err) {
      console.error('[Auth] Critical Error:', err);
      setError(err.message || 'Authentication Failed');
    } finally {
      clearTimeout(timeoutId);
      // Small delay to prevent flickering
      setTimeout(() => setLoading(false), 500);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLogin(e);
    }
  };

  const handleRescueReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    // Use the Nuclear Reset parameter
    window.location.href = window.location.pathname + '?nuke=true';
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="login-v2-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span>{error}</span>
                </div>
                
                {showRescue && (
                  <button 
                    type="button" 
                    onClick={handleRescueReset}
                    style={{ 
                      background: '#ef4444', color: 'white', border: 'none', 
                      padding: '12px', borderRadius: '12px', fontWeight: 800, 
                      fontSize: '11px', cursor: 'pointer', textTransform: 'uppercase'
                    }}
                  >
                    ☢️ Force System Rescue & Reload
                  </button>
                )}
              </div>
            )}
            
            <div className="login-v2-field">
              <label>Clearance Ident</label>
              <input 
                type="email" 
                required 
                placeholder="engineer@agritech.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                onKeyDown={handleKeyDown}
              />
            </div>

            <div className="login-v2-field">
              <label>Access Protocol</label>
              <input 
                type="password" 
                required 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                onKeyDown={handleKeyDown}
              />
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
            <span style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', border: '1px solid #334155', fontSize: '8px', color: '#64748b' }}>v8.2.0</span>
          </p>
          
          <button 
            type="button"
            onClick={handleRescueReset}
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
