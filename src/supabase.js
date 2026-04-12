import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';

// SINGLETON PATTERN: Prevents "Lock Stolen" errors in high-refresh environments like Vite
const getSupabase = () => {
  if (typeof window !== 'undefined' && window.__supabaseInstance) {
    return window.__supabaseInstance;
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'agritech-finance-v1',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Using implicit flow to avoid NavigatorLockAcquireTimeoutError 
      // which occurs with pkce when multiple tabs are open on same origin
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
  SHEET_CONFIGS: 'sheet_configs'
};

export const fmt   = n  => n == null ? "—" : Number(n).toLocaleString("en-EG");
export const toNum = v => { const n = parseFloat((v||"").toString().replace(/,/g,"")); return isNaN(n) ? 0 : n; };
export const today = () => new Date().toISOString().slice(0, 10);
