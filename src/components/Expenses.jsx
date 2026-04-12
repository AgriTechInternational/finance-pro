import React, { useState } from 'react';
import { formatDisplayDate } from '../lib/parseSheet';
import { supabase, tables } from '../supabase';
import DataEntryModal from './DataEntryModal';
import { requestDeletion } from '../lib/audit';

const fmt    = (n)      => Number(n || 0).toLocaleString('en-US');
const fmtDec = (n, d=2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Categories counted as "fixed" costs
const FIXED_CATEGORIES = ['rent', 'salary', 'salaries', 'fixed', 'monthly', 'insurance', 'loan', 'depreciation'];

function isFixed(category) {
  const c = (category || '').toLowerCase().trim();
  return FIXED_CATEGORIES.some(k => c.includes(k));
}

// Canonical worker keys and display labels
const WORKER_KEYS   = ['gomaa', 'ibrahim', 'mahmoud'];
const WORKER_LABELS = { gomaa: 'Gomaa', ibrahim: 'Ibrahim', mahmoud: 'Mahmoud' };

function Expenses({ data, globalStats = {}, user, role, isAdmin, isSuper }) {
  const [filter, setFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newExp, setNewExp] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'Maintenance',
    amount: '',
    description: ''
  });

  const EXPENSE_CATEGORIES = [
    'Rent',
    'Salaries',
    'Electricity',
    'Maintenance',
    'Tools',
    'Logistics',
    'Marketing',
    'Office Supplies',
    'Insurance',
    'Other'
  ];

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>🔄</div>
      <div>Syncing Expenses with Google Sheets...</div>
    </div>
  );

  const handleSave = async () => {
    if (!newExp.category || !newExp.amount) return alert("Please fill in category and amount");
    setIsSaving(true);
    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
    try {
      const { error } = await supabase.from(tables.EXPENSES).insert([
        { 
          date: newExp.date, 
          category: newExp.category, 
          amount: parseFloat(newExp.amount), 
          description: newExp.description,
          is_dev_test: isTest
        }
      ]);
      if (error) throw error;
      setIsModalOpen(false);
      setNewExp({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: '', description: '' });
      window.location.reload(); // Refresh to show merge
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!isAdmin) return;
    if (item._isSalary) return alert("Salaries cannot be deleted from here. They are calculated automatically.");
    
    if (!window.confirm("Are you sure you want to request deletion for this expense? This will require approval from a Super User.")) return;
    
    setIsSaving(true);
    try {
      const { error } = await requestDeletion(tables.EXPENSES, item.id, user.email);
      if (error) throw error;
      window.location.reload();
    } catch (e) {
      alert("Delete Request Failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const { expenses = [], summary = {}, teamPerformance = {} } = data;
  // summary.totalProduced is ALREADY in tons (engine stores producedBags/50)
  const totalProducedTons = summary.totalProduced || 0;
  const totalProducedBags = summary.totalProducedBags || Math.round(totalProducedTons * 50);

  // ── Build salary entries from teamPerformance ──
  // Each worker's net salary is a fixed monthly labour cost.
  const salaryEntries = WORKER_KEYS
    .map(key => {
      const perf = teamPerformance[key];
      if (!perf) return null;
      const amount = perf.salary || perf.outstanding || 0;
      if (amount <= 0) return null;
      return {
        date:       null,
        category:   'Salaries',
        description: `${WORKER_LABELS[key]} — ${perf.status || ''}`,
        amount,
        _isSalary:  true,
        _worker:    WORKER_LABELS[key],
        _status:    perf.status,
      };
    })
    .filter(Boolean);

  const totalSalaries = salaryEntries.reduce((s, e) => s + e.amount, 0);

  // Salaries come first, then ledger expenses
  const allExpenses      = [...salaryEntries, ...expenses];
  const fixedExpenses    = allExpenses.filter(e =>  isFixed(e.category));
  const variableExpenses = allExpenses.filter(e => !isFixed(e.category));

  const totalFixed    = fixedExpenses.reduce((s, e)    => s + (e.amount || 0), 0);
  const totalVariable = variableExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalExp      = totalFixed + totalVariable;

  const fixedCostPerTon    = totalProducedTons > 0 ? totalFixed    / totalProducedTons : 0;
  const variableCostPerTon = totalProducedTons > 0 ? totalVariable / totalProducedTons : 0;
  const totalCostPerTon    = totalProducedTons > 0 ? totalExp      / totalProducedTons : 0;

  // YTD comparison (all months combined) to provide context for low-production months
  const ytdTotalProduced    = globalStats.totalProduced  || 0;  // tons
  const ytdTotalCosts       = globalStats.totalCosts     || 0;  // already includes all months' expenses
  const ytdCostPerTon       = ytdTotalProduced > 0 ? ytdTotalCosts / ytdTotalProduced : 0;
  const isLowProduction     = totalProducedTons > 0 && totalProducedTons < 1.0;  // < 1 ton = inflated per-ton

  // Category breakdown
  const displayedExpenses = filter === 'fixed' ? fixedExpenses
    : filter === 'variable' ? variableExpenses : allExpenses;

  const byCategory = displayedExpenses.reduce((acc, e) => {
    const cat = e.category || 'Other';
    acc[cat] = (acc[cat] || 0) + e.amount;
    return acc;
  }, {});

  const base = filter === 'fixed' ? totalFixed : filter === 'variable' ? totalVariable : totalExp;
  const categories = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, total]) => ({ cat, total, pct: base > 0 ? ((total / base) * 100).toFixed(1) : '0.0' }));

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Expenses Ledger</div>
            <div className="page-sub">
              Live from Google Sheets + Supabase · Fixed &amp; variable cost breakdown ·{' '}
              {totalProducedTons > 0 ? `${fmtDec(totalProducedTons)} tons produced this period` : 'No production data yet'}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <span>+</span> Add Expense
          </button>
        </div>
      </div>

      {/* ── SALARIES BANNER ── */}
      {salaryEntries.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))',
          border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12,
          padding: '14px 20px', marginBottom: 20, gap: 16, flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>💼</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8b5cf6' }}>
                Worker Salaries — Fixed Labour Cost
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Included in fixed costs · {salaryEntries.length} workers
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {salaryEntries.map(e => (
              <div key={e._worker} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{e._worker}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#8b5cf6', fontFamily: 'var(--mono)' }}>
                  {fmt(e.amount)} EGP
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', borderLeft: '1px solid rgba(139,92,246,0.2)', paddingLeft: 20 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#8b5cf6', fontFamily: 'var(--mono)' }}>
                {fmt(totalSalaries)} EGP
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HERO KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.04))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--danger)', marginBottom: 8 }}>💸 Total Expenses</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: 'var(--danger)', lineHeight: 1 }}>{fmt(totalExp)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>EGP · {allExpenses.length} line items</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.04))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#f59e0b', marginBottom: 8 }}>🏛 Fixed Cost / Month</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{fmt(totalFixed)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>EGP · incl. {fmt(totalSalaries)} salaries</div>
        </div>

        <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.02))', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#f59e0b', marginBottom: 8 }}>⚖️ Fixed Cost / Ton</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: totalProducedTons > 0 ? '#f59e0b' : 'var(--text3)', lineHeight: 1 }}>
            {totalProducedTons > 0 ? fmt(Math.round(fixedCostPerTon)) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {totalProducedTons > 0 ? `EGP · ${fmtDec(totalProducedTons, 3)} tons · ${totalProducedBags} bags` : 'No production data'}
          </div>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 8 }}>🔄 Variable Cost / Ton</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
            {totalProducedTons > 0 ? fmt(Math.round(variableCostPerTon)) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {totalProducedTons > 0 ? `EGP / ton (operational) · ${fmtDec(totalProducedTons, 3)} tons` : 'No production data'}
          </div>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text3)', marginBottom: 8 }}>📊 Total Cost / Ton</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: 'var(--text1)', lineHeight: 1 }}>
            {totalProducedTons > 0 ? fmt(Math.round(totalCostPerTon)) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {totalProducedTons > 0 ? `EGP / ton · all costs ÷ ${fmtDec(totalProducedTons, 3)} tons` : 'No production data'}
          </div>
          {isLowProduction && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⚠️</span>
              <span>High per-ton cost due to low production ({fmtDec(totalProducedTons, 3)} t). Fixed costs dilute at scale.</span>
            </div>
          )}
          {ytdCostPerTon > 0 && totalProducedTons < ytdTotalProduced && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--accent2)' }}>YTD avg: {fmt(Math.round(ytdCostPerTon))} EGP/ton across {fmtDec(ytdTotalProduced, 2)} tons</div>
          )}
        </div>
      </div>

      {/* ── FIXED VS VARIABLE VISUAL SPLIT ── */}
      {totalExp > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, color: 'var(--text1)', fontSize: 13, marginBottom: 16 }}>📊 Fixed vs Variable Split</div>
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', height: 28, marginBottom: 12 }}>
            <div style={{ width: `${(totalFixed / totalExp) * 100}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#0f1117', minWidth: totalFixed > 0 ? 40 : 0 }}>
              {totalFixed > 0 ? `${Math.round((totalFixed / totalExp) * 100)}%` : ''}
            </div>
            <div style={{ flex: 1, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
              {totalVariable > 0 ? `${Math.round((totalVariable / totalExp) * 100)}%` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', flexShrink: 0 }} />
              <span style={{ color: 'var(--text2)' }}>Fixed: <strong style={{ color: '#f59e0b' }}>{fmt(totalFixed)} EGP</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text2)' }}>Variable: <strong style={{ color: 'var(--accent)' }}>{fmt(totalVariable)} EGP</strong></span>
            </div>
            {totalSalaries > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6', flexShrink: 0 }} />
                <span style={{ color: 'var(--text2)' }}>Salaries (in Fixed): <strong style={{ color: '#8b5cf6' }}>{fmt(totalSalaries)} EGP</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CATEGORY BREAKDOWN ── */}
      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--text1)', fontSize: 13 }}>📋 Category Breakdown</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'All'], ['fixed', 'Fixed'], ['variable', 'Variable']].map(([v, l]) => (
                <button key={v} onClick={() => setFilter(v)} style={{
                  padding: '4px 12px', fontSize: 11, borderRadius: 20, fontWeight: 700, cursor: 'pointer',
                  background: filter === v ? (v === 'fixed' ? '#f59e0b' : v === 'variable' ? 'var(--accent)' : 'var(--danger)') : 'var(--bg3)',
                  color: filter === v ? (v === 'fixed' ? '#0f1117' : '#fff') : 'var(--text3)', border: 'none'
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.slice(0, 12).map(({ cat, total, pct }) => {
              const isSalCat = cat === 'Salaries';
              const barColor = isSalCat ? '#8b5cf6' : isFixed(cat) ? '#f59e0b' : 'var(--danger)';
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {cat}
                      {isSalCat && <span style={{ fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>💼 FIXED</span>}
                      {!isSalCat && isFixed(cat) && <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>FIXED</span>}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: barColor }}>
                      {fmt(total)} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 10 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 10, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ITEMIZED TABLE ── */}
      <div className="card">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)' }}>📋 Itemized Expenses</h6>
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20 }}>
            {displayedExpenses.length} entries
          </span>
        </div>
        <div className="table-wrap px-0">
          {displayedExpenses.length === 0 ? (
            <div className="empty" style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💸</div>
              Connect a sheet in ⚙️ Settings to see expenses
            </div>
          ) : (
            <table className="table align-items-center mb-0">
              <thead>
                <tr>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Date</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Category</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Description</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Amount</th>
                  {isAdmin && <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayedExpenses.map((r, i) => {
                  const isSal = r._isSalary;
                  return (
                    <tr key={i} style={isSal ? { background: 'rgba(139,92,246,0.04)' } : {}}>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>
                        {isSal
                          ? <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>Monthly</span>
                          : formatDisplayDate(r.date)}
                      </td>
                      <td className="px-3">
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: isSal ? 'rgba(139,92,246,0.15)' : isFixed(r.category) ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.12)',
                          color:      isSal ? '#8b5cf6'               : isFixed(r.category) ? '#f59e0b'               : 'var(--accent)',
                        }}>
                          {r.category}{isSal ? ' 💼' : isFixed(r.category) ? ' 🏛' : ''}
                        </span>
                      </td>
                      <td className="px-3" style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {r.description || '—'}
                        {isSal && r._status && (
                          <span style={{
                            marginLeft: 8, fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                            color:      r._status.toLowerCase() === 'paid' ? '#10b981' : '#ef4444',
                            background: r._status.toLowerCase() === 'paid' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            padding: '2px 6px', borderRadius: 4
                          }}>{r._status}</span>
                        )}
                      </td>
                      <td className="px-3 text-end">
                        <span style={{ fontFamily: 'var(--mono)', color: isSal ? '#8b5cf6' : 'var(--danger)', fontWeight: 700, fontSize: 13 }}>
                          ({fmt(r.amount)})
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-3 text-end">
                          {isSal ? null : !r.is_delete_pending ? (
                            <button 
                              onClick={() => handleDelete(r)} 
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}
                              title="Request Deletion"
                            >
                              🗑️
                            </button>
                          ) : (
                            <span title="Waiting for Super User approval" style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>PENDING</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="px-3 py-2" colSpan={3}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)' }}>Total</span>
                      <span style={{ fontSize: 11, color: '#f59e0b' }}>Fixed: {fmt(totalFixed)} EGP</span>
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>Variable: {fmt(totalVariable)} EGP</span>
                      {totalSalaries > 0 && <span style={{ fontSize: 11, color: '#8b5cf6' }}>Salaries: {fmt(totalSalaries)} EGP</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--danger)', fontWeight: 800, fontSize: 15 }}>
                      ({fmt(totalExp)}) EGP
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <DataEntryModal 
        title="Add New Expense" 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave}
        loading={isSaving}
      >
        <div className="field">
          <label>Date</label>
          <input type="date" value={newExp.date} onChange={e => setNewExp({...newExp, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={newExp.category} onChange={e => setNewExp({...newExp, category: e.target.value})}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Amount (EGP)</label>
          <input type="number" placeholder="0.00" value={newExp.amount} onChange={e => setNewExp({...newExp, amount: e.target.value})} />
        </div>
        <div className="field">
          <label>Description (Optional)</label>
          <textarea placeholder="Add details..." value={newExp.description} onChange={e => setNewExp({...newExp, description: e.target.value})} />
        </div>
      </DataEntryModal>
    </div>
  );
}

export default Expenses;
