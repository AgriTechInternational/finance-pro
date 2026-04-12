// ============================================================
// monthRegistry.js — Cloud-Synced Month Sheet Registry
// ============================================================
import { supabase } from '../supabase';

const STORAGE_KEY = 'agritech_month_registry';
const ACTIVE_KEY  = 'agritech_active_sheet';
const SYNC_URL_KEY = 'agritech_sync_url';

// ── HARDCODED DEFAULTS — always available on every device, cannot be lost ──
const HARDCODED_MONTHS = [
  {
    sheetId: '1qsM50OxtDNqDeWBxKKHHNRWBJwkXwuNQzsTJEGrMsCY',
    label:   'March 2026',
    month:   3,
    year:    2026,
    addedAt: 0
  },
  {
    sheetId: '11Tf5W3euky4Z_1svgWUOuiRDOYl3YKEv95oM6fwuGkg',
    label:   'April 2026',
    month:   4,
    year:    2026,
    addedAt: 1
  },
];
// Keep a single reference for legacy fallback
const DEFAULT_MONTH = HARDCODED_MONTHS[0];

// ── HELPER: TIMEOUT WRAPPER ──
async function wrapWithTimeout(promise, timeoutMs = 8000, fallbackValue = null) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await promise;
    clearTimeout(id);
    return result;
  } catch (e) {
    clearTimeout(id);
    console.warn(`Registry Timeout or Error after ${timeoutMs}ms:`, e.name === 'AbortError' ? 'ABORTED' : e.message);
    return fallbackValue;
  }
}

// ── GET ALL MONTHS ──
export function getMonthsSynced(userObject = null) {
  const localMonths = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

  return new Promise(async (resolve) => {
    const cloudPromise = (async () => {
      try {
        let user = userObject;
        if (!user) {
          const { data: { session }, error: authErr } = await supabase.auth.getSession();
          if (authErr || !session?.user) return null;
          user = session.user;
        }

        const { data, error } = await supabase
          .from('sheet_configs')
          .select('*')
          .eq('owner_id', user.id)
          .order('year', { ascending: true })
          .order('month', { ascending: true });

        if (error) {
          console.warn('Cloud Registry Fetch Error:', error.message);
          return null;
        }
        return data;
      } catch (e) {
        return null;
      }
    })();

    // Race cloud against a 2.5s patience timer
    const result = await Promise.race([
      cloudPromise,
      new Promise(res => setTimeout(() => res(null), 2500))
    ]);

    // ── SMART MERGE: Hardcoded defaults → localStorage → Cloud ──
    // Hardcoded months form an immovable baseline that can never be lost
    const mergedMap = new Map();
    HARDCODED_MONTHS.forEach(m => mergedMap.set(`${m.year}-${m.month}`, m));
    localMonths.forEach(m => mergedMap.set(`${m.year}-${m.month}`, m));

    if (Array.isArray(result) && result.length > 0) {
      const cloudMapped = result.map(d => ({
        sheetId: d.sheet_id,
        label:   d.label,
        month:   d.month,
        year:    d.year,
        addedAt: new Date(d.created_at).getTime() || Date.now()
      }));
      cloudMapped.forEach(m => mergedMap.set(`${m.year}-${m.month}`, m));
    }

    const finalMonths = Array.from(mergedMap.values())
      .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));

    // Persist merged result to localStorage for next session
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalMonths));

    resolve(finalMonths);
  });
}

// ── ADD NEW MONTH ──
export async function addMonthSynced({ sheetId, label, month, year }, userObject = null) {
  await wrapWithTimeout((async () => {
    let user = userObject;
    if (!user) {
      const { data: { session } } = await supabase.auth.getSession();
      user = session?.user;
    }
    if (!user) return;

    const { error } = await supabase.from('sheet_configs').insert([{
      owner_id: user.id,
      sheet_id: sheetId,
      label,
      month:   parseInt(month),
      year:    parseInt(year),
      is_active: false
    }]);
    if (error) console.warn('Cloud Sync Insert Error:', error.message);
  })());

  // Always proceed to local fallback and force append!
  const months = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  
  // Remove existing entry for exactly this month/year so we can update it cleanly if they replace a month
  const filtered = months.filter(m => !(m.year === parseInt(year) && m.month === parseInt(month)));
  
  const updated = [
    ...filtered,
    { sheetId, label, month: parseInt(month), year: parseInt(year), addedAt: Date.now() }
  ].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

// ── REMOVE MONTH ──
export async function removeMonthSynced(sheetId) {
  await wrapWithTimeout((async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      await supabase.from('sheet_configs').delete().eq('owner_id', user.id).eq('sheet_id', sheetId);
    }
  })());

  const updated = (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).filter(m => m.sheetId !== sheetId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

// ── ACTIVE SHEET SYNC ──
export async function getActiveSheetIdSynced(userObject = null) {
  const localId = localStorage.getItem(ACTIVE_KEY);
  
  const cloudId = await wrapWithTimeout((async () => {
    let user = userObject;
    if (!user) {
      const { data: { session } } = await supabase.auth.getSession();
      user = session?.user;
    }
    if (!user) return null;
    const { data } = await supabase
      .from('sheet_configs')
      .select('sheet_id')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    return data?.sheet_id || null;
  })(), 4000); // Shorter timeout for active sheet to keep UI snappy

  if (cloudId) {
    localStorage.setItem(ACTIVE_KEY, cloudId);
    return cloudId;
  }

  // Try localStorage, then fall back to hardcoded default
  return localId || DEFAULT_MONTH.sheetId;
}

export async function setActiveSheetIdSynced(id, userObject = null) {
  await wrapWithTimeout((async () => {
    let user = userObject;
    if (!user) {
      const { data: { session } } = await supabase.auth.getSession();
      user = session?.user;
    }
    if (user) {
      await supabase.from('sheet_configs').update({ is_active: false }).eq('owner_id', user.id);
      await supabase.from('sheet_configs').update({ is_active: true }).eq('owner_id', user.id).eq('sheet_id', id);
    }
  })());
  localStorage.setItem(ACTIVE_KEY, id);
}

// Legacy exports (kept for logic fallback/compatibility)
export function getMonths() { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [DEFAULT_MONTH]; }
export function getActiveSheetId() { return localStorage.getItem(ACTIVE_KEY) || DEFAULT_MONTH.sheetId; }
export function setActiveSheetId(id) { localStorage.setItem(ACTIVE_KEY, id); }

// ── SYNC URL PERSISTENCE ──
export function getSyncUrl() {
  return localStorage.getItem(SYNC_URL_KEY) || '';
}

export function setSyncUrl(url) {
  localStorage.setItem(SYNC_URL_KEY, url);
}

export function extractSheetId(urlOrId) {
  if (!urlOrId) return null;
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId.trim();
}

export function extractGid(url) {
  if (!url) return null;
  const match = url.match(/[?&]gid=([0-9]+)/);
  return match ? match[1] : null;
}
