import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { Shield, Users, History, Trash2, CheckCircle, XCircle, AlertTriangle, Key, Search } from 'lucide-react';
import { logAuditTrail } from '../lib/audit';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminManagement({ role, userEmail }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('USERS');
  const [auditLogs, setAuditLogs] = useState([]);
  const [pendingDeletions, setPendingDeletions] = useState([]);

  const isSuper = role === 'SUPER_USER' || role === 'SUPER_ADMIN';
  const isAdmin = role === 'admin' || role === 'ADMIN' || isSuper;

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (activeTab === 'AUDIT' && isSuper) {
      fetchAuditLogs();
    }
    if (activeTab === 'PURGE' && isSuper) {
      fetchPendingDeletions();
    }
  }, [activeTab, isSuper]);

  async function fetchProfiles() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setProfiles(data || []);
    setLoading(false);
  }

  async function fetchAuditLogs() {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
    if (data) setAuditLogs(data);
  }

  async function fetchPendingDeletions() {
    // Fetch profile modifications pending approval
    const { data: profileRequests } = await supabase
      .from('profiles')
      .select('*')
      .or('is_delete_pending.eq.true,pending_role.not.is.null');
      
    if (profileRequests) {
      setPendingDeletions(profileRequests.map(p => ({ ...p, _type: 'PROFILE', _tableName: 'profiles' })));
    } else {
      setPendingDeletions([]); 
    }
  }

  async function updateRole(userId, targetEmail, newRole) {
    if (!isAdmin) return alert("Unauthorized");
    
    if (isSuper) {
      // Super user bypass instantly
      const { error } = await supabase.from("profiles").update({ role: newRole, pending_role: null }).eq("id", userId);
      if (!error) {
        await logAuditTrail(userEmail,'ROLE_CHANGE','USER',userId,`Instantly elevated/modified role for ${targetEmail} to ${newRole}`);
        fetchProfiles();
      } else alert("Error: " + error.message);
    } else {
      // Admin workflow
      if (newRole === 'PENDING') return alert("Security: Only a Super User can revoke system access.");
      
      const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', userId).single();
      
      if (currentProfile?.role === 'PENDING' && newRole === 'ENGINEER') {
        // Safe fast-track for new users
        const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
        if (!error) {
          await logAuditTrail(userEmail,'ROLE_CHANGE','USER',userId,`Fast-tracked initialization for ${targetEmail} to ENGINEER`);
          fetchProfiles();
        } else alert("Error: " + error.message);
      } else {
        // Request workflow
        const { error } = await supabase.from("profiles").update({ pending_role: newRole }).eq("id", userId);
        if (!error) {
          await logAuditTrail(userEmail,'ROLE_CHANGE','USER',userId,`Requested role change for ${targetEmail} to ${newRole}`);
          alert(`Request submitted. A Super User must approve this role change for ${targetEmail}.`);
          fetchProfiles();
        } else alert("Error: " + error.message);
      }
    }
  }

  const forcePasswordReset = async (userId, targetEmail) => {
    if (!isSuper) return;
    const { error } = await supabase.from('profiles').update({ force_password_reset: true }).eq('id', userId);
    
    if (!error) {
      await logAuditTrail(userEmail, 'PWD_RESET_FORCED', 'USER', userId, `Triggered mandatory password rotation for ${targetEmail}`);
      alert(`Security: ${targetEmail} will be forced to rotate terminal credentials.`);
      fetchProfiles();
    } else {
      alert("Error: " + error.message);
    }
  };

  const deleteProfile = async (userId, targetEmail) => {
    if (!isAdmin) return;
    
    if (isSuper) {
      const confirmDelete = window.confirm(`CRITICAL WARNING: Are you sure you want to permanently delete the profile for ${targetEmail}? This will instantly revoke their access.`);
      if (!confirmDelete) return;

      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (!error) {
         await logAuditTrail(userEmail, 'PROFILE_PURGED', 'USER', userId, `Permanently deleted profile for ${targetEmail}`);
         alert(`Profile for ${targetEmail} has been purged.`);
         fetchProfiles();
      } else {
         alert("Security Check Failed: You lack the database credentials to delete rows. Please run the RLS patch in Supabase SQL editor on your profiles table first.");
      }
    } else {
      const { error } = await supabase.from('profiles').update({ is_delete_pending: true }).eq('id', userId);
      if (!error) {
         await logAuditTrail(userEmail, 'DELETE_REQUEST', 'USER', userId, `Requested to purge profile for ${targetEmail}`);
         alert(`Purge Request submitted. A Super User must approve the destruction of ${targetEmail}.`);
         fetchProfiles();
      } else {
         alert("Error: " + error.message);
      }
    }
  };

  const approveRequest = async (item) => {
    if (!isSuper) return;
    
    if (item.is_delete_pending) {
      const { error } = await supabase.from('profiles').delete().eq('id', item.id);
      if (!error) {
        await logAuditTrail(userEmail, 'PROFILE_PURGED', 'USER', item.id, `Approved purge request for ${item.email}`);
        fetchPendingDeletions();
        fetchProfiles();
      }
    } else if (item.pending_role) {
      const { error } = await supabase.from('profiles').update({ role: item.pending_role, pending_role: null }).eq('id', item.id);
      if (!error) {
        await logAuditTrail(userEmail, 'ROLE_CHANGE', 'USER', item.id, `Approved role change for ${item.email} to ${item.pending_role}`);
        fetchPendingDeletions();
        fetchProfiles();
      }
    }
  };

  const rejectRequest = async (item) => {
    if (!isSuper) return;
    const { error } = await supabase.from('profiles').update({ is_delete_pending: false, pending_role: null }).eq('id', item.id);
    if (!error) {
      await logAuditTrail(userEmail, 'ROLE_CHANGE', 'USER', item.id, `Rejected modification request for ${item.email}`);
      fetchPendingDeletions();
      fetchProfiles();
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Establishing secure connection...</div>;

  return (
    <div className="admin-page animate-in">
      <div className="page-header">
        <div className="page-title">Command Authority</div>
        <div className="page-sub">System-wide personnel management and security auditing</div>
      </div>

      <div className="tab-container" style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setActiveTab('USERS')} className={`admin-tab ${activeTab === 'USERS' ? 'active' : ''}`}><Users size={14} className="mr-2"/> Personnel</button>
        {isSuper && (
          <>
            <button onClick={() => setActiveTab('AUDIT')} className={`admin-tab ${activeTab === 'AUDIT' ? 'active' : ''}`}><History size={14} className="mr-2"/> Audit Trail</button>
            <button onClick={() => setActiveTab('PURGE')} className={`admin-tab ${activeTab === 'PURGE' ? 'active' : ''}`}><Trash2 size={14} className="mr-2"/> Purge Hub</button>
          </>
        )}
      </div>

      {error && (
        <div className="alert-error" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '16px 20px', borderRadius: 16, marginBottom: 24, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <AlertTriangle size={16} style={{ marginRight: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 10, marginBottom: 2 }}>{error.includes('lock') ? 'Synchronization Conflict' : 'System Error'}</span>
              <span style={{ opacity: 0.9 }}>{error.includes('lock') ? 'Another tab is currently refreshing security tokens. Please close excessive tabs or retry.' : error}</span>
            </div>
          </div>
          <button 
            onClick={() => { setError(null); fetchProfiles(); }}
            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 10, fontSize: 10, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
          >
            Retry Connection
          </button>
        </div>
      )}

      <div className="card shadow-soft overflow-hidden">
        {activeTab === 'USERS' && (
          <div style={{ padding: '24px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text3)', textTransform: 'uppercase', fontSize: 10 }}>Identity</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text3)', textTransform: 'uppercase', fontSize: 10 }}>Clearance</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--text3)', textTransform: 'uppercase', fontSize: 10 }}>Commissioned</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text3)', textTransform: 'uppercase', fontSize: 10 }}>Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const isUserSuper = p.role === 'SUPER_USER';
                    if (isUserSuper && !isSuper) return null;
                    
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 8px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text1)' }}>{p.full_name || 'Anonymous'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.email || p.id}</div>
                        </td>
                        <td style={{ padding: '16px 8px' }}>
                          <div className={`badge role-${(p.role || 'PENDING').toLowerCase()}`}>
                            {p.role}
                          </div>
                          {p.force_password_reset && <span style={{ marginLeft: 8, color: '#f59e0b', fontSize: 9, fontWeight: 900 }}>[RESET PENDING]</span>}
                          {p.is_delete_pending && <span style={{ marginLeft: 8, color: '#ef4444', fontSize: 9, fontWeight: 900 }}>[PURGE REQUESTED]</span>}
                          {p.pending_role && <span style={{ marginLeft: 8, color: '#3b82f6', fontSize: 9, fontWeight: 900 }}>[{p.pending_role} REQUESTED]</span>}
                        </td>
                        <td style={{ padding: '16px 8px', color: 'var(--text3)' }}>
                          {p.created_at ? fmtDate(p.created_at) : 'Historical'}
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {isSuper && !p.force_password_reset && (
                              <button className="btn-icon" onClick={() => forcePasswordReset(p.id, p.email)} title="Force Password Reset"><Key size={14}/></button>
                            )}
                            <select 
                              value={p.role || 'PENDING'} 
                              onChange={(e) => updateRole(p.id, p.email, e.target.value)}
                              className="role-selector"
                              disabled={!isSuper && p.role === 'admin'}
                              style={{ 
                                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', 
                                color: 'var(--text1)', padding: '6px 10px', borderRadius: 10, 
                                fontSize: 10, fontWeight: 800, cursor: 'pointer', outline: 'none'
                              }}
                            >
                              <option value="PENDING">REVOKE ACCESS</option>
                              <option value="ENGINEER">ENGINEER</option>
                              <option value="admin">ADMIN</option>
                              {isSuper && <option value="SUPER_USER">SUPER USER</option>}
                            </select>
                            
                            <button 
                              className="btn-icon" 
                              onClick={() => deleteProfile(p.id, p.email)} 
                              title={isSuper ? "Purge Profile Completely" : "Request Profile Deletion"}
                              style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            >
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'AUDIT' && (
          <div style={{ padding: 24 }} className="animate-in fade-in">
             <div style={{ display: 'flex', alignItems: 'center', color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '10px 16px', borderRadius: 12, marginBottom: 20 }}>
                <Search size={14} style={{ marginRight: 8 }} />
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Telemetry Stream: Security Events</span>
             </div>
             <div className="audit-list" style={{ maxHeight: 500, overflowY: 'auto' }}>
                {auditLogs.map(log => (
                  <div key={log.id} style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)', borderRadius: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                       <span style={{ fontSize: 10, fontWeight: 900, background: '#1e3a8a', color: '#60a5fa', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>{log.action}</span>
                       <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text1)', fontSize: 13, marginBottom: 4 }}>{log.user_email}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>{log.details}</div>
                  </div>
                ))}
                {auditLogs.length === 0 && <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No entries in audit buffer.</div>}
             </div>
          </div>
        )}

        {activeTab === 'PURGE' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ opacity: 0.5, marginBottom: 12 }}><AlertTriangle size={48} style={{ margin: '0 auto', color: '#f59e0b' }}/></div>
            <h4 style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 14 }}>Security Disposal Hub</h4>
            <p style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 400, margin: '12px auto 24px' }}>Records requested for archival will appear here for Super User authorization.</p>
            <div style={{ background: 'rgba(0,0,0,0.1)', padding: 40, borderRadius: 16, border: '1px dashed var(--border)' }}>
               <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text3)', textTransform: 'uppercase' }}>Queue Clear: No pending items</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .admin-tab { 
          background: none; border: none; color: var(--text3); padding: 12px 20px; font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s; border-bottom: 2px solid transparent; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center;
        }
        .admin-tab:hover { color: var(--text1); }
        .admin-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; background: rgba(59,130,246,0.05); }

        .badge { display:inline-block; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border: 1px solid rgba(255,255,255,0.1); }
        .role-super_user { background: #1e3a8a; color: #60a5fa; border-color: rgba(96,165,250,0.3); }
        .role-admin { background: rgba(59,130,246,0.1); color: #3b82f6; }
        .role-engineer { background: rgba(16,185,129,0.1); color: #10b981; }
        .role-pending { background: rgba(245,158,11,0.1); color: #f59e0b; }

        .btn-admin { border:none; padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; text-transform: uppercase; }
        .admit-admin { background: #3b82f6; color: white; }
        .admit-engineer { background: #10b981; color: white; }
        .revoke-btn { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
        .revoke-btn:hover { background: #ef4444; color: white; }
        .btn-icon { background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--text3); padding: 6px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .btn-icon:hover { color: #f59e0b; border-color: #f59e0b; }
        .btn-admin:hover { transform: translateY(-1px); filter: brightness(1.1); }
      `}</style>
    </div>
  );
}
