import React from 'react';
import { clearAllNotifications } from '../lib/notifications';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function Dashboard({ data, role, monthLabel, onRefresh, newUpdates = [], clearUpdates, carryForward, isYTD, globalStats = {} }) {
  if (!data || !data.summary) return (
    <div key="dash-sync-state" style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Calculating Engineering Performance...</div>
      <div style={{ fontSize: 11, marginTop: 8 }}>Recalibrating unit economics from Google Sheets</div>
    </div>
  );

  const { summary = {}, expenses = [], sales = [], production = [] } = data;
  const {
    totalRevenue = 0, totalPaid = 0, totalOutstanding = 0,
    totalCosts = 0, netProfit = 0, totalProduced = 0, cashBalance = 0,
    materialCOGS = 0, operatingCosts = 0, materialCosts = 0,
    rawMatAssetValue = 0, finishedGoodsAssetVal = 0, totalInventoryAsset = 0,
    rawMatAvailKg = 0, unsoldBags = 0, avgMatCostPerKg = 0,
  } = summary;

  // ── Cross-month inventory fallback ──
  // When viewing a month with no raw material purchases, use YTD warehouse data
  // to correctly value the on-hand inventory (material carried from prior months).
  const ytdAvgCostPerKg = (globalStats.matTotalReceivedKg > 0 && globalStats.matTotalCost > 0)
    ? globalStats.matTotalCost / globalStats.matTotalReceivedKg
    : 0;
  const effectiveAvgCostPerKg    = avgMatCostPerKg > 0 ? avgMatCostPerKg : ytdAvgCostPerKg;
  const effectiveRawMatKg        = rawMatAvailKg > 0 ? rawMatAvailKg : (globalStats.matAvailableKg || 0);
  const effectiveRawMatAsset     = Math.round(effectiveRawMatKg * effectiveAvgCostPerKg);
  const effectiveTotalInvAsset   = effectiveRawMatAsset + finishedGoodsAssetVal;
  const usingCrossMonthInventory = rawMatAvailKg === 0 && effectiveRawMatKg > 0;

  const isProfit      = netProfit >= 0;
  const targetTons    = 7;
  const producedTons  = totalProduced; // already in tons from engine

  // Ton conversions for display
  const rawMatAvailTons    = rawMatAvailKg / 1000;
  const unsoldBagsTons     = (unsoldBags * 20) / 1000; // ~20 kg per bag (= standard 6L bag weight)
  const cogsKg             = avgMatCostPerKg > 0 && materialCOGS > 0 ? materialCOGS / avgMatCostPerKg : 0;
  const cogsTons           = cogsKg / 1000;
  const totalMatKg         = avgMatCostPerKg > 0 && materialCosts > 0 ? materialCosts / avgMatCostPerKg : 0;
  const totalMatTons       = totalMatKg / 1000;
  const totalAssetTons     = rawMatAvailTons + unsoldBagsTons;

  const kpis = [
    { label: 'Available Cash',           value: `${fmt(Math.round(summary?.availableCash || cashBalance))} EGP`, sub: `Collected: ${fmt(Math.round(totalPaid))} − Paid costs: ${fmt(Math.round(summary?.totalPaidCosts || 0))}`, color: (summary?.availableCash || cashBalance) >= 0 ? 'var(--accent2)' : 'var(--danger)' },
    { label: 'Total Revenue',            value: `${fmt(Math.round(totalRevenue))} EGP`,    sub: totalOutstanding > 0 ? `Collected: ${fmt(Math.round(totalPaid))} · Uncollected: ${fmt(Math.round(totalOutstanding))}` : `Fully collected: ${fmt(Math.round(totalPaid))} EGP`, color: 'var(--accent2)' },
    { label: 'Total Costs (P&L)',        value: `${fmt(Math.round(totalCosts))} EGP`,      sub: `Operating costs ${fmt(Math.round(operatingCosts))} + Raw material used (COGS) ${fmt(Math.round(materialCOGS))}`, color: 'var(--danger)' },
    ...(totalOutstanding > 0 ? [{ label: 'Outstanding', value: `${fmt(Math.round(totalOutstanding))} EGP`, sub: 'Uncollected receivables — confirm in sales ledger', color: 'var(--accent3)' }] : []),
    { label: 'Inventory Assets',         value: `${fmt(Math.round(effectiveTotalInvAsset))} EGP`, sub: `Raw material ${fmt(Math.round(effectiveRawMatAsset))} (${(effectiveRawMatKg/1000).toFixed(2)} t${usingCrossMonthInventory ? ' — cross-month' : ''}) + Unsold goods ${fmt(Math.round(finishedGoodsAssetVal))} (${unsoldBags} bags · ${unsoldBagsTons.toFixed(2)} t)`, color: '#a78bfa' },
    { label: 'Total Material Purchased', value: `${fmt(Math.round(materialCosts))} EGP`,  sub: `Sold COGS ${fmt(Math.round(materialCOGS))} (${cogsTons.toFixed(2)} t) + In stock ${fmt(Math.round(effectiveRawMatAsset + finishedGoodsAssetVal))} (${((effectiveRawMatKg/1000) + unsoldBagsTons).toFixed(2)} t)`, color: 'var(--accent3)' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">{isYTD ? 'Year-to-Date Performance' : 'Finance Overview'}</div>
          <div className="page-sub">AgriTech Pro · {isYTD ? 'All Registered Months' : (monthLabel || 'Live Stream')}</div>
        </div>
        <button
          onClick={onRefresh}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '8px 16px' }}
        >
          <span>↻</span> Refresh Now
        </button>
      </div>

      {/* ── NEW UPDATES NOTIFICATION ── */}
      {newUpdates.length > 0 && (
        <div style={{
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 16, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>
                {newUpdates.length} New Updates Detected
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {(() => {
                  const s = newUpdates.filter(u => u.type === 'SALE').length;
                  const e = newUpdates.filter(u => u.type === 'EXPENSE').length;
                  const p = newUpdates.filter(u => u.type === 'PRODUCTION').length;
                  const m = newUpdates.filter(u => u.type === 'MATERIAL').length;
                  const x = newUpdates.filter(u => u.type === 'SUMMARY').length;
                  const parts = [];
                  if (s) parts.push(`${s} Sales`);
                  if (e) parts.push(`${e} Expenses`);
                  if (p) parts.push(`${p} Production logs`);
                  if (m) parts.push(`${m} Stock updates`);
                  if (x) parts.push(`Financial Summary changes`);
                  return `Updates in: ${parts.join(', ') || 'Various sections'}.`;
                })()}
              </div>
            </div>
          </div>
          <button 
            onClick={() => { 
              try {
                clearAllNotifications(); 
              } catch(e) {}
              clearUpdates(); 
            }} 
            className="btn" 
            style={{ fontSize: 10, padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, color: 'var(--text2)' }}
          >
            Mark as Seen
          </button>
        </div>
      )}

      {/* ── YTD Context Strip (only when viewing a specific month) ── */}
      {!isYTD && globalStats?.ytdLoaded && globalStats?.monthCount > 1 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06))',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 14, padding: '12px 20px', marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center'
        }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', flexShrink: 0 }}>📊 All Months — YTD</div>
          {[
            { label: 'Revenue',    val: globalStats.totalRevenue,  color: '#10b981' },
            { label: 'Costs',      val: globalStats.totalCosts,    color: '#ef4444' },
            { label: 'Net Profit', val: globalStats.netProfit,     color: globalStats.netProfit >= 0 ? '#10b981' : '#ef4444' },
            { label: 'Collected',  val: globalStats.totalPaid,     color: '#60a5fa' },
            { label: 'Outstanding',val: globalStats.totalOutstanding, color: '#f59e0b' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{fmt(Math.round(val))} <span style={{ fontSize: 9, opacity: 0.7 }}>EGP</span></div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>↑ cumulative across {globalStats.monthCount} months · current month detail below</div>
        </div>
      )}

      {/* ── HERO: Monthly Net Profit ── */}
      <div style={{
        background: isProfit
          ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)'
          : 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 100%)',
        border: `1px solid ${isProfit ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
        backdropFilter: 'var(--glass)',
        borderRadius: 24,
        padding: '40px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 32,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
      }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em',
            color: isProfit ? 'var(--accent2)' : 'var(--danger)', marginBottom: 12,
            fontFamily: 'var(--mono)',
          }}>
            <span>{isYTD ? (isProfit ? '✧ YTD Total Net Profit' : '✧ YTD Total Net Loss') : (isProfit ? '✧ Operating Net Profit' : '✧ Operating Net Loss')}</span>
          </div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 64, fontWeight: 800, lineHeight: 1,
            color: isProfit ? 'var(--accent2)' : 'var(--danger)',
            textShadow: `0 0 30px ${isProfit ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span>{isProfit ? '+' : ''}</span><span>{fmt(Math.round(netProfit))}</span>
            <span style={{ fontSize: 24, marginLeft: 12, opacity: 0.5, fontWeight: 400 }}>EGP</span>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 24, flexWrap: 'wrap' }}>
            {/* P&L Breakdown */}
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontWeight: 800, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>
                {isYTD ? '1. Cumulative P&L (Year-to-Date)' : '1. Inventory-Adjusted Profit & Loss'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', fontSize: 11, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Revenue</span><strong style={{color: 'var(--accent2)', fontFamily: 'var(--mono)'}}>{fmt(Math.round(totalRevenue))}</strong></div>
                <div style={{color: 'var(--text3)'}}>−</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Operating Expenses</span><strong style={{color: '#f59e0b', fontFamily: 'var(--mono)'}}>{fmt(Math.round(operatingCosts))}</strong></div>
                <div style={{color: 'var(--text3)'}}>−</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Cost of Goods Sold</span><strong style={{color: 'var(--danger)', fontFamily: 'var(--mono)'}}>{fmt(Math.round(materialCOGS))}</strong></div>
                <div style={{color: 'var(--text3)'}}>＝</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Net Profit</span><strong style={{color: isProfit ? 'var(--accent2)' : 'var(--danger)', fontFamily: 'var(--mono)'}}>{fmt(Math.round(netProfit))}</strong></div>
              </div>
            </div>

            {/* Inventory Assets */}
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontWeight: 800, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>2. Factory Inventory Assets (Not Expensed){usingCrossMonthInventory ? <span style={{fontSize:8,color:'#f59e0b',marginLeft:8,fontWeight:700}}>★ CROSS-MONTH</span> : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(139,92,246,0.08)', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 11, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Raw Mat{usingCrossMonthInventory ? ' ★' : ''}</span><strong style={{color: '#a78bfa', fontFamily: 'var(--mono)'}}>{fmt(Math.round(effectiveRawMatAsset))}</strong><span style={{fontSize:9,color:'var(--text3)'}}>{(effectiveRawMatKg/1000).toFixed(2)} t · {fmt(Math.round(effectiveRawMatKg))} kg</span></div>
                <div style={{color: 'var(--text3)'}}>+</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)'}}>Unsold Goods</span><strong style={{color: '#a78bfa', fontFamily: 'var(--mono)'}}>{fmt(Math.round(finishedGoodsAssetVal))}</strong><span style={{fontSize:9,color:'var(--text3)'}}>{unsoldBags} bags · {unsoldBagsTons.toFixed(2)} t</span></div>
                <div style={{color: 'var(--text3)'}}>＝</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{color: 'var(--text3)', fontWeight: 800}}>Total Asset</span><strong style={{color: 'white', fontFamily: 'var(--mono)'}}>{fmt(Math.round(effectiveTotalInvAsset))} EGP</strong><span style={{fontSize:9,color:'var(--text3)'}}>{((effectiveRawMatKg/1000) + unsoldBagsTons).toFixed(2)} t equiv.</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Mini stats stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
          {[
            { label: 'Total Revenue',            val: totalRevenue,        color: 'var(--accent2)' },
            { label: isYTD ? 'Total Year-to-Date Costs' : 'Operating Costs + Raw Material COGS', val: totalCosts, color: 'var(--danger)' },
            { label: 'Inventory Assets (Not Expensed)', val: effectiveTotalInvAsset, color: '#a78bfa' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 16, fontFamily: 'var(--mono)', fontWeight: 700, color }}>{fmt(Math.round(val))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid">
        {kpis.map(k => (
          <div className="kpi" key={k.label} style={{ '--kpi-color': k.color }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 16 }}>{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Production summary strip */}
      {totalProduced > 0 && (
        <div className="card shadow-soft" style={{ marginTop: 24, padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 32 }}>🏭</div>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--text1)', fontSize: 13, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Finished Product Produced</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
              {producedTons.toFixed(2)} <span style={{ fontSize: 13, opacity: 0.5 }}>Tons</span>
              <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 16, fontWeight: 600 }}>· {fmt(Math.round(producedTons * 1000 / 20))} bags approx.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
