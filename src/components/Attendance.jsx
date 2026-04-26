import React, { useState } from 'react';
import { formatDisplayDate, getShiftLabel } from '../lib/parseSheet';
import { supabase, tables } from '../supabase';
import DataEntryModal from './DataEntryModal';
import { requestDeletion } from '../lib/audit';
import { clearEngineCache } from '../lib/useSheetEngine';

const fmtNum = (n) => Number(n || 0).toLocaleString('en-EG');

// Normalize any worker name to a canonical display name
function normalizeWorker(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('gomaa'))   return 'Gomaa';
  if (n.includes('ibrahim')) return 'Ibrahim';
  if (n.includes('mahmoud')) return 'Mahmoud';
  return name || 'Unknown';
}

/**
 * Standard Shift Definitions are now imported from ../lib/parseSheet
 */

// Lookup team performance by worker name
function getPerfFor(worker, teamPerformance) {
  if (!teamPerformance) return null;
  const n = normalizeWorker(worker).toLowerCase();
  return Object.entries(teamPerformance).find(([k]) => k.includes(n))?.[1] || null;
}

// Get production qty for a given attendance record from the lookup map
function extractShift(s) {
  const match = String(s || '').match(/\d/);
  return match ? match[0] : '1';
}

function getProduction(rec, prodMap) {
  if (!prodMap) return 0;
  const workerKey = normalizeWorker(rec.worker).toLowerCase();
  const shiftKey = extractShift(rec.shift);
  return prodMap[`${rec.date}|${workerKey}|${shiftKey}`] || 0;
}

export default function Attendance({ data, user, role, isAdmin, isSuper, onRefresh }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [newShift, setNewShift] = useState({
    date: new Date().toISOString().split('T')[0],
    worker: 'Gomaa',
    shift: '1',
    present: true,
    bags: '',
    checkIn: '08:00 AM',
    checkOut: '04:00 PM',
    advance: '',
    penalty: '',
    financial_note: ''
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');
    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
    try {
      // 1. Log Attendance
      const { error: attErr } = await supabase.from('attendance').insert([
        {
          date: newShift.date,
          worker_name: newShift.worker,
          shift: newShift.shift,
          status: newShift.present ? 'PRESENT' : 'ABSENT',
          check_in: newShift.present ? newShift.checkIn : null,
          check_out: newShift.present ? newShift.checkOut : null,
          is_dev_test: isTest,
          advance: parseFloat(newShift.advance) || 0,
          penalty: parseFloat(newShift.penalty) || 0,
          financial_note: newShift.financial_note || null
        }
      ]);
      if (attErr) throw attErr;

      // 2. Log Production (if any bags)
      if (parseFloat(newShift.bags) > 0) {
        const { error: prodErr } = await supabase.from('production').insert([
          {
            date: newShift.date,
            worker_name: newShift.worker,
            bags_produced: parseFloat(newShift.bags),
            shift: newShift.shift,
            is_dev_test: isTest
          }
        ]);
        if (prodErr) throw prodErr;
      }

      setIsModalOpen(false);
      clearEngineCache();
      if (onRefresh) {
        onRefresh();
      } else {
        window.location.reload();
      }
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!isAdmin) return;
    if (!item.id) return alert("Historical data from Google Sheets cannot be deleted via the app.");
    setConfirmDeleteId(item.id);
  };

  const handleConfirmDelete = async (item) => {
    setConfirmDeleteId(null);
    try {
      const { error } = await requestDeletion('attendance', item.id, user.email);
      if (error) throw error;
      window.location.reload();
    } catch (e) {
      alert("Delete Request Failed: " + e.message);
    }
  };

  const handleToggleMercy = async (id, currentIsForgiven) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ is_penalty_forgiven: !currentIsForgiven })
        .eq('id', id);
      
      if (error) throw error;
      clearEngineCache();
      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (e) {
      alert("Mercy Action Failed: " + e.message);
    }
  };

  const attendance    = data?.attendance        || [];
  const teamPerf      = data?.teamPerformance   || {};
  const shiftProdMap  = data?.shiftProductionMap || {};

  const formatTime = (s) => {
    if (!s) return '—';
    const m = s.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/i);
    if (!m) return s;
    const h = String(+m[1]).padStart(2,'0');
    const ampm = m[3] ? ' '+m[3] : '';
    return `${h}:${m[2]}${ampm}`.trim();
  };

  // ── Worker summary aggregation ──
  const WORKERS = ['Gomaa', 'Ibrahim', 'Mahmoud'];
  const SHIFT_COLOR = { 'Gomaa': '#3b82f6', 'Ibrahim': '#10b981', 'Mahmoud': '#8b5cf6' };

  const workerStats = {};
  WORKERS.forEach(w => {
    const perf = getPerfFor(w, teamPerf);
    workerStats[w] = {
      days: 0, hoursWorked: 0, production: 0,
      salary:         perf?.salary || perf?.outstanding || 0,
      totalSalary:    perf?.totalSalary  || 0,
      inAdvance:      perf?.inAdvance    || 0,
      deduction:      perf?.deduction    || 0,
      status:         perf?.status       || null,
      inAdvanceItems: perf?.inAdvanceItems || [],
      deductionItems: perf?.deductionItems || [],
    };
  });

  attendance.forEach(rec => {
    const w = normalizeWorker(rec.worker);
    if (!workerStats[w]) workerStats[w] = { days: 0, hoursWorked: 0, production: 0, salary: 0, status: null };
    if (rec.present) {
      workerStats[w].days++;
      workerStats[w].hoursWorked += rec.hoursWorked || 0;
    }
    // Always add production even on "absent" logged entries
    workerStats[w].production += getProduction(rec, shiftProdMap);
  });

  // Total production across all workers for percentage calculation
  const grandTotalProd = WORKERS.reduce((s, w) => s + (workerStats[w]?.production || 0), 0);

  const sorted = [...attendance].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    // Work Day Sequence (Reverse Chronological): 
    // Shift 2 (Evening/Afternoon) -> Shift 1 (Morning) -> Shift 3 (Night)
    const shiftOrder = { '2': 1, '1': 2, '3': 3 };
    return (shiftOrder[a.shift] || 99) - (shiftOrder[b.shift] || 99);
  });

  return (
    <div className="page-fade" style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Attendance & Production</div>
            <div className="page-sub">
              Live from Google Sheets + Supabase ·{' '}
              {attendance.filter(r => r.present).length} shifts logged ·{' '}
              <strong style={{ color: 'var(--accent)' }}>{fmtNum(grandTotalProd)} bags</strong> total
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ padding: '12px 24px', fontWeight: 900, boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
            <span>+</span> Log Shift Entry
          </button>
        </div>
      </div>

      {/* NEW: Cloud-Native Notice & Immediate Action for May 2026 */}
      {data?.month === 4 && data?.year === 2026 && (
        <div className="card" style={{ 
          marginBottom: 28, 
          padding: '24px 32px', 
          background: 'linear-gradient(90deg, rgba(59,130,246,0.1), transparent)', 
          border: '1px solid rgba(59,130,246,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: 20
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'white', marginBottom: 4 }}>☁️ May 2026 - Cloud Mode Enabled</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>This month records directly to Supabase. Google Sheets are bypassed.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ background: '#3b82f6', color: 'white', padding: '10px 24px' }}>
             + Add New Attendance Entry
          </button>
        </div>
      )}

      {/* Worker Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 28 }}>
        {WORKERS.map(name => {
          const stats = workerStats[name] || {};
          const color = SHIFT_COLOR[name] || 'var(--accent)';
          const prodPct = grandTotalProd > 0 ? (stats.production / grandTotalProd * 100) : 0;
          return (
            <div key={name} className="card shadow-soft" style={{ padding: 24, borderLeft: `4px solid ${color}` }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text1)', marginBottom: 2 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>Primary Worker</div>

              {/* Days / Hours */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.1em' }}>Days</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'var(--mono)' }}>{stats.days}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.1em' }}>Hours</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{(stats.hoursWorked || 0).toFixed(0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.1em' }}>Bags</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', fontFamily: 'var(--mono)' }}>{stats.production}</div>
                </div>
              </div>

              {/* Production share bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
                  <span>Production Share</span>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>{prodPct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${prodPct}%`,
                    background: `linear-gradient(90deg, ${color}, #f59e0b)`,
                    borderRadius: 3, transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {/* Salary breakdown */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                {stats.totalSalary > 0 ? (
                  <>
                    {/* Total Salary header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total Salary</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                        {fmtNum(stats.totalSalary)} EGP
                      </div>
                    </div>

                    {/* In Advance items */}
                    {stats.inAdvanceItems?.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, fontWeight: 700 }}>
                          In Advance
                        </div>
                        {stats.inAdvanceItems.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                                {item.date ? new Date(item.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : ''}
                              </span>
                              {item.reason && (
                                <span style={{ fontSize: 10, color: '#f59e0b', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' }}>
                                  {item.reason}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                              -{fmtNum(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Deduction items */}
                    {stats.deductionItems?.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, fontWeight: 700 }}>
                          Deductions
                        </div>
                        {stats.deductionItems.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 6, opacity: item.isForgiven ? 0.6 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              {isAdmin && (
                                <button 
                                  onClick={() => handleToggleMercy(item.id, item.isForgiven)}
                                  className="btn-icon" 
                                  title={item.isForgiven ? "Un-forgive" : "Grant Mercy ❤️"}
                                  style={{ padding: 4, height: 'auto', color: item.isForgiven ? '#10b981' : 'var(--text3)' }}
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill={item.isForgiven ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                                </button>
                              )}
                              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                                {item.date ? new Date(item.date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : ''}
                              </span>
                              {item.reason && (
                                <span style={{ fontSize: 10, color: item.isForgiven ? '#10b981' : '#ef4444', textDecoration: item.isForgiven ? 'line-through' : 'none', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' }}>
                                  {item.reason}
                                </span>
                              )}
                              {item.isForgiven && <span style={{ fontSize: 8, color: '#10b981', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mercy ❤️</span>}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: item.isForgiven ? '#10b981' : '#ef4444', textDecoration: item.isForgiven ? 'line-through' : 'none', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                              -{fmtNum(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Net Salary footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Salary</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#10b981', fontFamily: 'var(--mono)' }}>
                          {fmtNum(stats.salary)} EGP
                        </div>
                        {stats.status && (
                          <span style={{
                            fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                            color: stats.status.toLowerCase() === 'paid' ? '#10b981' : '#ef4444',
                            background: stats.status.toLowerCase() === 'paid' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            padding: '3px 8px', borderRadius: 4
                          }}>{stats.status}</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Salary — no data</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily attendance + production table */}
      <div className="card shadow-soft">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Daily Shift Log</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sorted.length} entries</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '80px 40px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '0 0 24px 24px' }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>📋</div>
              <h3 style={{ color: 'white', marginBottom: 8, fontSize: 18 }}>No Attendance Records Found</h3>
              <p style={{ color: 'var(--text3)', fontSize: 13, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
                The attendance log for this month is currently empty. You can start logging worker shifts and production directly using the button above.
              </p>
              <button 
                className="btn btn-primary" 
                onClick={() => setIsModalOpen(true)}
                style={{ padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}
              >
                + Log First Shift
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date','Worker','Shift','Status','Clock In','Clock Out','Hours','Production'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Production' || h === 'Hours' ? 'center' : 'left',
                      padding: '12px 16px', fontSize: 10, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: 'var(--text3)',
                      borderBottom: '1px solid var(--border)', fontWeight: 700
                    }}>{h}</th>
                  ))}
                  {isAdmin && <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((rec, i) => {
                  const workerName = normalizeWorker(rec.worker);
                  const color      = SHIFT_COLOR[workerName] || 'var(--accent)';
                  const bags       = getProduction(rec, shiftProdMap);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600 }}>
                        {formatDisplayDate(rec.date)}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontWeight: 700, color }}>{workerName}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 11, color: 'var(--text3)' }}>
                        {getShiftLabel(rec.shift)}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                          color: rec.present ? '#10b981' : '#ef4444',
                          background: rec.present ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          padding: '3px 8px', borderRadius: 4
                        }}>{rec.present ? 'Present' : 'Absent'}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: rec.present ? 'var(--accent2)' : 'var(--text3)' }}>
                        {formatTime(rec.checkIn)}
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: rec.present ? 'var(--danger)' : 'var(--text3)' }}>
                        {formatTime(rec.checkOut)}
                      </td>
                      <td style={{ padding: '13px 16px', fontWeight: 700, textAlign: 'center', fontFamily: 'var(--mono)' }}>
                        {rec.hoursWorked > 0 ? rec.hoursWorked.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        {bags > 0 ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontWeight: 800, fontSize: 13, color: '#f59e0b', fontFamily: 'var(--mono)',
                            background: 'rgba(245,158,11,0.09)', padding: '3px 10px', borderRadius: 6
                          }}>
                            📦 {bags}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                          {rec.id ? (
                            rec.is_delete_pending ? (
                              <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>PENDING</span>
                            ) : confirmDeleteId === rec.id ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                                <button className="btn" style={{ padding: '2px 8px', fontSize: 9, background: 'var(--danger)', border: 'none' }} onClick={() => handleConfirmDelete(rec)}>Delete</button>
                                <button className="btn" style={{ padding: '2px 8px', fontSize: 9 }} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => handleDelete(rec)} 
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}
                                title="Request Deletion"
                              >
                                🗑️
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: 9, color: 'var(--text3)' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={7} style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>
                    Total Bags Produced
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, fontSize: 15, color: '#f59e0b', fontFamily: 'var(--mono)' }}>
                    📦 {fmtNum(grandTotalProd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <DataEntryModal 
        title="Log Shift & Production" 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave}
        loading={isSaving}
      >
        {saveError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, marginBottom: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
            Error: {saveError}
          </div>
        )}
        <div className="field">
          <label>Date</label>
          <input type="date" value={newShift.date} onChange={e => setNewShift({...newShift, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Worker</label>
          <select value={newShift.worker} onChange={e => setNewShift({...newShift, worker: e.target.value})}>
            <option value="Gomaa">Gomaa</option>
            <option value="Ibrahim">Ibrahim</option>
            <option value="Mahmoud">Mahmoud</option>
          </select>
        </div>
        <div className="field">
          <label>Shift Period</label>
          <select value={newShift.shift} onChange={e => setNewShift({...newShift, shift: e.target.value})}>
            <option value="1">Shift 1 (Morning: 8AM - 4PM)</option>
            <option value="2">Shift 2 (Afternoon: 4PM - 12AM)</option>
            <option value="3">Shift 3 (Night: 12AM - 8AM)</option>
          </select>
        </div>
        <div className="field">
          <label>Attendance Status</label>
          <select value={newShift.present ? 'true' : 'false'} onChange={e => setNewShift({...newShift, present: e.target.value === 'true'})}>
            <option value="true">Present</option>
            <option value="false">Absent</option>
          </select>
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, margin: '8px 0', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
            💰 Financials (Advances & Penalties)
          </div>
          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Advance (Salfa)</label>
              <input type="number" placeholder="0" value={newShift.advance} onChange={e => setNewShift({...newShift, advance: e.target.value})} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Penalty (Deduction)</label>
              <input type="number" placeholder="0" value={newShift.penalty} onChange={e => setNewShift({...newShift, penalty: e.target.value})} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>Financial Note (Reason)</label>
            <input type="text" placeholder="e.g. School fees Salfa" value={newShift.financial_note} onChange={e => setNewShift({...newShift, financial_note: e.target.value})} />
          </div>
        </div>

        {newShift.present && (
          <>
            <div className="field">
              <label>Bags Produced</label>
              <input type="number" placeholder="0" value={newShift.bags} onChange={e => setNewShift({...newShift, bags: e.target.value})} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Clock In</label>
                <input type="text" placeholder="08:00 AM" value={newShift.checkIn} onChange={e => setNewShift({...newShift, checkIn: e.target.value})} />
              </div>
              <div className="field">
                <label>Clock Out</label>
                <input type="text" placeholder="04:00 PM" value={newShift.checkOut} onChange={e => setNewShift({...newShift, checkOut: e.target.value})} />
              </div>
            </div>
          </>
        )}
      </DataEntryModal>
    </div>
  );
}
