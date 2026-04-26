import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';

// CUSTOM STORAGE: Explicitly avoid navigator.locks to prevent "Stuck" login hangs
const customStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  }
};

const getSupabase = () => {
  if (typeof window !== 'undefined' && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'agritech-finance-v1',
      storage: customStorage, // Use non-locking storage
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'implicit'
    }
  });
  if (typeof window !== 'undefined') {
    window.__supabaseInstance = client;
  }
  return client;
};

export const supabase = getSupabase();

export const tables = {
  PROFILES: 'profiles',
  EXPENSES: 'expenses',
  TRANSACTIONS: 'partner_transactions',
  INVENTORY: 'inventory',
  CASHFLOW: 'cashflow',
  SHEET_CONFIGS: 'sheet_configs',
  PRODUCTION: 'production',
  MATERIALS: 'inventory',
  SALES: 'sales',
  ATTENDANCE: 'attendance'
};

export const fmt   = n  => n == null ? "—" : Number(n).toLocaleString("en-EG");
export const toNum = v => { const n = parseFloat((v||"").toString().replace(/,/g,"")); return isNaN(n) ? 0 : n; };
export const today = () => new Date().toISOString().slice(0, 10);
