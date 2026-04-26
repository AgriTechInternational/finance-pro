import React, { useState } from 'react';
import { formatDisplayDate, getShiftLabel } from '../lib/parseSheet';
import { requestDeletion } from '../lib/audit';
import { clearEngineCache } from '../lib/useSheetEngine';

const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtKg  = (n) => Number(n || 0).toLocaleString('en-EG', { maximumFractionDigits: 0 });
const pct    = (n) => (Number(n || 0) * 100).toFixed(1) + '%';

function Production({ data, globalStats, user, role, isAdmin, isSuper }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
      <div>Syncing production data with Google Sheets...</div>
    </div>
  );

  const { production = [], summary = {}, materials = [] } = data;

  const matLedger = materials.filter(m => !m._isTotalRow && (m.qtyKg || 0) > 0);

  // ── KPIs ──
  // Use the pre-calculated rolling stats from the engine summary
  const rawMaterialKg   = summary.matReceivedThisMonth || 0;
  const availableKg     = summary.rawMatAvailKg        || 0; 
  const totalUsedKg     = summary.totalUsedKg          || 0;
  const thisMonthRemainsKg = Math.max(0, rawMaterialKg - totalUsedKg);

  // Cross-month (YTD) raw material warehouse stock
  const ytdMatAvailKg   = globalStats?.matAvailableKg      || 0;
  const ytdMatRecvKg    = globalStats?.matTotalReceivedKg  || 0;
  const ytdMatUsedKg    = globalStats?.matTotalUsedKg      || 0;
  const ytdLoaded       = globalStats?.ytdLoaded || false;
  
  // Rolling warehouse stock from engine (which is already cross-month)
  // or favor globalStats if available to ensure "All Months" accuracy.
  const warehouseAvailKg = (globalStats?.isYTD || !availableKg) ? (globalStats?.matAvailableKg || availableKg) : availableKg;
  const totalProducedKg  = summary.totalProducedKg  || 0;
  const totalProducedBags = summary.totalProducedBags || 0;
  const totalProducedTons = summary.totalProduced    || 0;
  const remainingKg      = warehouseAvailKg;  // total raw material still in warehouse


  const productionLogs   = [...production].filter(p => p.total > 0);
  const uniqueDays       = [...new Set(productionLogs.map(p => p.date))];
  const avgBagsPerDay    = uniqueDays.length > 0 ? totalProducedBags / uniqueDays.length : 0;

  const SUB_TABS = [
    { id: 'overview',   label: '📊 Overview' },
    { id: 'raw',        label: '📦 Raw Material' },
    { id: 'finished',   label: '🏭 Finished Goods' },
    { id: 'logs',       label: '📋 Daily Logs' },
  ];

  const handleDelete = async (item) => {
    if (!isAdmin) return;
    if (!item.id) return alert("Historical logs from Google Sheets cannot be deleted from the app.");
    setConfirmDeleteId(item.id);
  };

  const handleConfirmDelete = async (item) => {
    setConfirmDeleteId(null);
    try {
      const { error } = await requestDeletion('production', item.id, user.email);
      if (error) throw error;
      clearEngineCache();
      window.location.reload();
    } catch (e) {
      alert("Delete Request Failed: " + e.message);
    }
  };

  return (
    <div className="page-fade" style={{ padding: 24 }}>
      {/* Header + Sub-tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title">Production Dashboard</div>
          <div className="page-sub">Live from Google Sheets + Supabase · Raw material · Finished goods</div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: activeTab === t.id ? 'var(--accent)' : 'transparent',
                color: activeTab === t.id ? 'white' : 'var(--text3)',
                transition: '0.2s'
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>

            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid #60a5fa', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), transparent)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#60a5fa', marginBottom: 8 }}>📦 Raw Material Received (This Month)</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>{rawMaterialKg > 0 ? fmtKg(rawMaterialKg) : '—'}<span style={{ fontSize: 14, opacity: 0.5, marginLeft: 6 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Received this month · {matLedger.length} deliveries · {(rawMaterialKg/1000).toFixed(2)} tons</div>
            </div>

            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid #10b981', background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#10b981', marginBottom: 8 }}>🏭 Finished Product (Y)</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>{fmtKg(totalProducedKg)}<span style={{ fontSize: 14, opacity: 0.5, marginLeft: 6 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{fmtNum(totalProducedBags)} bags · {totalProducedTons.toFixed(2)} tons</div>
            </div>

            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid #f59e0b', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), transparent)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#f59e0b', marginBottom: 8 }}>
                🏭 Total Raw Material in Warehouse (All Months)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>
                {fmtKg(warehouseAvailKg)}<span style={{ fontSize: 14, opacity: 0.5, marginLeft: 6 }}>kg</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                {ytdLoaded
                  ? `${(warehouseAvailKg/1000).toFixed(3)} tons · Received ${fmtKg(ytdMatRecvKg)} kg − Used ${fmtKg(ytdMatUsedKg)} kg`
                  : `This month: ${fmtKg(availableKg)} kg remaining`}
              </div>
              {!ytdLoaded && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⏳ Loading cross-month totals...</div>
              )}
            </div>

            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 8 }}>📅 Active Production Days</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>{uniqueDays.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{productionLogs.length} shifts logged</div>
            </div>

            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent2)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent2)', marginBottom: 8 }}>📈 Daily Average Output</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>{avgBagsPerDay.toFixed(0)}<span style={{ fontSize: 14, opacity: 0.5, marginLeft: 6 }}>bags</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{(avgBagsPerDay / 50).toFixed(3)} tons/day</div>
            </div>
          </div>
        </div>
      )}

      {/* ── RAW MATERIAL ── */}
      {activeTab === 'raw' && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(37,99,235,0.06))',
            border: '1px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 48px',
            display: 'flex', alignItems: 'center', gap: 40, marginBottom: 24
          }}>
            <div style={{ fontSize: 60 }}>📦</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#60a5fa', marginBottom: 10 }}>Total Stock in Warehouse (Inflow)</div>
              <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {fmtKg(summary.rawMaterialStock + rawMaterialKg)}
                <span style={{ fontSize: 28, marginLeft: 14, opacity: 0.5 }}>kg</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>
                Total material available this month (Opening: {fmtKg(summary.rawMaterialStock)} + Purchased: {fmtKg(rawMaterialKg)})
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>Received (Purchased)</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)' }}>{fmtKg(rawMaterialKg)} <span style={{ fontSize: 14, opacity: 0.5 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Total raw materials added this month</div>
            </div>
            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#10b981', marginBottom: 8 }}>Used in Production</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)' }}>{fmtKg(totalUsedKg)} <span style={{ fontSize: 14, opacity: 0.5 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{(totalUsedKg/1000).toFixed(3)} tons processed</div>
            </div>
            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent)', background: 'rgba(59,130,246,0.03)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>Real-time Available Stock</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtKg(warehouseAvailKg)} <span style={{ fontSize: 14, opacity: 0.5 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Current absolute factory leftover</div>
            </div>
          </div>
        </div>
      )}

      {/* ── FINISHED GOODS ── */}
      {activeTab === 'finished' && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.06))',
            border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '40px 48px',
            display: 'flex', alignItems: 'center', gap: 40, marginBottom: 24
          }}>
            <div style={{ fontSize: 60 }}>🏭</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#34d399', marginBottom: 10 }}>Total Finished Product (Y)</div>
              <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--text1)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {fmtKg(summary.totalProducedKg)}
                <span style={{ fontSize: 28, marginLeft: 14, opacity: 0.5 }}>kg</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>{fmtNum(totalProducedBags)} bags · {totalProducedTons.toFixed(2)} tons</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card shadow-soft" style={{ padding: 24, borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>Raw Material Input</div>
              <div style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--mono)' }}>{fmtKg(rawMaterialKg)} <span style={{ fontSize: 14, opacity: 0.5 }}>kg</span></div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Total received · {(rawMaterialKg/1000).toFixed(3)} tons</div>
            </div>
          </div>
        </div>
      )}

      {/* ── DAILY LOGS ── */}
      {activeTab === 'logs' && (
        <div className="card shadow-soft">
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Daily Production Log</div>
            <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '4px 10px', borderRadius: 20 }}>{productionLogs.length} entries</span>
          </div>
          {productionLogs.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No production logs found</div>
              <div style={{ fontSize: 13 }}>The DailyProduction tab may be empty for this month.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date','Shift / Note','Bags','Tons','Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 20px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>{h}</th>
                    ))}
                    {isAdmin && <th style={{ textAlign: 'right', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {productionLogs.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600 }}>{formatDisplayDate(r.date)}</td>
                      <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text3)' }}>
                        {getShiftLabel(r.shift) || r.item_name || r.note || 'Plant Output'}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmtNum(r.total)}</td>
                      <td style={{ padding: '14px 20px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{(r.total / 50).toFixed(3)}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '3px 8px', borderRadius: 4 }}>✓ Logged</span>
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          {r.id ? (
                            r.is_delete_pending ? (
                              <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>PENDING</span>
                            ) : confirmDeleteId === r.id ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                                <button className="btn" style={{ padding: '2px 8px', fontSize: 9, background: 'var(--danger)', border: 'none' }} onClick={() => handleConfirmDelete(r)}>Delete</button>
                                <button className="btn" style={{ padding: '2px 8px', fontSize: 9 }} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => handleDelete(r)} 
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
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <th colSpan={2} style={{ padding: '16px 20px', textAlign: 'right', fontSize: 12 }}>TOTAL</th>
                    <th style={{ padding: '16px 20px', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--accent)' }}>{fmtNum(totalProducedBags)} bags</th>
                    <th style={{ padding: '16px 20px', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text1)' }}>{totalProducedTons.toFixed(2)} tons</th>
                    <th />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Production;
