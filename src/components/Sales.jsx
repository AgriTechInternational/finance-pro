import React, { useState } from 'react';
import { formatDisplayDate, toISO } from '../lib/parseSheet';
import { supabase, tables } from '../supabase';
import DataEntryModal from './DataEntryModal';
import { requestDeletion } from '../lib/audit';
import { clearEngineCache } from '../lib/useSheetEngine';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const ALL_PARTNERS = ['Wageh', 'Nour', 'Haitham', 'Elwady', 'El Wady', 'Emad', 'Adel', 'Nagy', 'Mohamed', 'Tharwat'];

function Sales({ data, user, role, isAdmin, isSuper }) {
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // inline confirm state
  const [newSale, setNewSale] = useState({
    date: new Date().toISOString().split('T')[0],
    customer: '', // To be set on open
    product: '6L',
    quantity: '',
    pricePerBag: '',
    paid: '',
    note: ''
  });
  const [newPay, setNewPay] = useState({
    date: new Date().toISOString().split('T')[0],
    customer: '', // To be set on open
    amount: '',
    note: ''
  });
  const [newAdj, setNewAdj] = useState({
    date: new Date().toISOString().split('T')[0],
    customer: '', 
    type: 'Debit',
    amount: '',
    note: ''
  });

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>🔄</div>
      <div>Syncing Sales data with Google Sheets...</div>
    </div>
  );

  const handleSaveSale = async () => {
    if (!newSale.quantity || !newSale.pricePerBag) return alert("Please fill in quantity and price");
    setIsSaving(true);
    const total = parseFloat(newSale.quantity) * parseFloat(newSale.pricePerBag);
    try {
      const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
      // 1. Log the Sale transaction
      const { error: saleErr } = await supabase.from(tables.TRANSACTIONS).insert([
        {
          partner_name: newSale.customer || tab,
          date: newSale.date,
          type: 'Debit', // Sale is a debt from customer perspective
          amount: total,
          notes: `Sale: ${newSale.quantity}x ${newSale.product} @ ${newSale.pricePerBag} EGP. ${newSale.note}`,
          is_dev_test: isTest
        }
      ]);
      if (saleErr) throw saleErr;

      // Auto-increment customer star in database-app
      if (newSale.customer || tab) {
        try {
          const cName = newSale.customer || tab;
          // Note: using the same supabase instance since they share a project
          const { data: custData } = await supabase.from('db_customers').select('id, stars').ilike('org_name', cName).single();
          if (custData) {
            await supabase.from('db_customers').update({ stars: (custData.stars || 0) + 1 }).eq('id', custData.id);
          }
        } catch(err) {
          console.warn("Failed to update customer stars", err);
        }
      }

      // 2. Log the Downpayment if any
      if (parseFloat(newSale.paid) > 0) {
        const { error: payErr } = await supabase.from(tables.TRANSACTIONS).insert([
          {
            partner_name: newSale.customer || tab,
            date: newSale.date,
            type: 'Credit', // Payment reduces debt
            amount: parseFloat(newSale.paid),
            notes: `Downpayment for sale on ${newSale.date}`,
            is_dev_test: isTest
          }
        ]);
        if (payErr) throw payErr;
      }

      clearEngineCache();
      setIsSaleModalOpen(false);
      window.location.reload();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePayment = async () => {
    if (!newPay.amount) return alert("Please enter amount");
    setIsSaving(true);
    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
    try {
      const { error } = await supabase.from(tables.TRANSACTIONS).insert([
        {
          partner_name: newPay.customer || tab,
          date: newPay.date,
          type: 'Credit',
          amount: parseFloat(newPay.amount),
          notes: newPay.note || 'Payment Received',
          is_dev_test: isTest
        }
      ]);
      if (error) throw error;
      clearEngineCache();
      setIsPayModalOpen(false);
      window.location.reload();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAdjustment = async () => {
    if (!newAdj.amount) return alert("Please enter amount");
    setIsSaving(true);
    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
    try {
      const { error } = await supabase.from(tables.TRANSACTIONS).insert([
        {
          partner_name: newAdj.customer || tab,
          date: newAdj.date,
          type: newAdj.type,
          amount: parseFloat(newAdj.amount),
          notes: newAdj.note || `Manual ${newAdj.type} Adjustment`,
          is_dev_test: isTest
        }
      ]);
      if (error) throw error;
      clearEngineCache();
      setIsAdjModalOpen(false);
      window.location.reload();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!isAdmin) return;
    setConfirmDeleteId(item.id);
  };

  const handleConfirmDelete = async (item) => {
    setConfirmDeleteId(null);
    setIsSaving(true);
    try {
      const { error } = await requestDeletion(tables.TRANSACTIONS, item.id, user.email);
      if (error) throw error;
      clearEngineCache();
      window.location.reload();
    } catch (e) {
      alert('Delete Request Failed: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const { sales = [] } = data;

  // Build flat list of all customers found in data + known defaults
  // Normalize names to avoid duplicate tabs from trailing spaces or casing
  const foundPartners = [...new Set(sales.map(s => (s.customer || '').trim()))];
  const allTabs = [...new Set([...ALL_PARTNERS, ...foundPartners])].filter(Boolean);

  const [tab, setTab] = useState(foundPartners[0] || allTabs[0]);

  // Use trimmed comparison for robust filtering
  const customerSalesRaw = sales.filter(s => (s.customer || '').trim() === (tab || '').trim());
  
  // ── LEDGER CALCULATION: Running Balance ──
  let cumulativeBal = 0;
  const customerSales = [...customerSalesRaw]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(s => {
      cumulativeBal += (s.totalPrice || 0) - (s.paid || 0);
      return { ...s, runningBal: cumulativeBal };
    });

  // Only count rows with totalPrice > 0 as sales transactions
  const salesRows    = customerSales.filter(s => s.totalPrice > 0);
  const totalPrice   = salesRows.reduce((s, r) => s + r.totalPrice, 0);
  // Total paid = all paid amounts (includes payment-only rows)
  const totalPaid    = customerSales.reduce((s, r) => s + (r.paid || 0), 0);
  // Outstanding = totalPrice minus everything paid (including standalone payments)
  const totalRemain  = Math.max(0, totalPrice - totalPaid);

  const overallRevenue  = sales.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const overallPaid     = sales.reduce((s, r) => s + (r.paid || 0), 0);
  const overallRemain   = Math.max(0, overallRevenue - overallPaid);
  const overallBags     = sales.reduce((s, r) => s + (r.quantity || 0), 0);
  const overallReturn   = sales.filter(s => s.totalPrice < 0).reduce((s, r) => s + (r.totalPrice || 0), 0);

  const hasSales = customerSales.length > 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Revenue &amp; Sales</div>
            <div className="page-sub">Live from Google Sheets + Supabase — all customer tabs</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => {
              setNewAdj({...newAdj, customer: tab, type: 'Debit', note: 'Starting Balance'});
              setIsAdjModalOpen(true);
            }}>
              ⚖️ Set Balance
            </button>
            <button className="btn btn-secondary" onClick={() => {
              setNewPay({...newPay, customer: tab});
              setIsPayModalOpen(true);
            }}>
              💳 Add Payment
            </button>
            <button className="btn btn-primary" onClick={() => {
              setNewSale({...newSale, customer: tab});
              setIsSaleModalOpen(true);
            }}>
              <span>+</span> New Sale
            </button>
          </div>
        </div>
      </div>

      {/* Overall summary bar */}
      {sales.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          <div className="kpi" style={{ '--kpi-color': 'var(--accent2)' }}>
            <div className="kpi-label">All Revenue</div>
            <div className="kpi-value" style={{ color: 'var(--accent2)' }}>{fmt(overallRevenue)} EGP</div>
            <div className="kpi-sub">{fmt(overallBags)} bags · {(overallBags / 50).toFixed(2)} tons sold</div>
          </div>
          <div className="kpi" style={{ '--kpi-color': 'var(--accent)' }}>
            <div className="kpi-label">Total Collected</div>
            <div className="kpi-value" style={{ color: 'var(--accent)' }}>{fmt(overallPaid)} EGP</div>
            <div className="kpi-sub">Cash received</div>
          </div>
          <div className="kpi" style={{ '--kpi-color': overallRemain > 0 ? 'var(--accent3)' : 'var(--accent2)' }}>
            <div className="kpi-label">Outstanding</div>
            <div className="kpi-value" style={{ color: overallRemain > 0 ? 'var(--accent3)' : 'var(--accent2)' }}>
              {overallRemain > 0 ? `${fmt(overallRemain)} EGP` : '✓ Fully Settled'}
            </div>
            <div className="kpi-sub">{overallRemain > 0 ? 'Uncollected balance' : 'No outstanding balance'}</div>
          </div>
        </div>
      )}

      {/* Partner tabs */}
      <div className="tabs" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {allTabs.map(c => {
          const trimmedC = (c || '').trim();
          const hasData = sales.some(s => (s.customer || '').trim() === trimmedC && (s.totalPrice > 0 || s.paid > 0));
          const custSales = sales.filter(s => (s.customer || '').trim() === trimmedC);
          const custPrice = custSales.filter(s => s.totalPrice > 0).reduce((s, r) => s + r.totalPrice, 0);
          const custPaid  = custSales.reduce((s, r) => s + (r.paid || 0), 0);
          const custOwed  = Math.max(0, custPrice - custPaid);
          return (
            <div
              key={c}
              className={`tab${tab === c ? ' active' : ''}`}
              onClick={() => setTab(c)}
              style={{ position: 'relative', opacity: hasData ? 1 : 0.5 }}
            >
              {c}
              {hasData && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 6, height: 6, borderRadius: '50%',
                  background: custOwed > 0 ? '#f59e0b' : 'var(--accent2)',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Per-customer KPIs */}
      {hasSales && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi" style={{ '--kpi-color': 'var(--accent2)' }}>
            <div className="kpi-label">Total Amount</div>
            <div className="kpi-value">{fmt(totalPrice)} EGP</div>
            <div className="kpi-sub">{fmt(salesRows.reduce((s, r) => s + (r.quantity || 0), 0))} bags · {(salesRows.reduce((s, r) => s + (r.quantity || 0), 0) / 50).toFixed(2)} t</div>
          </div>
          <div className="kpi" style={{ '--kpi-color': 'var(--accent)' }}>
            <div className="kpi-label">Total Paid</div>
            <div className="kpi-value">{fmt(totalPaid)} EGP</div>
          </div>
          <div className="kpi" style={{ '--kpi-color': totalRemain > 0 ? 'var(--accent3)' : 'var(--accent2)' }}>
            <div className="kpi-label">Outstanding</div>
            <div className="kpi-value" style={{ color: totalRemain > 0 ? 'var(--accent3)' : 'var(--accent2)' }}>
              {totalRemain > 0 ? `${fmt(totalRemain)} EGP` : '✓ Fully Paid'}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {!hasSales ? (
            <div className="empty" style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ color: 'var(--text3)', fontSize: 14 }}>
                No sales recorded for <strong style={{ color: 'white' }}>{tab}</strong>
              </div>
              {sales.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                  Connect a sheet in ⚙️ Settings to see live data
                </div>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debt (Debit)</th>
                  <th style={{ textAlign: 'right' }}>Payment (Credit)</th>
                  <th style={{ textAlign: 'right' }}>Running Balance</th>
                  <th>Status</th>
                  {isAdmin && <th style={{ textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {customerSales.map((s, i) => {
                  // Determine this row's status taking into account it may be payment-only
                  const isSaleRow    = s.totalPrice > 0;
                  const isPaymentRow = !isSaleRow && s.paid > 0;
                  const rowRemain    = s.remain || 0;
                  return (
                    <tr key={i} style={{ opacity: isPaymentRow ? 0.9 : 1, background: isPaymentRow ? 'rgba(59,130,246,0.02)' : 'transparent' }}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>
                        {formatDisplayDate(s.date)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {isPaymentRow
                          ? <span>💳 {s.notes || s.description || 'Payment Received'}</span>
                          : <span>{s.notes || s.description || '—'}</span>}
                      </td>
                      <td style={{ textAlign: 'right', color: isSaleRow ? 'white' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {isSaleRow ? fmt(s.totalPrice) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: s.paid > 0 ? 'var(--accent2)' : 'var(--text3)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {s.paid > 0 ? fmt(s.paid) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        <strong style={{ color: s.runningBal > 0 ? '#f59e0b' : 'var(--accent2)' }}>
                          {fmt(s.runningBal)} EGP
                        </strong>
                      </td>
                      <td>
                        {isPaymentRow
                          ? <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>Payment</span>
                          : s.runningBal > 0
                            ? <span className="badge badge-yellow">Unsettled</span>
                            : <span className="badge badge-green">Settled</span>}
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          {s.is_delete_pending ? (
                            <span title="Waiting for Super User approval" style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>PENDING</span>
                          ) : confirmDeleteId === s.id ? (
                            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#ef4444' }}>Delete?</span>
                              <button onClick={() => handleConfirmDelete(s)} style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>Yes</button>
                              <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>No</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDelete(s)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}
                              title="Request Deletion"
                            >
                              🗑️
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* NEW SALE MODAL */}
      <DataEntryModal 
        title={`New Sale — ${tab}`} 
        isOpen={isSaleModalOpen} 
        onClose={() => setIsSaleModalOpen(false)} 
        onSave={handleSaveSale}
        loading={isSaving}
      >
        <div className="field">
          <label>Customer</label>
          <select value={newSale.customer} onChange={e => setNewSale({...newSale, customer: e.target.value})}>
            {allTabs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={newSale.date} onChange={e => setNewSale({...newSale, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Product Type</label>
          <select value={newSale.product} onChange={e => setNewSale({...newSale, product: e.target.value})}>
            <option value="6L">6 Liter Bags</option>
            <option value="8L">8 Liter Bags</option>
          </select>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Quantity (Bags)</label>
            <input type="number" placeholder="0" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} />
          </div>
          <div className="field">
            <label>Price per Bag (EGP)</label>
            <input type="number" placeholder="0.00" value={newSale.pricePerBag} onChange={e => setNewSale({...newSale, pricePerBag: e.target.value})} />
          </div>
        </div>
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 13 }}>
          <strong>Total Amount:</strong> {fmt(parseFloat(newSale.quantity || 0) * parseFloat(newSale.pricePerBag || 0))} EGP
        </div>
        <div className="field">
          <label>Downpayment / Paid Now (EGP)</label>
          <input type="number" placeholder="0.00" value={newSale.paid} onChange={e => setNewSale({...newSale, paid: e.target.value})} />
        </div>
        <div className="field">
          <label>Note (Optional)</label>
          <input type="text" placeholder="Add specific details..." value={newSale.note} onChange={e => setNewSale({...newSale, note: e.target.value})} />
        </div>
      </DataEntryModal>

      {/* ADD PAYMENT MODAL */}
      <DataEntryModal 
        title={`Add Payment — ${tab}`} 
        isOpen={isPayModalOpen} 
        onClose={() => setIsPayModalOpen(false)} 
        onSave={handleSavePayment}
        loading={isSaving}
      >
        <div className="field">
          <label>Customer</label>
          <select value={newPay.customer} onChange={e => setNewPay({...newPay, customer: e.target.value})}>
            {allTabs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={newPay.date} onChange={e => setNewPay({...newPay, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Amount (EGP)</label>
          <input type="number" placeholder="0.00" value={newPay.amount} onChange={e => setNewPay({...newPay, amount: e.target.value})} />
        </div>
        <div className="field">
          <label>Note / Reference</label>
          <input type="text" placeholder="Installment, cash, etc." value={newPay.note} onChange={e => setNewPay({...newPay, note: e.target.value})} />
        </div>
      </DataEntryModal>

      {/* ADJUSTMENT MODAL */}
      <DataEntryModal 
        title={`Ledger Adjustment — ${tab}`} 
        isOpen={isAdjModalOpen} 
        onClose={() => setIsAdjModalOpen(false)} 
        onSave={handleSaveAdjustment}
        loading={isSaving}
      >
        <div style={{ marginBottom: 20, padding: 12, background: 'rgba(59,130,246,0.1)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.2)', fontSize: 12 }}>
          <strong>💡 Pro-tip:</strong> Use this to set a <strong>Starting Balance</strong> or to record a <strong>Manual Debt</strong> that isn't from a bag sale.
        </div>
        <div className="field">
          <label>Partner / Customer</label>
          <select value={newAdj.customer} onChange={e => setNewAdj({...newAdj, customer: e.target.value})}>
            {allTabs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={newAdj.date} onChange={e => setNewAdj({...newAdj, date: e.target.value})} />
        </div>
        <div className="field">
          <label>Adjustment Type</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button 
              type="button" 
              className={`btn btn-sm ${newAdj.type === 'Debit' ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => setNewAdj({...newAdj, type: 'Debit'})}
              style={{ flex: 1 }}
            >
              Add Debt (+)
            </button>
            <button 
              type="button" 
              className={`btn btn-sm ${newAdj.type === 'Credit' ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => setNewAdj({...newAdj, type: 'Credit'})}
              style={{ flex: 1 }}
            >
              Reduce Debt (-)
            </button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label>Amount (EGP)</label>
          <input type="number" placeholder="0.00" value={newAdj.amount} onChange={e => setNewAdj({...newAdj, amount: e.target.value})} />
        </div>
        <div className="field">
          <label>Description (Path/Note)</label>
          <input type="text" placeholder="e.g. Opening Balance, Cash Settlement..." value={newAdj.note} onChange={e => setNewAdj({...newAdj, note: e.target.value})} />
        </div>
      </DataEntryModal>
    </div>
  );
}

export default Sales;
