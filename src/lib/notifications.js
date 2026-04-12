// ============================================================
// notifications.js — AgriTech Finance Pro Notification Engine
// Handles: Permission, SW registration, change detection,
//          Web Push subscription (VAPID), toasts
// ============================================================

import { supabase } from '../supabase';

// ── VAPID Public Key (generated for this app) ──
const VAPID_PUBLIC_KEY = 'BCKJSitLFok1Yy_PSOicoZVYbioCHbR1G0L1bQpScspDtet76gXKAO0kYF1VqNZl22DPNjeX2p8dC9NcQfklKIg';

// ── Storage for recent notifications ──
const NOTIF_KEY = 'agritech_notifications';
const MAX_STORED = 50;

export function getStoredNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || []; } catch { return []; }
}

function storeNotification(notif) {
  const stored = getStoredNotifications();
  stored.unshift({ ...notif, id: Date.now(), read: false });
  localStorage.setItem(NOTIF_KEY, JSON.stringify(stored.slice(0, MAX_STORED)));
}

export function markAllRead() {
  const stored = getStoredNotifications().map(n => ({ ...n, read: true }));
  localStorage.setItem(NOTIF_KEY, JSON.stringify(stored));
}

export function clearAllNotifications() {
  localStorage.setItem(NOTIF_KEY, JSON.stringify([]));
}

export function getUnreadCount() {
  return getStoredNotifications().filter(n => !n.read).length;
}

// ── Safe Notification API accessor ──
function getNotifAPI() {
  try { return (typeof window !== 'undefined' && 'Notification' in window) ? window.Notification : null; } catch { return null; }
}

// ── Request permission ──
export async function requestNotificationPermission() {
  const NotifAPI = getNotifAPI();
  if (!NotifAPI) return 'unsupported';
  if (NotifAPI.permission === 'granted') return 'granted';
  if (NotifAPI.permission === 'denied') return 'denied';
  try {
    const result = await NotifAPI.requestPermission();
    return result;
  } catch { return 'unsupported'; }
}

// ── VAPID Base64URL → Uint8Array ──
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

// ── Subscribe to Web Push + store in Supabase ──
export async function subscribeToPush(reg) {
  if (!reg || !reg.pushManager) return null;

  try {
    // Check if already subscribed
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    if (!subscription) return null;

    // Extract keys
    const rawKeys   = subscription.getKey ? {
      p256dh: subscription.getKey('p256dh'),
      auth:   subscription.getKey('auth'),
    } : null;

    if (!rawKeys) return null;

    const toBase64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const subData = {
      endpoint:   subscription.endpoint,
      p256dh:     toBase64(rawKeys.p256dh),
      auth:       toBase64(rawKeys.auth),
      user_agent: navigator.userAgent?.slice(0, 200) || '',
    };

    // Store in Supabase (upsert so re-subscribing is idempotent)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(subData, { onConflict: 'endpoint' });

    if (error) {
      console.warn('[Push] Supabase store error:', error.message);
    } else {
      console.log('[Push] ✅ Device registered for push notifications');
    }

    return subscription;
  } catch (e) {
    console.warn('[Push] subscribeToPush failed:', e.message);
    return null;
  }
}

// ── Register service worker ──
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('[Notif] Service Worker registered:', reg.scope);

    // Try Periodic Background Sync (Chrome Android only)
    if ('periodicSync' in reg) {
      try {
        await reg.periodicSync.register('agritech-data-check', { minInterval: 15 * 60 * 1000 });
        console.log('[Notif] PeriodicSync registered');
      } catch (e) {
        console.log('[Notif] PeriodicSync not available:', e.message);
      }
    }
    return reg;
  } catch (e) {
    console.error('[Notif] SW registration failed:', e);
    return null;
  }
}

// ── Send notification via SW (works when tab is not focused) ──
export async function sendNotification(title, body, tag = 'agritech') {
  const notif = { title, body, tag, timestamp: new Date().toISOString() };
  storeNotification(notif);

  const NotifAPI = getNotifAPI();
  if (!NotifAPI || NotifAPI.permission !== 'granted') return;

  // Route through SW for proper background support
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      payload: { title, body, tag, url: window.location.href }
    });
  } else {
    try {
      new NotifAPI(title, { body, icon: './favicon.svg', tag });
    } catch (e) {
      console.warn('[Notif] Direct notification failed:', e.message);
    }
  }
}

// ── CHANGE DETECTION ENGINE ──
export function detectChanges(prevData, newData) {
  if (!prevData || !newData) return [];
  const changes = [];

  const prevSales = (prevData.sales || []).length;
  const newSales  = (newData.sales  || []).length;
  if (newSales > prevSales) {
    const diff = newSales - prevSales;
    changes.push({
      type: 'NEW_SALE',
      title: '💰 New Sale Recorded',
      body: `${diff} new sale${diff > 1 ? 's' : ''} added to Google Sheets`,
    });
  }

  const prevExpenses = (prevData.expenses || []).length;
  const newExpenses  = (newData.expenses  || []).length;
  if (newExpenses > prevExpenses) {
    const diff = newExpenses - prevExpenses;
    changes.push({
      type: 'NEW_EXPENSE',
      title: '💸 New Expense Logged',
      body: `${diff} new expense${diff > 1 ? 's' : ''} detected in Google Sheets`,
    });
  }

  const prevProd = (prevData.production || []).length;
  const newProd  = (newData.production  || []).length;
  if (newProd > prevProd) {
    const diff = newProd - prevProd;
    changes.push({
      type: 'NEW_PRODUCTION',
      title: '🏭 Production Update',
      body: `${diff} new production log${diff > 1 ? 's' : ''} added`,
    });
  }

  const prevMaint = (prevData.maintenance || []).length;
  const newMaint  = (newData.maintenance  || []).length;
  if (newMaint > prevMaint) {
    const diff = newMaint - prevMaint;
    changes.push({
      type: 'NEW_MAINTENANCE',
      title: '🔧 Maintenance Entry Added',
      body: `${diff} new maintenance record${diff > 1 ? 's' : ''} added`,
    });
  }

  const prevTons = prevData.summary?.totalProduced || 0;
  const newTons  = newData.summary?.totalProduced  || 0;
  if (newTons > prevTons + 0.5) {
    changes.push({
      type: 'PRODUCTION_KPI',
      title: '🏭 Production KPI Updated',
      body: `Total production is now ${newTons.toFixed(2)} tons`,
    });
  }

  return changes;
}

// ── TOAST SYSTEM (in-app visual notifications) ──
const listeners = new Set();

export function subscribeToToasts(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function showToast(title, body, type = 'info') {
  listeners.forEach(fn => fn({ id: Date.now(), title, body, type }));
}
