import React, { useState } from 'react';
import { formatDisplayDate } from '../lib/parseSheet';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtDec = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function Maintenance({ data }) {
  const [activeSubTab, setActiveSubTab] = useState('maintenance');

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div className="spinner" style={{ margin: '0 auto 20px' }} />
      <div>Syncing Maintenance Data...</div>
    </div>
  );

  const allExpenses = data.expenses || [];
  
  // Sub-tab 1: Maintenance
  // Use the pre-filtered data.maintenance array (already filtered from Daily Expenses by engine)
  // PLUS any additional entries in expenses tagged as maintenance
  const maintenanceFromExp = allExpenses.filter(e => {
    const cat  = (e.category || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    return cat === 'maintenance' || cat.includes('maint') || desc.includes('maintenance');
  });
  // Merge and deduplicate by date+description
  const maintenanceSeen = new Set();
  const maintenanceData = [
    ...(data.maintenance || []),
    ...maintenanceFromExp
  ].filter(e => {
    const key = `${e.date}-${e.description}-${e.amount}`;
    if (maintenanceSeen.has(key)) return false;
    maintenanceSeen.add(key);
    return true;
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  // Sub-tab 2: Tools — filter from ALL expenses by category or description
  const toolsData = allExpenses.filter(e => {
    const cat  = (e.category || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    return cat === 'tools' || cat.includes('tool') || desc.includes('tools') || desc.includes('tool');
  });

  const currentDisplayData = activeSubTab === 'maintenance' ? maintenanceData : toolsData;
  const totalProducedTons = (data.summary?.totalProduced || 0);

  const totalCurrent = currentDisplayData.reduce((s, e) => s + (e.amount || 0), 0);
  const costPerTon   = totalProducedTons > 0 ? totalCurrent / totalProducedTons : 0;

  return (
    <div className="page-fade">
      <div className="page-header" style={{ marginBottom: 30 }}>
        <div>
          <div className="page-title">Technical Operations Ledger</div>
          <div className="page-sub">Maintenance tracking and tool procurement analysis.</div>
        </div>
        
        {/* Sub-tab Navigation */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
          <button 
            onClick={() => setActiveSubTab('maintenance')}
            style={{ 
              padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: activeSubTab === 'maintenance' ? 'var(--accent)' : 'transparent',
              color: activeSubTab === 'maintenance' ? 'white' : 'var(--text3)',
              transition: '0.2s'
            }}
          >
            🔧 Maintenance
          </button>
          <button 
            onClick={() => setActiveSubTab('tools')}
            style={{ 
              padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: activeSubTab === 'tools' ? 'var(--accent)' : 'transparent',
              color: activeSubTab === 'tools' ? 'white' : 'var(--text3)',
              transition: '0.2s'
            }}
          >
            🛠️ Tools
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 30 }}>
        <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)', marginBottom: 8 }}>
            {activeSubTab.toUpperCase()} EXPENDITURE
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>
            {fmt(totalCurrent)} <span style={{ fontSize: 14, opacity: 0.5 }}>EGP</span>
          </div>
        </div>

        <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent2)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)', marginBottom: 8 }}>
            COST PER TON (PRODUCED)
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>
            {fmtDec(costPerTon)} <span style={{ fontSize: 14, opacity: 0.5 }}>EGP/t</span>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="card shadow-soft">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.05em' }}>
            {activeSubTab} History
          </div>
          <div style={{ fontSize: 11, background: 'var(--bg3)', padding: '2px 8px', borderRadius: 6, color: 'var(--text3)' }}>
            Showing {currentDisplayData.length} records
          </div>
        </div>
        
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {currentDisplayData.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                    No items found matching "{activeSubTab}" in the Daily Expenses log.
                  </td>
                </tr>
              ) : (
                currentDisplayData.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{formatDisplayDate(e.date)}</td>
                    <td style={{ color: 'var(--text2)' }}>{e.description || '—'}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>
                        {e.category}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                      {fmt(e.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {currentDisplayData.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th colSpan={3} style={{ textAlign: 'right', padding: 20 }}>SUBTOTAL</th>
                  <th style={{ textAlign: 'right', padding: 20, color: 'var(--text1)', fontSize: 18 }}>{fmt(totalCurrent)} EGP</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <style>{`
        .table { width: 100%; border-collapse: collapse; }
        .table th { text-align: left; padding: 16px 24px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text3); border-bottom: 1px solid var(--border); }
        .table td { padding: 16px 24px; border-bottom: 1px solid var(--border); font-size: 13px; }
      `}</style>
    </div>
  );
}

export default Maintenance;
