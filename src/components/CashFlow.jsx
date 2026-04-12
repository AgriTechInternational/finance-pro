import React, { useState } from 'react';
import { formatDisplayDate } from '../lib/parseSheet';
import { supabase, tables } from '../supabase';
import DataEntryModal from './DataEntryModal';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function CashFlow({ data, carryForward, globalStats }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newMove, setNewMove] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Inflow',
    amount: '',
    description: ''
  });

  if (!data || !data.summary) return (
    <div key="cf-sync-state" style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Revolving Cash Flow...</div>
    </div>
  );

  const handleSave = async () => {
    if (!newMove.amount) return alert("Please enter amount");
    setIsSaving(true);
    try {
      const { error } = await supabase.from(tables.CASHFLOW).insert([
        {
          date: newMove.date,
          amount: parseFloat(newMove.amount),
          type: newMove.type,
          description: newMove.description
        }
      ]);
      if (error) throw error;
      setIsModalOpen(false);
      window.location.reload();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const { summary = {}, expenses = [], sales = [] } = data;
  const { 
    totalPaid = 0, totalCosts = 0, availableCash = 0, netProfit = 0, 
    totalRevenue = 0, operatingCosts = 0, materialCosts = 0,
    totalPaidCosts = 0, actualCashSpent = 0,
  } = summary;
  
  // Year-to-Date totals: revenue and costs accumulated across ALL months
  const gRevenue  = (globalStats?.totalRevenue  && globalStats.totalRevenue  > 0) ? globalStats.totalRevenue  : totalRevenue;
  const gCosts    = (globalStats?.totalCosts    && globalStats.totalCosts    > 0) ? globalStats.totalCosts    : totalCosts;
  const accumulatedProfit = gRevenue > 0 || gCosts > 0
    ? Math.round(gRevenue - gCosts)
    : Math.round(netProfit || (totalRevenue - totalCosts));

  const activeOpening = summary.openingBalance || carryForward?.availableCash || 0;

  // Build auto-calculated cash flow timeline from expenses + payments
  const allItems = [
    ...(activeOpening > 0 ? [{ 
      date: '2026-03-01', 
      description: carryForward ? '💰 Carry Forward from Prev Month' : '💰 Starting Balance (Reminder)', 
      inflow: activeOpening, 
      outflow: 0, 
      isOpening: true 
    }] : []),
    ...(sales || [])
      .filter(s => s.paid > 0)
      .map(s => ({ date: s.date, description: `Payment – ${s.customer}`, inflow: s.paid, outflow: 0 })),
    ...(expenses || [])
      .map(e => ({ date: e.date, description: `${e.category}${e.description ? ' – ' + e.description : ''}`, inflow: 0, outflow: e.amount }))
  ].sort((a, b) => {
    if (a.date === b.date) {
      if (a.isOpening) return -1;
      if (b.isOpening) return 1;
    }
    return a.date.localeCompare(b.date);
  });

  // Running balance
  let running = 0;
  const withBalance = allItems.map(row => {
    running += row.inflow - row.outflow;
    return { ...row, balance: running };
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Cash Flow</div>
            <div className="page-sub">Live from Google Sheets + Supabase · Auto-calculated ledger</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <span>+</span> Add Movement
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{
          background: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.04))',
          border: '1px solid rgba(16,185,129,0.3)', borderRadius: 14, padding: '24px 28px'
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent2)', marginBottom: 8 }}>
            💵 Net Cash Available
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 800, color: 'var(--accent2)', lineHeight: 1 }}>
            {fmt(availableCash)} <span style={{ fontSize: 16, opacity: 0.65 }}>EGP</span>
          </div>
        </div>

        {/* ── TOTAL ACCUMULATED PROFIT ── */}
        <div style={{
          background: accumulatedProfit >= 0
            ? 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.03))'
            : 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04))',
          border: `1px solid ${accumulatedProfit >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          borderRadius: 14, padding: '24px 28px'
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: accumulatedProfit >= 0 ? 'var(--accent2)' : 'var(--danger)', marginBottom: 8 }}>
            📈 Year-to-Date Accumulated Profit
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 800, color: accumulatedProfit >= 0 ? 'var(--accent2)' : 'var(--danger)', lineHeight: 1 }}>
            {accumulatedProfit >= 0 ? '+' : ''}{fmt(Math.round(accumulatedProfit || 0))} <span style={{ fontSize: 16, opacity: 0.65 }}>EGP</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Revenue {fmt(Math.round(gRevenue))} − Total Cost of Goods Sold {fmt(Math.round(gCosts))}
          </div>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>📤 Opening Balance</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text1)' }}>{fmt(activeOpening)} <span style={{ fontSize: 16, opacity: 0.65 }}>EGP</span></div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{carryForward ? 'Auto-carried from prev month' : 'Sheet Reminder'}</div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04))',
          border: '1px solid rgba(59,130,246,0.25)', borderRadius: 14, padding: '24px 28px'
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 8 }}>
            📥 Total Collected
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
            {fmt(totalPaid)} <span style={{ fontSize: 16, opacity: 0.65 }}>EGP</span>
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04))',
          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '24px 28px'
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--danger)', marginBottom: 8 }}>
            📤 Total Cash Spent (This Month)
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 800, color: 'var(--danger)', lineHeight: 1 }}>
            {fmt(Math.round(actualCashSpent || (materialCosts + operatingCosts)))} <span style={{ fontSize: 16, opacity: 0.65 }}>EGP</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Materials {fmt(Math.round(materialCosts))} + Operating {fmt(Math.round(operatingCosts))}
          </div>
        </div>
      </div>

      {/* Transaction log */}
      <div className="card shadow-soft">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)' }}>📒 Cash Flow Ledger</h6>
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20 }}>
            {withBalance.length} entries
          </span>
        </div>
        <div className="table-wrap px-0">
          {withBalance.length === 0 ? (
            <div className="empty" style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
              <div>No cash flow data yet — connect a Google Sheet in Settings</div>
            </div>
          ) : (
            <table className="table align-items-center mb-0">
              <thead>
                <tr>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Date</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Description</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Inflow</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Outflow</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>
                      {formatDisplayDate(r.date)}
                    </td>
                    <td>
                      <div className="px-3" style={{ fontSize: 12, color: 'var(--text2)' }}>{r.description}</div>
                    </td>
                    <td className="px-3 text-end">
                      {r.inflow > 0 ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent2)', fontWeight: 700 }}>+{fmt(r.inflow)}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td className="px-3 text-end">
                      {r.outflow > 0 ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--danger)', fontWeight: 700 }}>({fmt(r.outflow)})</span> : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td className="px-3 text-end">
                      <strong style={{ fontFamily: 'var(--mono)', color: r.balance >= 0 ? 'var(--accent2)' : 'var(--danger)', fontSize: 13 }}>
                        {fmt(r.balance)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DataEntryModal 
        title="Manual Cash Movement" 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave}
        loading={isSaving}
      >
        <div className="field">
          <label>Date</label>
          <input type="date" value={newMove.date} onChange={e => setNewMove({...newMove, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Movement Type</label>
          <select value={newMove.type} onChange={e => setNewMove({...newMove, type: e.target.value})}>
            <option value="Inflow">Inflow (Cash IN)</option>
            <option value="Outflow">Outflow (Cash OUT)</option>
          </select>
        </div>
        <div className="field">
          <label>Amount (EGP)</label>
          <input type="number" placeholder="0.00" value={newMove.amount} onChange={e => setNewMove({...newMove, amount: e.target.value})} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea placeholder="e.g. Petty cash, loan, etc..." value={newMove.description} onChange={e => setNewMove({...newMove, description: e.target.value})} />
        </div>
      </DataEntryModal>
    </div>
  );
}

export default CashFlow;
