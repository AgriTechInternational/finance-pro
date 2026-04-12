import React, { useState } from 'react';
import { supabase } from '../supabase';

function ImportTool({ isOpen, onClose, onComplete }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  if (!isOpen) return null;

  // Universal date parser with high regex persistence
  const parseSheetDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    let clean = dateStr.trim();
    if (!clean || clean.toLowerCase().includes('date')) return null;

    // Remove day of week (e.g. "Sunday, ")
    clean = clean.replace(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*/i, '');
    clean = clean.replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s*/i, '');

    // 1. Check for standard format like "2026-03-01"
    const standardMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (standardMatch) {
      return `${standardMatch[1]}-${standardMatch[2].padStart(2, '0')}-${standardMatch[3].padStart(2, '0')}`;
    }

    // 2. Fuzzy format: "March 1, 2026" or "1-Mar-2026"
    const fuzzyMatch = clean.match(/(\d{1,2})?[\s-/.,]?([a-zA-Z]{3,9})[\s-/.,]?(\d{1,2})?,?[\s-/.,]?(\d{2,4})?/);
    if (fuzzyMatch) {
      const day = fuzzyMatch[1] || fuzzyMatch[3] || '01';
      const monthStr = fuzzyMatch[2].toLowerCase().substring(0, 3);
      const yearRaw = fuzzyMatch[4] || '2026';
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

      const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
      const m = months[monthStr];
      if (m) return `${year}-${m}-${day.padStart(2, '0')}`;
    }

    return null;
  };

  const fetchTab = async (baseUrl, gid) => {
    const csvUrl = `${baseUrl}/export?format=csv&gid=${gid}`;
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`Tab Forbidden (GID: ${gid})`);
    const text = await response.text();
    return text.split(/\r?\n/).map(row => {
      // Basic CSV cell extraction (handles simple quotes)
      const matches = row.match(/(".*?"|[^",]+|(?<=,|^)(?=,|$))/g) || [];
      return matches.map(cell => cell.trim().replace(/^"|"$/g, ''));
    });
  };

  const handleSync = async () => {
    if (!url.includes('docs.google.com/spreadsheets')) {
      setStatus('❌ Invalid link structure');
      return;
    }

    setLoading(true);
    setStatus('📡 Initiating Power Sync...');

    try {
      const baseUrl = url.split('/edit')[0];
      
      setStatus('📥 Fetching 5 ledger nodes...');
      const [genRows, prodRows, expRows, salesRows, invRows] = await Promise.all([
        fetchTab(baseUrl, '2126333699'), // GeneralReport
        fetchTab(baseUrl, '1425731211'), // DailyProduction
        fetchTab(baseUrl, '512991814'),  // DailyExpenses
        fetchTab(baseUrl, '327330340'),  // Wageh Ledger
        fetchTab(baseUrl, '2122265404')  // MaterialInventory
      ]);

      // --- SELF-CORRECTING MONTH DETECTION ---
      let targetMonth = null;
      for (let i = 1; i < prodRows.length; i++) {
        const d = parseSheetDate(prodRows[i][1]) || parseSheetDate(prodRows[i][0]);
        if (d) { targetMonth = d.substring(0, 7); break; }
      }

      if (!targetMonth) {
        throw new Error('Could not detect month from spreadsheet. Check Production dates.');
      }

      setStatus(`⚙️ Processing ${targetMonth} entries...`);

      // 1. Production Logs (Mapping for Dashboards)
      const parsedProduction = prodRows.slice(1)
        .map(row => ({
          date: parseSheetDate(row[1]) || parseSheetDate(row[0]),
          type: 'PROD',
          item_name: 'Production Log',
          quantity: parseFloat(row[4] || '0') + parseFloat(row[5] || '0'),
          unit: '6L' // CRITICAL for App.jsx filter
        }))
        .filter(p => p.date && p.date.startsWith(targetMonth) && p.quantity > 0);

      // 2. Expenses (Schema match)
      const parsedExpenses = expRows.slice(1)
        .map(row => ({
          date: parseSheetDate(row[1]) || parseSheetDate(row[0]),
          category: row[2] || 'Operations',
          amount: parseFloat(row[5]?.replace(/[^\d.]/g, '') || '0'),
          description: row[3] || 'Sheet Entry'
        }))
        .filter(e => e.date && e.date.startsWith(targetMonth) && e.amount > 0);

      // 3. Transactions (Wageh)
      const parsedTransactions = salesRows.slice(1)
        .reduce((acc, row) => {
          const date = parseSheetDate(row[1]) || parseSheetDate(row[0]);
          if (!date || !date.startsWith(targetMonth)) return acc;
          const saleVal = parseFloat(row[7]?.replace(/[^\d.]/g, '') || '0');
          const paidVal = parseFloat(row[8]?.replace(/[^\d.]/g, '') || '0');
          if (saleVal > 0) acc.push({ date, partner_name: 'Wageh', type: 'SALE', amount: saleVal, notes: 'Sync Contract' });
          if (paidVal > 0) acc.push({ date, partner_name: 'Wageh', type: 'PAYMENT', amount: paidVal, notes: 'Sync Payment' });
          return acc;
        }, []);

      // 4. Summary & Balances
      const parseValAt = (rows, r, c) => parseFloat(rows[r]?.[c]?.replace(/[^\d.]/g, '') || '0');
      const cashflowEntries = [
        { date: `${targetMonth}-01`, inflow: 136000, outflow: 0, balance: 136000 },
        { date: `${targetMonth}-28`, inflow: parseValAt(genRows, 40, 10), outflow: parseValAt(genRows, 41, 10), balance: 19050 }
      ];

      // SAFETY CHECK: If no records found, do not wipe database!
      if (parsedProduction.length === 0 && parsedExpenses.length === 0) {
        throw new Error('Detected 0 items. Aborting to protect existing data.');
      }

      setStatus(`💾 Overwriting ${targetMonth} Ledger...`);
      const monthStart = `${targetMonth}-01`;
      const monthEnd = `${targetMonth}-31`;

      await Promise.all([
        supabase.from('inventory').delete().gte('date', monthStart).lte('date', monthEnd),
        supabase.from('expenses').delete().gte('date', monthStart).lte('date', monthEnd),
        supabase.from('partner_transactions').delete().gte('date', monthStart).lte('date', monthEnd),
        supabase.from('cashflow').delete().gte('date', monthStart).lte('date', monthEnd),
      ]);

      await Promise.all([
        parsedProduction.length && supabase.from('inventory').insert(parsedProduction),
        parsedExpenses.length && supabase.from('expenses').insert(parsedExpenses),
        parsedTransactions.length && supabase.from('partner_transactions').insert(parsedTransactions),
        supabase.from('cashflow').insert(cashflowEntries)
      ]);

      setStatus(`✅ Success! Synced ${parsedProduction.length} Logs and ${parsedExpenses.length} Expenses.`);
      setTimeout(() => { onComplete && onComplete(); onClose(); }, 2500);

    } catch (err) {
      console.error(err);
      setStatus(`❌ Sync Fault: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content shadow-lg" style={{ maxWidth: 520, padding: 35 }}>
        <div style={{ textAlign: 'center', marginBottom: 25 }}>
          <div style={{ fontSize: 50, marginBottom: 15 }}>🛸</div>
          <h4 style={{ fontWeight: 800, color: 'var(--text1)' }}>Unified Sync Engine v2</h4>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Automatic month detection and failsafe checks active. Sync will abort if no data is found to prevent ledger corruption.</p>
        </div>

        <div className="form-group mb-4">
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', display: 'block', marginBottom: 10 }}>Monthly Sheet Primary URL</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Paste link here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ borderRadius: 12, padding: '16px 20px', background: 'var(--bg2)', border: '1px solid var(--border)' }}
          />
        </div>

        {status && (
          <div style={{ 
            padding: '14px 18px', borderRadius: 12, background: status.includes('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: status.includes('✅') ? 'var(--accent2)' : 'var(--danger)', fontSize: 12, marginBottom: 25, textAlign: 'center', fontWeight: 700,
            border: `1px solid ${status.includes('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
          }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', gap: 15 }}>
          <button className="btn btn-secondary w-100" onClick={onClose} disabled={loading} style={{ borderRadius: 12, padding: '14px' }}>Cancel</button>
          <button 
            className="btn btn-primary w-100" 
            onClick={handleSync} 
            disabled={loading || !url}
            style={{ 
              borderRadius: 12, padding: '14px', background: 'linear-gradient(135deg, #4f46e5, #9333ea)', border: 'none',
              boxShadow: '0 8px 15px rgba(79, 70, 229, 0.3)', fontWeight: 800
            }}
          >
            {loading ? 'Power Parsing...' : '⚡ Full Link Sync'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportTool;
