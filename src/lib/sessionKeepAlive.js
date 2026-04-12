// ============================================================
// sessionKeepAlive.js — Silently refreshes tokens every 20min
// Calls refreshSession() (not just getSession()) to ACTIVELY
// extend the token lifetime → ensures permanent login like
// mobile apps (Facebook, Instagram pattern).
// ============================================================
import { supabase } from '../supabase';

let _interval = null;
let _retryCount = 0;
const MAX_RETRY = 5;

export function startSessionKeepAlive() {
  if (_interval) return; // Already running

  // Refresh immediately on start to restore any existing session
  _refreshSilently();

  // Then every 20 minutes (well inside the 1-hour token lifetime)
  _interval = setInterval(_refreshSilently, 20 * 60 * 1000);

  // Refresh when tab becomes visible again — catches long absences
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _refreshSilently();
    }
  });

  // Also refresh on network reconnect
  window.addEventListener('online', () => {
    _refreshSilently();
  });

  console.log('[Session] Keep-alive started (refresh every 20min + visibility events)');
}

async function _refreshSilently() {
  try {
    // refreshSession() actively extends the token, unlike getSession() which
    // only returns the current one. This is the key to "permanent login".
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      _retryCount++;
      console.warn(`[Session] Refresh attempt ${_retryCount}/${MAX_RETRY} failed:`, error.message);
      return;
    }
    _retryCount = 0;
    if (data?.session) {
      const expiry = new Date(data.session.expires_at * 1000);
      console.log('[Session] Token refreshed, new expiry:', expiry.toLocaleTimeString());
    }
  } catch (e) {
    console.warn('[Session] Keep-alive silent error:', e.message);
  }
}

export function stopSessionKeepAlive() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
