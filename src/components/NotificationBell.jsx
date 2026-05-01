import React, { useState, useEffect, useRef } from 'react';
import {
  requestNotificationPermission,
  subscribeToPush,
  getStoredNotifications,
  markAllRead,
  getUnreadCount,
  subscribeToToasts,
  clearAllNotifications,
} from '../lib/notifications';

function NotificationBell({ onPermissionGranted }) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(
    (typeof window !== 'undefined' && 'Notification' in window)
      ? window.Notification.permission
      : 'unsupported'
  );
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const panelRef = useRef(null);

  const reload = () => {
    setNotifications(getStoredNotifications());
    setUnread(getUnreadCount());
  };

  useEffect(() => {
    reload();
    const intervalId = setInterval(reload, 5000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const unsub = subscribeToToasts((notif) => {
      setToasts(t => [...t, notif]);
      setTimeout(() => setToasts(t => t.filter(n => n.id !== notif.id)), 5000);
      reload();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) {
      markAllRead();
      setUnread(0);
      reload();
    }
  };

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      // Register this device for Web Push (stores in Supabase)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => subscribeToPush(reg));
      }
      if (onPermissionGranted) onPermissionGranted();
    }
  };

  const fmt = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const typeColor = (type) => {
    if (type === 'success') return '#10b981';
    if (type === 'warning') return '#f59e0b';
    if (type === 'error')   return '#ef4444';
    return '#3b82f6';
  };

  return (
    <>
      {/* ── IN-APP TOAST STACK ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column-reverse', gap: 10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: 'rgba(10,12,20,0.98)', border: '1px solid rgba(255,255,255,0.1)',
            borderLeft: `4px solid ${typeColor(t.type)}`,
            borderRadius: 12, padding: '14px 18px', maxWidth: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            animation: 'slideIn 0.3s ease',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc', marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.body}</div>
          </div>
        ))}
      </div>

      {/* ── BELL BUTTON ── */}
      <div style={{ position: 'relative' }} ref={panelRef}>
        <button
          id="notification-bell-btn"
          onClick={handleOpen}
          title="Notifications"
          style={{
            background: open
              ? 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.25))'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${open ? 'rgba(99,179,237,0.6)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10, padding: '7px 12px', cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', gap: 6,
            color: open ? '#e2e8f0' : '#94a3b8',
            transition: 'all 0.2s',
            boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.2)' : 'none',
          }}
        >
          <span style={{ fontSize: 17 }}>{permission === 'granted' ? '🔔' : '🔕'}</span>
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#fff', borderRadius: '50%',
              width: 20, height: 20, fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #0f1117',
              boxShadow: '0 2px 8px rgba(239,68,68,0.6)',
            }}>{unread > 9 ? '9+' : unread}</span>
          )}
        </button>

        {/* ── DROPDOWN PANEL ── */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 12px)', right: 0,
            width: 380,
            background: '#000000 !important',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            boxShadow: '0 25px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)',
            zIndex: 10000, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(90deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))',
            }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔔</span> Notifications
              </div>
              {notifications.length > 0 && (
                <span style={{
                  fontSize: 11, color: '#60a5fa',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 20, padding: '2px 10px', fontWeight: 700,
                }}>
                  {notifications.length} total
                </span>
              )}
            </div>

            {/* Permission Prompt */}
            {permission !== 'granted' && (
              <div style={{ padding: '16px 22px', background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.6 }}>
                  {permission === 'denied'
                    ? '❌ Notifications blocked. Enable in browser → Site Settings → Notifications.'
                    : '📲 Get alerted when new Google Sheets data arrives, even in background.'}
                </div>
                {permission !== 'denied' && (
                  <button
                    id="enable-notifications-btn"
                    onClick={handleRequestPermission}
                    style={{
                      background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', border: 'none',
                      borderRadius: 8, padding: '9px 16px', color: '#fff',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer', width: '100%',
                      boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
                    }}
                  >
                    ⚡ Enable Push Notifications
                  </button>
                )}
              </div>
            )}

            {/* Notification list */}
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '48px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
                    All clear!
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                    You'll be notified when<br/>Google Sheets data changes.
                  </div>
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} style={{
                    padding: '14px 22px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: n.read
                      ? 'transparent'
                      : 'linear-gradient(90deg, rgba(59,130,246,0.07), transparent)',
                    borderLeft: n.read ? 'none' : '3px solid rgba(59,130,246,0.5)',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13, color: '#f1f5f9', marginBottom: 3 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 5, lineHeight: 1.5 }}>
                      {n.body}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                      {fmt(n.timestamp)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div style={{
                padding: '16px 22px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}>
                <button
                  onClick={() => { clearAllNotifications(); setUnread(0); reload(); }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10,
                    fontSize: 12, color: '#fca5a5',
                    cursor: 'pointer', fontWeight: 700,
                    padding: '10px 20px',
                    width: '100%',
                    transition: '0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                >
                  ✓ Acknowledge &amp; Clear All
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default NotificationBell;
