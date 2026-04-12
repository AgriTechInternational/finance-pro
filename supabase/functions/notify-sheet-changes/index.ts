// ============================================================
// notify-sheet-changes — AgriTech Finance Pro
// Supabase Edge Function (Cron: every 15 minutes)
// Polls Google Sheets → detects changes → sends Web Push
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT        = 'mailto:agritechinternationalfactory@gmail.com';

// ── Tabs to spot-check for row-count changes ──
const WATCH_TABS = [
  { name: 'DailyProduction',    type: 'PRODUCTION',  emoji: '🏭', label: 'Production Update' },
  { name: 'DailyExpenses',      type: 'EXPENSES',    emoji: '💸', label: 'Expense Logged' },
  { name: 'Wageh',              type: 'SALES',       emoji: '💰', label: 'New Sale — Wageh' },
  { name: 'Nour',               type: 'SALES',       emoji: '💰', label: 'New Sale — Nour' },
  { name: 'Tharwat',            type: 'SALES',       emoji: '💰', label: 'New Sale — Tharwat' },
  { name: 'Elwady',             type: 'SALES',       emoji: '💰', label: 'New Sale — Elwady' },
  { name: 'MaterialInventory',  type: 'MATERIALS',   emoji: '📦', label: 'Material Received' },
  { name: 'AttendanceSheet',    type: 'ATTENDANCE',  emoji: '📋', label: 'Attendance Updated' },
];

// ── Fetch a tab from Google Sheets and count non-empty rows ──
async function fetchRowCount(sheetId: string, tabName: string): Promise<number> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return -1;
    const text = await res.text();
    if (!text || text.includes('<html') || text.includes('Error')) return -1;
    return text.split('\n').filter(l => l.trim().length > 2).length;
  } catch {
    return -1;
  }
}

// ── Build snapshot for one sheet ──
async function buildSnapshot(sheetId: string): Promise<Record<string, number>> {
  const results = await Promise.all(
    WATCH_TABS.map(async tab => ({
      key: tab.name,
      count: await fetchRowCount(sheetId, tab.name)
    }))
  );
  return Object.fromEntries(results.filter(r => r.count >= 0).map(r => [r.key, r.count]));
}

// ── Detect changes between two snapshots ──
function detectChanges(prev: Record<string, number>, curr: Record<string, number>) {
  const changes: { type: string; title: string; body: string }[] = [];
  for (const tab of WATCH_TABS) {
    const prevCount = prev[tab.name] ?? -1;
    const currCount = curr[tab.name] ?? -1;
    if (prevCount < 0 || currCount < 0) continue;
    const diff = currCount - prevCount;
    if (diff > 0) {
      changes.push({
        type: tab.type,
        title: `${tab.emoji} ${tab.label}`,
        body: `${diff} new row${diff > 1 ? 's' : ''} added to Google Sheets`,
      });
    }
  }
  return changes;
}

// ── Base64URL helpers ──
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Build VAPID Authorization header ──
async function buildVapidAuth(audience: string) {
  const now = Math.floor(Date.now() / 1000);
  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: now + 43200, sub: VAPID_SUBJECT };

  const encode = (obj: object) => uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${encode(header)}.${encode(payload)}`;

  const privBytes = base64UrlToUint8Array(VAPID_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;
  return `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;
}

// ── Send Web Push notification to a single subscription ──
async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, title: string, body: string, type: string) {
  try {
    const url   = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const vapidAuth = await buildVapidAuth(audience);

    // Encrypt payload using Web Push encryption (RFC 8291)
    const payload = JSON.stringify({ title, body, tag: type, url: '/finance-pro/' });
    const payloadBytes = new TextEncoder().encode(payload);

    // Generate salt and local key pair
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const localKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const localPubKey  = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);

    // Derive shared secret using ECDH
    const remoteKey = await crypto.subtle.importKey('raw', base64UrlToUint8Array(sub.p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: remoteKey }, localKeyPair.privateKey, 256);

    // HKDF to derive encryption key and nonce
    const authBytes = base64UrlToUint8Array(sub.auth);
    const prk = await crypto.subtle.importKey('raw', sharedBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const ikm  = new Uint8Array(await crypto.subtle.sign('HMAC', prk, new Uint8Array([...authBytes, ...new TextEncoder().encode('Content-Encoding: auth\0'), 1])));
    const serverPub = new Uint8Array(localPubKey);
    const keyInfo   = new Uint8Array([...new TextEncoder().encode('Content-Encoding: aesgcm\0'), ...new Uint8Array(2), ...new Uint8Array(65), ...serverPub]);
    const keyIkm    = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const contentKey = new Uint8Array((await crypto.subtle.sign('HMAC', keyIkm, new Uint8Array([...keyInfo, 1]))).slice(0, 16));

    const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: salt.slice(0, 12) }, aesKey, payloadBytes);

    const body64 = uint8ArrayToBase64Url(new Uint8Array(encrypted));

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidAuth,
        'Content-Type':  'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'Encryption': `salt=${uint8ArrayToBase64Url(salt)}`,
        'Crypto-Key': `dh=${uint8ArrayToBase64Url(serverPub)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
        'TTL': '86400',
      },
      body: base64UrlToUint8Array(body64),
    });

    return res.status < 300 || res.status === 201;
  } catch (e) {
    console.error('[Push] Failed to send:', e);
    return false;
  }
}

// ── MAIN HANDLER ──
Deno.serve(async () => {
  console.log('[notify-sheet-changes] Cron fired at', new Date().toISOString());
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Fetch all configured sheet IDs
  const { data: configs } = await supabase
    .from('sheet_configs')
    .select('sheet_id, label');

  if (!configs || configs.length === 0) {
    return new Response(JSON.stringify({ status: 'no sheets configured' }), { status: 200 });
  }

  // 2. Fetch all push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ status: 'no subscribers' }), { status: 200 });
  }

  const allChanges: { type: string; title: string; body: string }[] = [];

  // 3. Process each sheet
  for (const config of configs) {
    const sheetId = config.sheet_id;

    // Load existing snapshot
    const { data: snapshotRow } = await supabase
      .from('sheet_snapshots')
      .select('snapshot')
      .eq('sheet_id', sheetId)
      .maybeSingle();

    const prevSnapshot: Record<string, number> = snapshotRow?.snapshot ?? {};

    // Build current snapshot
    const currSnapshot = await buildSnapshot(sheetId);

    // Detect changes
    const changes = detectChanges(prevSnapshot, currSnapshot);
    allChanges.push(...changes);

    // Update snapshot in DB
    await supabase.from('sheet_snapshots').upsert({
      sheet_id:   sheetId,
      snapshot:   currSnapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sheet_id' });
  }

  // 4. Send push notifications for all detected changes
  if (allChanges.length > 0) {
    const deduplicated = allChanges.reduce((acc, c) => {
      if (!acc.find(x => x.type === c.type)) acc.push(c);
      return acc;
    }, [] as typeof allChanges);

    for (const change of deduplicated) {
      await Promise.allSettled(
        subscriptions.map(sub => sendPush(sub, change.title, change.body, change.type))
      );
    }
  }

  return new Response(JSON.stringify({
    status: 'ok',
    sheetsChecked: configs.length,
    changesDetected: allChanges.length,
    subscribersNotified: allChanges.length > 0 ? subscriptions.length : 0,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
