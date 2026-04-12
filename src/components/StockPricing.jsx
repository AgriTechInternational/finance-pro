import React from 'react';
import { formatDisplayDate } from '../lib/parseSheet';

const fmt  = (n) => Number(n || 0).toLocaleString('en-US');
const fmtD = (n) => Number(n || 0).toFixed(2);

function StockPricing({ data, globalStats = {} }) {
  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>🔄</div>
      <div>Analyzing Unit Economics with Google Sheets...</div>
    </div>
  );

  const { summary = {}, sales = [], materials = [], production = [], expenses = [] } = data;

  // ── 1. Raw Material Cost ──
  // Use purchase-batch rows only (non-_TOTALS_, non-zero qty)
  const matBatches = materials.filter(m =>
    !m._isTotalRow &&
    (m.item || '').toLowerCase() !== '_totals_' &&
    m.qtyKg > 0 &&
    (m.total > 0 || m.subTotal > 0)
  );
  const matTotalsRow     = materials.find(m => m._isTotalRow) || {};
  const totalKgPurchased = matTotalsRow.qtyKg  || matBatches.reduce((s, m) => s + m.qtyKg, 0);
  const totalMatCost     = matTotalsRow.total   || matBatches.reduce((s, m) => s + (m.total || m.subTotal || 0), 0);
  const avgMatCostPerKg  = totalKgPurchased > 0 ? totalMatCost / totalKgPurchased : 0;
  const avgMatCostPerTon = avgMatCostPerKg * 1000;

  // Cross-month fallback: when no raw material purchased this period, use YTD average
  const ytdAvgCostPerKg  = (globalStats.matTotalReceivedKg > 0 && globalStats.matTotalCost > 0)
    ? globalStats.matTotalCost / globalStats.matTotalReceivedKg
    : 0;
  const effAvgCostPerKg  = avgMatCostPerKg > 0 ? avgMatCostPerKg : ytdAvgCostPerKg;
  const effAvgCostPerTon = effAvgCostPerKg * 1000;
  // If no purchases this month, show warehouse-available kg as the cost basis
  const effKgBasis       = totalKgPurchased > 0 ? totalKgPurchased : (globalStats.matAvailableKg || 0);
  const noLocalPurchases = totalKgPurchased === 0 && effKgBasis > 0;

  // ── 2. Bags produced ──
  // summary.totalProducedBags = actual bag count; summary.totalProduced = tons
  const totalBagsProduced = summary.totalProducedBags || production.reduce((s, p) => s + (p.qty || 0), 0);
  const totalTonsProduced = summary.totalProduced || (totalBagsProduced / 50);

  // ── 3. Operational Cost (non-material) ──
  const totalOpCost  = summary.operatingCosts || expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // ── 4. TRUE LANDED COST PER BAG ──
  // Landed = Raw material cost consumed + operating costs
  const totalKgUsed      = matTotalsRow.used || 0;   // kg of material actually consumed in production
  const matCostConsumed  = totalKgUsed > 0
    ? totalKgUsed * effAvgCostPerKg
    : (effKgBasis > 0 ? effKgBasis * effAvgCostPerKg * 0.1 : 0);  // fallback: ~10% of stock used
  const totalLandedCost  = matCostConsumed + totalOpCost;
  const landedPerBag     = totalBagsProduced > 0 ? totalLandedCost / totalBagsProduced : 0;
  const landedPerTon     = landedPerBag * 50;

  // ── 5. Sell Price ──
  const salesRows        = sales.filter(s => s.totalPrice > 0);
  const totalRevenue     = salesRows.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const totalBagsSold    = salesRows.reduce((s, r) => s + (r.quantity || 0), 0);
  const avgSellPerBag    = totalBagsSold > 0 ? totalRevenue / totalBagsSold : 0;
  const avgSellPerTon    = avgSellPerBag * 50;

  // ── 6. Gross Margin ──
  const marginPerBag     = avgSellPerBag - landedPerBag;
  const marginPerTon     = marginPerBag * 50;
  const marginPct        = avgSellPerBag > 0 ? (marginPerBag / avgSellPerBag) * 100 : 0;

  // ── 7. Efficiency ──
  const conversionRatio  = totalKgUsed > 0 ? totalBagsProduced / totalKgUsed : 0; // bags per kg
  const kgPerBag         = conversionRatio > 0 ? 1 / conversionRatio : 0;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Unit Economics</div>
        <div className="page-sub">
          Cost per bag · Margin analysis · Based on {totalBagsProduced} bags produced from {fmt(Math.round(totalKgUsed || effKgBasis))} kg material{noLocalPurchases ? ' (cross-month stock)' : ''}
        </div>
      </div>

      {/* Cross-month notice */}
      {noLocalPurchases && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 12, padding: '10px 16px', marginBottom: 16,
          fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span>★</span>
          <span>No raw material purchased this period. Costs based on YTD average of <strong>{fmtD(effAvgCostPerKg)} EGP/kg</strong> from prior deliveries. Available stock: <strong>{fmt(Math.round(effKgBasis))} kg</strong>.</span>
        </div>
      )}

      {/* ── Raw Material Cost — Hero Card (most requested metric) ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
        border: '1px solid rgba(239,68,68,0.35)',
        borderRadius: 16, padding: '20px 28px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            🧱 Raw Material Cost{noLocalPurchases ? ' ★ YTD Average' : ''}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', lineHeight: 1, fontFamily: 'var(--mono)' }}>
            {fmt(Math.round(effAvgCostPerTon))} EGP
            <span style={{ fontSize: 16, fontWeight: 500, color: '#fca5a5', marginLeft: 8 }}>/ ton</span>
          </div>
          <div style={{ fontSize: 13, color: '#fca5a5', marginTop: 6 }}>
            {fmtD(effAvgCostPerKg)} EGP per kg · {fmt(Math.round(totalKgPurchased || effKgBasis))} kg {noLocalPurchases ? 'in warehouse' : 'purchased total'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 4 }}>Total Spend</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{fmt(Math.round(totalMatCost || (effKgBasis * effAvgCostPerKg)))} EGP</div>
          <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>{matBatches.length} deliveries{noLocalPurchases ? ' (prior months)' : ''}</div>
        </div>
      </div>

      {/* ── Top 3 KPI Cards ── */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{ borderTop: `3px solid var(--danger)` }}>
          <div className="card-title">📥 Landed Cost / Bag</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{fmt(Math.round(landedPerBag))} EGP</div>
          <div className="kpi-sub">{fmt(Math.round(landedPerTon))} EGP per ton (50-bag pallet)</div>
        </div>
        <div className="card" style={{ borderTop: `3px solid var(--accent)` }}>
          <div className="card-title">📤 Avg Sell Price / Bag</div>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{fmt(Math.round(avgSellPerBag))} EGP</div>
          <div className="kpi-sub">{fmt(Math.round(avgSellPerTon))} EGP per ton average</div>
        </div>
        <div className="card" style={{ borderTop: `3px solid ${marginPerBag >= 0 ? 'var(--accent2)' : 'var(--danger)'}` }}>
          <div className="card-title">💰 Gross Margin / Bag</div>
          <div className="kpi-value" style={{ color: marginPerBag >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
            {fmt(Math.round(marginPerBag))} EGP
          </div>
          <div className="kpi-sub">{fmtD(marginPct)}% margin · {fmt(Math.round(marginPerTon))} EGP/ton</div>
        </div>
      </div>

      {/* ── Cost Breakdown Card ── */}
      <div className="card shadow-soft" style={{ marginBottom: 20 }}>
        <div style={{ padding: '20px 24px' }}>
          <h6 style={{ margin: '0 0 16px', fontWeight: 800, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🧮</span> Cost Breakdown per Bag
          </h6>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Raw Material (consumed)', value: totalKgUsed > 0 ? matCostConsumed / totalBagsProduced : totalMatCost / Math.max(1, totalBagsProduced), color: 'var(--danger)', icon: '🧱' },
              { label: 'Operating Costs', value: totalOpCost / Math.max(1, totalBagsProduced), color: 'var(--accent3)', icon: '⚙️' },
            ].map((item, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                padding: '16px 20px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{item.icon} {item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{fmt(Math.round(item.value))} EGP</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {avgSellPerBag > 0 ? fmtD((item.value / avgSellPerBag) * 100) : '—'}% of sell price
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Raw Material Ledger ── */}
      <div className="card shadow-soft">
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h6 style={{ margin: 0, fontWeight: 800, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📊</span> Raw Material Purchase Ledger
            </h6>
            <div style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', color: '#059669', fontWeight: 600 }}>
              ✓ Source: Google Sheets
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left',  padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Date</th>
                  <th style={{ textAlign: 'left',  padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Type</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Qty (kg)</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Price/kg</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Delivery</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>EGP/Ton</th>
                </tr>
              </thead>
              <tbody>
                {matBatches.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px', color: 'var(--text2)' }}>{formatDisplayDate(m.date)}</td>
                    <td style={{ padding: '8px 8px', color: 'var(--text3)', fontSize: 12 }}>{m.item}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text1)', fontWeight: 600 }}>{fmt(m.qtyKg)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{m.pricePerKg ? fmt(m.pricePerKg) : '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text2)' }}>{m.delivery ? fmt(m.delivery) : '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{fmt(m.total || m.subTotal)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--accent2)', fontWeight: 700 }}>
                      {m.qtyKg > 0 && (m.total || m.subTotal) > 0
                        ? fmt(Math.round(((m.total || m.subTotal) / m.qtyKg) * 1000))
                        : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.03)', fontWeight: 800 }}>
                  <td style={{ padding: '12px 8px', color: 'var(--text1)' }} colSpan={2}>Total Purchased</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent2)' }}>{fmt(Math.round(totalKgPurchased))} kg</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>{fmtD(avgMatCostPerKg)} avg</td>
                  <td />
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--danger)' }}>{fmt(totalMatCost)} EGP</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent2)' }}>{fmt(Math.round(avgMatCostPerTon))}</td>
                </tr>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--text3)', fontSize: 12 }} colSpan={2}>Landed (Raw + OpEx)</td>
                  <td colSpan={3} />
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>{fmt(Math.round(totalLandedCost))}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--accent2)' }}>{fmt(Math.round(landedPerTon))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 16, marginTop: 8 }}>
            <h6 style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--text1)' }}>💡 Profitability Insight</h6>
            <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, margin: 0 }}>
              Average raw material cost is{' '}
              <strong style={{ color: 'var(--accent2)' }}>{fmtD(avgMatCostPerKg)} EGP/kg ({fmt(Math.round(avgMatCostPerTon))} EGP/ton)</strong>.
              With operating costs of{' '}
              <strong style={{ color: 'var(--accent3)' }}>{fmt(Math.round(totalOpCost))} EGP</strong>{' '}
              spread over {totalBagsProduced} bags, your true landed cost is{' '}
              <strong style={{ color: 'var(--danger)' }}>{fmt(Math.round(landedPerBag))} EGP/bag</strong>.
              {marginPerBag > 0
                ? ` You're making ${fmtD(marginPct)}% gross margin — ${fmt(Math.round(marginPerBag))} EGP per bag net.`
                : ' ⚠️ Current sell price is below break-even cost. Review pricing strategy.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StockPricing;
