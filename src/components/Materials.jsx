import React, { useState } from 'react';
import { supabase, tables } from '../supabase';
import DataEntryModal from './DataEntryModal';

const fmt = (n, dec = 0) => dec > 0
  ? Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  : Number(n || 0).toLocaleString('en-US');

function Materials({ data, carryForward, globalStats }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newMove, setNewMove] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'IN',
    material_type: 'Plastic',
    quantity: '',
    unit_price: '',
    notes: ''
  });

  if (!data || !data.summary) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Reconciling Inventory...</div>
    </div>
  );

  const handleSave = async () => {
    if (!newMove.quantity) return alert("Please enter quantity");
    setIsSaving(true);
    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
    try {
      const { error } = await supabase.from(tables.INVENTORY).insert([
        {
          date: newMove.date,
          type: newMove.type,
          material_type: newMove.material_type,
          quantity: parseFloat(newMove.quantity),
          unit_price: newMove.type === 'IN' ? parseFloat(newMove.unit_price || 0) : 0,
          notes: newMove.notes,
          is_dev_test: isTest
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

  const { materials = [], finishedGoods = [], summary = {} } = data;
  const { totalProduced = 0, totalSold = 0, masterBatchCost = 0, masterBatchCostPerTon = 0 } = summary;

  // ── Extract the _TOTALS_ synthetic row for aggregate KPIs ──
  const totalsRow    = materials.find(m => m._isTotalRow) || {};
  const ledgerItems  = materials.filter(m => !m._isTotalRow && (m.qtyKg || 0) > 0);  // purchase batches only (non-zero qty)

  const totalReceivedKG       = totalsRow.qtyKg || ledgerItems.reduce((s, m) => s + (m.qtyKg   || 0), 0);
  const totalUsedKG           = totalsRow.used  || 0;
  const totalValue            = totalsRow.total || ledgerItems.reduce((s, m) => s + (m.total || m.subTotal || 0), 0);
  const totalReceivedTons     = totalReceivedKG / 1000;
  const totalUsedTons         = totalUsedKG     / 1000;
  // This-month only remainder (may be 0 if no purchases this month)
  const thisMonthAvailKg      = Math.max(0, totalReceivedKG - totalUsedKG);

  // ── Cross-month cumulative warehouse stock ──
  // The warehouse available kg is now rolling by default from the engine
  const availableInWarehouse = summary.rawMatAvailKg || 0;
  
  const ytdMatAvailKg   = globalStats?.matAvailableKg     || 0;
  const ytdMatRecvKg    = globalStats?.matTotalReceivedKg || 0;
  const ytdMatUsedKg    = globalStats?.matTotalUsedKg     || 0;
  const ytdMatCost      = globalStats?.matTotalCost       || 0;
  const ytdLoaded       = globalStats?.ytdLoaded || false;

  // Avg cost per kg across all months purchased
  const avgMatCostPerKgGlobal = ytdMatRecvKg > 0 && ytdMatCost > 0
    ? ytdMatCost / ytdMatRecvKg
    : (summary.avgMatCostPerKg || 0);
  // This month's avg cost per kg (for this-month landing cost calculations)
  const avgMatCostPerKg  = totalReceivedKG > 0 ? totalValue / totalReceivedKG : avgMatCostPerKgGlobal;

  // ── Production / sales KPIs ──
  const globalProduced          = globalStats?.totalProduced ?? totalProduced;
  const globalSold              = globalStats?.totalSold     ?? totalSold;
  const totalAvailableInventory = Math.max(0, (globalProduced - globalSold) / 50);

  // ── Finished goods aggregates from the parser ──
  const fgTotalProduced = finishedGoods.reduce((s, g) => s + (g.qty  || 0), 0);
  const fgTotalSold     = finishedGoods.reduce((s, g) => s + (g.sold || 0), 0);
  // Use the rolling unsold total from the engine (which carries forward from prior months)
  const fgLastRemaining = summary.unsoldBags ?? Math.max(0, fgTotalProduced - fgTotalSold);

  // ── Average sell price per bag (from sales data) ──
  const salesRows        = (data.sales || []).filter(s => s.totalPrice > 0);
  const totalRevenue     = salesRows.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const totalBagsSold    = salesRows.reduce((s, r) => s + (r.quantity   || 0), 0);
  const avgSellPerBag    = totalBagsSold > 0 ? totalRevenue / totalBagsSold : 0;
  // Avg landed cost per bag (material + opex) — uses globalStats for correct cross-month cost per kg
  const totalOpCost      = summary.operatingCosts || 0;
  const matConsumedCost  = totalUsedKG > 0 ? totalUsedKG * avgMatCostPerKg : totalValue;
  const landedPerBag     = fgTotalProduced > 0 ? (matConsumedCost + totalOpCost) / fgTotalProduced : 0;
  // Remaining stock value
  const remainingSellValue = fgLastRemaining * avgSellPerBag;
  const remainingCostValue = fgLastRemaining * landedPerBag;
  // ── YTD cross-month aggregates (from globalStats, populated by useYTDEngine) ──
  const isMultiMonth  = (globalStats?.monthCount || 1) > 1;
  const ytdProduced   = Math.round((globalStats?.totalProduced || 0) * 50); // tons→bags
  const ytdSold       = globalStats?.totalSold   || 0;
  const ytdRemaining  = Math.max(0, ytdProduced - ytdSold);
  const ytdRevenue    = globalStats?.totalRevenue || 0;
  const ytdCosts      = globalStats?.totalCosts   || 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Stock &amp; Inventory</div>
            <div className="page-sub">Live from Google Sheets + Supabase · Warehouse reconciliation</div>
          </div>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <span>+</span> Add Movement
          </button>
        </div>
      </div>

      {/* ── Cross-Month YTD Context Banner ── */}
      {isMultiMonth && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 16, padding: '16px 22px', marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch'
        }}>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid rgba(139,92,246,0.2)', paddingRight: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a78bfa', marginBottom: 2 }}>📊 All Months — YTD</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ytdLoaded ? 'Synced across all months' : <span style={{ color: '#f59e0b' }}>⏳ Loading…</span>}</div>
          </div>

          {/* Material YTD */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#a78bfa', marginBottom: 6, letterSpacing: '0.1em' }}>🧱 Raw Material</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Received</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#60a5fa', fontFamily: 'var(--mono)' }}>{fmt(ytdMatRecvKg)} kg</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>{(ytdMatRecvKg/1000).toFixed(2)} tons</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Used in Production</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--mono)' }}>{fmt(ytdMatUsedKg)} kg</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>{(ytdMatUsedKg/1000).toFixed(2)} tons</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Still in Warehouse</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#34d399', fontFamily: 'var(--mono)' }}>{fmt(ytdMatAvailKg)} kg</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>{(ytdMatAvailKg/1000).toFixed(3)} tons · {fmt(Math.round(ytdMatCost))} EGP</div>
              </div>
            </div>
          </div>

          {/* Finished Goods YTD */}
          <div style={{ flex: 1, minWidth: 160, borderLeft: '1px solid rgba(139,92,246,0.2)', paddingLeft: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#a78bfa', marginBottom: 6, letterSpacing: '0.1em' }}>🏭 Finished Goods</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Produced</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', fontFamily: 'var(--mono)' }}>{fmt(ytdProduced)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>bags · {(ytdProduced/50).toFixed(2)} tons</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Sold</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--mono)' }}>{fmt(ytdSold)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>bags</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Remaining</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#34d399', fontFamily: 'var(--mono)' }}>{fmt(ytdRemaining)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)' }}>bags unsold</div>
              </div>
            </div>
          </div>

          {/* Financial YTD */}
          {ytdRevenue > 0 && (
            <div style={{ flex: 1, minWidth: 140, borderLeft: '1px solid rgba(139,92,246,0.2)', paddingLeft: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#a78bfa', marginBottom: 6, letterSpacing: '0.1em' }}>💰 Financials</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Revenue</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', fontFamily: 'var(--mono)' }}>{fmt(Math.round(ytdRevenue))}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>EGP</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>Total Costs</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--mono)' }}>{fmt(Math.round(ytdCosts))}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)' }}>EGP</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Factory Production Section ── */}
      <div className="card shadow-soft" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)' }}>🏭 Factory Production Stock (Absolute)</h6>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total bags produced across all months minus total bags sold — Absolute factory inventory</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Available (Unsold)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>
                {fgLastRemaining} <span style={{ fontSize: 14, opacity: 0.6 }}>Bags</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.04))', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>🏭 Produced This Month</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                {fgTotalProduced > 0 ? fgTotalProduced : fmt(totalProduced)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Bags · {((fgTotalProduced || totalProduced) / 50).toFixed(2)} tons
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.04))', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 6 }}>💰 Sold This Month</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
                {fgTotalSold > 0 ? fgTotalSold : fmt(totalSold)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Bags · {((fgTotalSold || totalSold) / 50).toFixed(2)} tons
              </div>
            </div>

            <div style={{
              background: fgLastRemaining > 0 ? 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.04))' : 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04))',
              border: `1px solid ${fgLastRemaining > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
              borderRadius: 14, padding: '20px 24px'
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: fgLastRemaining > 0 ? 'var(--accent2)' : 'var(--danger)', marginBottom: 6 }}>
                📦 TOTAL STOCK IN FACTORY
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: fgLastRemaining > 0 ? 'var(--accent2)' : 'var(--danger)', lineHeight: 1 }}>
                {fgLastRemaining}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Bags unsold · {(fgLastRemaining / 50).toFixed(2)} tons
              </div>
              {fgLastRemaining > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${fgLastRemaining > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  {remainingSellValue > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>📤 Sell Value</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>
                        {fmt(Math.round(remainingSellValue))} EGP
                      </span>
                    </div>
                  )}
                  {remainingCostValue > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>📥 Landed Cost</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', fontFamily: 'var(--mono)' }}>
                        {fmt(Math.round(remainingCostValue))} EGP
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Warehouse Section (Raw Materials) ── */}
      <div className="card shadow-soft" style={{ marginBottom: 24, borderLeft: '4px solid #3b82f6' }}>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)' }}>📦 Warehouse (Raw Material)</h6>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Total physical stock across all months · Received minus consumed in production
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase' }}>Available in Warehouse</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', fontFamily: 'var(--mono)' }}>
                {(availableInWarehouse / 1000).toFixed(3)} <span style={{ fontSize: 14, opacity: 0.6 }}>Tons</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bg3)', padding: '14px 18px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total Received (All Months)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>{fmt(Math.round(ytdLoaded ? ytdMatRecvKg : totalReceivedKG))} kg</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{((ytdLoaded ? ytdMatRecvKg : totalReceivedKG)/1000).toFixed(3)} tons · {ledgerItems.length} deliveries (this month)</div>
            </div>
            <div style={{ background: 'var(--bg3)', padding: '14px 18px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total Used in Production (All Months)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{fmt(Math.round(ytdLoaded ? ytdMatUsedKg : totalUsedKG))} kg</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{((ytdLoaded ? ytdMatUsedKg : totalUsedKG)/1000).toFixed(3)} tons</div>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))',
              border: '1px solid rgba(59,130,246,0.3)',
              padding: '14px 18px', borderRadius: 12,
            }}>
              <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🧱 Material in Warehouse (All Months)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: availableInWarehouse > 0 ? '#60a5fa' : 'var(--text3)', lineHeight: 1.1 }}>
                {fmt(Math.round(availableInWarehouse))} kg
              </div>
              <div style={{ fontSize: 10, color: '#93c5fd', marginTop: 2 }}>
                {(availableInWarehouse / 1000).toFixed(3)} tons · not yet produced
              </div>
              {!ytdLoaded && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⏳ Loading cross-month totals...</div>
              )}
              {ytdLoaded && ytdMatUsedKg > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  Total received {fmt(Math.round(ytdMatRecvKg))} kg − Used {fmt(Math.round(ytdMatUsedKg))} kg
                </div>
              )}
              {availableInWarehouse > 0 && avgMatCostPerKgGlobal > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, color: '#93c5fd' }}>💰 Stock Value</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#60a5fa', fontFamily: 'var(--mono)' }}>
                      {fmt(Math.round(availableInWarehouse * avgMatCostPerKgGlobal))} EGP
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: 'var(--bg3)', padding: '14px 18px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total Procurement Value</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>{fmt(totalValue)} EGP</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                Avg {totalReceivedKG > 0 ? fmt(Math.round(totalValue / totalReceivedKG)) : '—'} EGP/kg
              </div>
            </div>
            {/* ─── Raw Material Unit Cost ─── */}
            {totalReceivedKG > 0 && totalValue > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))',
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '14px 18px', borderRadius: 12,
              }}>
                <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🧱 Material Cost / Ton</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', lineHeight: 1.1 }}>
                  {fmt(Math.round((totalValue / totalReceivedKG) * 1000))} EGP
                </div>
                <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 4 }}>
                  per ton (1,000 kg) · avg {fmt(Math.round(totalValue / totalReceivedKG))} EGP/kg
                </div>
              </div>
            )}
            {/* ─── Master Batch Unit Cost ─── */}
            {masterBatchCost > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))',
                border: '1px solid rgba(16,185,129,0.3)',
                padding: '14px 18px', borderRadius: 12,
              }}>
                <div style={{ fontSize: 11, color: '#6ee7b7', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🌈 Master Batch Cost</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', lineHeight: 1.1 }}>
                  {fmt(Math.round(masterBatchCost))} EGP
                </div>
                <div style={{ fontSize: 10, color: '#6ee7b7', marginTop: 4 }}>
                  @{fmt(Math.round(masterBatchCostPerTon))} / ton produced
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ── Finished Goods Ledger ── */}
      <div className="card shadow-soft">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)' }}>📋 Finished Goods Ledger</h6>
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '3px 10px', borderRadius: 20 }}>
            {finishedGoods.length} product type{finishedGoods.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="table-wrap px-0">
          {finishedGoods.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
              No finished goods records found in the sheet.
            </div>
          ) : (
            <table className="table align-items-center mb-0">
              <thead>
                <tr>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Product</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Produced (Bags)</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Sold (Bags)</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Remaining</th>
                  <th className="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 text-end">Tons</th>
                </tr>
              </thead>
              <tbody>
                {finishedGoods.map((g, i) => {
                  const remaining = (g.remaining && g.remaining > 0)
                    ? g.remaining
                    : Math.max(0, (g.qty || 0) - (g.sold || 0));
                  return (
                    <tr key={i}>
                      <td>
                        <div className="px-3 py-2">
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)' }}>{g.item}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>6-liter bags</div>
                        </div>
                      </td>
                      <td className="px-3 text-end" style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent2)' }}>
                        {fmt(g.qty || 0)}
                      </td>
                      <td className="px-3 text-end" style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--danger)' }}>
                        {(g.sold || 0) > 0 ? `(${fmt(g.sold)})` : '—'}
                      </td>
                      <td className="px-3 text-end">
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: remaining > 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                          {fmt(remaining)}
                        </span>
                      </td>
                      <td className="px-3 text-end" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                        {((g.qty || 0) / 50).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="px-3 py-2" style={{ fontWeight: 700, fontSize: 13 }}>Totals</td>
                  <td className="px-3 py-2 text-end" style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent2)' }}>{fmt(fgTotalProduced)}</td>
                  <td className="px-3 py-2 text-end" style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--danger)' }}>({fmt(fgTotalSold)})</td>
                  <td className="px-3 py-2 text-end" style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent2)' }}>{fmt(fgLastRemaining)}</td>
                  <td className="px-3 py-2 text-end" style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{(fgTotalProduced / 50).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <DataEntryModal 
        title="Log Material Movement" 
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
            <option value="IN">Arrival (IN)</option>
            <option value="OUT">Production Usage (OUT)</option>
          </select>
        </div>
        <div className="field">
          <label>Material Type</label>
          <select value={newMove.material_type} onChange={e => setNewMove({...newMove, material_type: e.target.value})}>
            <option value="Plastic">Plastic (Raw)</option>
            <option value="Master Batch">Master Batch</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Quantity (KG)</label>
          <input type="number" placeholder="0.00" value={newMove.quantity} onChange={e => setNewMove({...newMove, quantity: e.target.value})} />
        </div>
        {newMove.type === 'IN' && (
          <div className="field">
            <label>Price per KG (EGP)</label>
            <input type="number" placeholder="0.00" value={newMove.unit_price} onChange={e => setNewMove({...newMove, unit_price: e.target.value})} />
          </div>
        )}
        <div className="field">
          <label>Notes</label>
          <textarea placeholder="e.g. Supplier name, specific grade..." value={newMove.notes} onChange={e => setNewMove({...newMove, notes: e.target.value})} />
        </div>
      </DataEntryModal>
    </div>
  );
}

export default Materials;
