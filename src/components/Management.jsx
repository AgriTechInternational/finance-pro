import React, { useState, useEffect } from 'react';
import { supabase, tables } from '../supabase';
import { approveDeletion, rejectDeletion, logActivity } from '../lib/audit';
import { formatDisplayDate } from '../lib/parseSheet';

function Management({ user, role, isSuper }) {
  const [tab, setTab] = useState('approvals');
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Pendings from all tables
      const tablesList = [
        { name: 'partner_transactions', label: 'Sale/Payment' },
        { name: 'expenses', label: 'Expense' },
        { name: 'inventory', label: 'Inventory' },
        { name: 'production', label: 'Production' },
        { name: 'attendance', label: 'Attendance' }
      ];

      const allPendings = [];
      await Promise.all(tablesList.map(async (t) => {
        const { data } = await supabase.from(t.name).select('*').eq('is_delete_pending', true);
        if (data) {
          data.forEach(item => {
            allPendings.push({ ...item, _table: t.name, _label: t.label });
          });
        }
      }));
      setPending(allPendings);

      // 2. Fetch Audit History
      const { data: auditData } = await supabase
        .from('audit_trail')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setHistory(auditData || []);

    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (item, action) => {
    if (!isSuper) return alert("Only Super Admins can approve deletions.");
    setActing(item.id);
    try {
      if (action === 'approve') {
        await approveDeletion(item._table, item.id, user.email);
      } else {
        await rejectDeletion(item._table, item.id, user.email);
      }
      await fetchData();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActing(null);
    }
  };

  const getRecordSummary = (item) => {
    if (item._table === 'partner_transactions') return `${item.partner_name}: ${item.amount} EGP (${item.notes})`;
    if (item._table === 'expenses') return `${item.category}: ${item.amount} EGP (${item.description})`;
    if (item._table === 'production') return `${item.worker_name}: ${item.bags_produced} bags`;
    return JSON.stringify(item);
  };

  return (
    <div className="page" style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Management Center</h1>
        <p className="page-sub">Approvals, Auditing, and Data Control</p>
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>
          🛡️ Pending Approvals ({pending.length})
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          📜 Audit History
        </button>
      </div>

      <div className="card" style={{ minHeight: 400 }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : tab === 'approvals' ? (
          <div className="table-wrap">
            {pending.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>No pending deletion requests.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Details</th>
                    <th>Requested By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(item => (
                    <tr key={item.id}>
                      <td><span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{item._label}</span></td>
                      <td>{formatDisplayDate(item.date)}</td>
                      <td style={{ fontSize: 13 }}>{getRecordSummary(item)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{item.delete_requested_by}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-sm btn-secondary" 
                            disabled={acting === item.id || !isSuper}
                            onClick={() => handleAction(item, 'reject')}
                          >
                            Reject
                          </button>
                          <button 
                            className="btn btn-sm btn-primary" 
                            style={{ background: '#ef4444' }}
                            disabled={acting === item.id || !isSuper}
                            onClick={() => handleAction(item, 'approve')}
                          >
                            Approve Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {history.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ fontSize: 12 }}>{log.user_email}</td>
                    <td>
                      <span className="badge" style={{ 
                        background: log.action_type.includes('APPROVED') ? 'rgba(16,185,129,0.1)' : 
                                    log.action_type.includes('REQUEST') ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                        color: log.action_type.includes('APPROVED') ? '#10b981' : 
                               log.action_type.includes('REQUEST') ? '#f59e0b' : '#3b82f6'
                      }}>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{log.table_name}</td>
                    <td style={{ fontSize: 12 }}>{log.record_details?.msg || JSON.stringify(log.record_details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Management;
