import React, { useState } from 'react';
import { 
  addMonthSynced, 
  removeMonthSynced, 
  extractGid,
  getSyncUrl,
  setSyncUrl,
  isFutureMonth
} from '../lib/monthRegistry';
import { syncAllToSheets } from '../lib/syncEngine';
import { supabase } from '../supabase';
import { clearEngineCache } from '../lib/useSheetEngine';

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function Settings({ role, months = [], activeSheetId, onSwitch, onMonthsChange }) {
  const [input,    setInput]   = useState('');
  const [label,    setLabel]   = useState('');
  const [month,    setMonth]   = useState(new Date().getMonth());
  const [year,     setYear]    = useState(new Date().getFullYear());
  const [adding,   setAdding]  = useState(false);
  const [testMsg,  setTestMsg] = useState('');
  
  const [syncUrl,  setSyncUrlState] = useState(getSyncUrl());
  const [syncStatus, setSyncStatus] = useState(null); // { loading: bool, msg: string, success: bool }

  if (!onMonthsChange || !onSwitch) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--danger)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h3>Interface Error</h3>
        <p>Could not initialize sheet connection handlers.</p>
      </div>
    );
  }

  const handleAdd = async () => {
    // Determine ID early
    const isCloudOnly = !input || input.trim() === '';
    const sheetId = isCloudOnly ? `SUPA_${year}_${month}` : extractSheetId(input);
    const gidFromUrl = isCloudOnly ? null : extractGid(input);

    if (!isCloudOnly && (!sheetId || sheetId.length < 20)) { setTestMsg('❌ Invalid Sheet URL or ID'); return; }
    if (!label.trim()) { setTestMsg('❌ Please enter a label (e.g. March 2026)'); return; }

    setAdding(true);

    let reachable = true; // Assume true for Cloud-Only
    if (!isCloudOnly) {
      setTestMsg('⏳ Testing connection...');
      // Try several known GIDs + the one from the URL — succeed on the first valid CSV response
      const testGids = [...new Set([gidFromUrl, '2126333699', '1425731211', '512991814', ''])].filter(g => g !== null);
      reachable = false;

    for (const gid of testGids) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const url = gid
          ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
          : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        
        const res  = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const text = await res.text();
        if (res.ok && text.length > 10 && !text.trim().startsWith('<!') && !text.includes('<html')) {
          reachable = true;
          break;
        }
      } catch (err) { 
        console.warn(`Connection test failed for GID ${gid}:`, err.message);
      }
      } // end for loop
    }

    if (!reachable) {
      setTestMsg('❌ Cannot reach sheet. Open the sheet in Google → Share → "Anyone with the link" → Viewer.');
      setAdding(false);
      return;
    }

    try {
      // 🔥 Sync to Cloud (with strict 5s timeout & local fallback)
      const updated = await addMonthSynced({ 
        sheetId, 
        label: label.trim(), 
        month: parseInt(month), 
        year: parseInt(year) 
      });
      
      clearEngineCache();
      onMonthsChange(updated || []);
      onSwitch(sheetId);

      // Check if sync actually happened or if we fell back
      const isCloudSynced = updated && updated.length > 0; 
      if (isCloudSynced) {
        setTestMsg('✅ Connected! Data streaming now...');
      } else {
        setTestMsg('⚠️ Saved locally, but Cloud Sync failed (Table missing?).');
      }
      
      setInput(''); setLabel('');
    } catch (err) {
      console.error('Final Submission Error:', err);
      setTestMsg('⚠️ Generic Error. Sheet saved locally.');
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async () => {
    if (!syncUrl) {
      setSyncStatus({ loading: false, msg: '❌ Please enter your Google Sync URL first.', success: false });
      return;
    }
    setSyncStatus({ loading: true, msg: '⏳ Synchronizing Supabase → Google Sheets...', success: false });
    try {
      const results = await syncAllToSheets(syncUrl, months);
      const total = results.sales + results.expenses + results.production + results.inventory + results.attendance;
      if (total === 0) {
        setSyncStatus({ loading: false, msg: '✅ All data is already synced!', success: true });
      } else {
        setSyncStatus({ loading: false, msg: `✅ Successfully synced ${total} new records!`, success: true });
      }
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (err) {
      setSyncStatus({ loading: false, msg: '❌ Sync failed: ' + err.message, success: false });
    }
  };

  const saveSyncUrl = () => {
    setSyncUrl(syncUrl);
    setTestMsg('✅ Sync URL saved!');
    setTimeout(() => setTestMsg(''), 3000);
  };

  const handleRemove = async (sheetId) => {
    clearEngineCache();
    const updated = await removeMonthSynced(sheetId);
    onMonthsChange(updated);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Sheet Connections &amp; Upload</div>
        <div className="page-sub">Paste your Google Sheet link below to stream live data into your dashboard.</div>
      </div>

      {/* ── GOOGLE SYNC MANAGER ── */}
      <div className="card" style={{ marginBottom: 24, border: '1px solid var(--accent)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.05)' }}>
          <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>🚀 Google Sheets Sync (Beta)</h6>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
            Push your locally entered data (from Supabase) back into your Google Sheets.
          </p>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6, fontWeight: 600 }}>GOOGLE APPS SCRIPT WEB APP URL</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="form-control"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={syncUrl}
                onChange={e => setSyncUrlState(e.target.value)}
                style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={saveSyncUrl} style={{ borderRadius: 8 }}>Save URL</button>
            </div>
          </div>

          {syncStatus && (
            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
              background: syncStatus.success ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
              color: syncStatus.success ? 'var(--accent2)' : 'var(--accent)',
              border: `1px solid ${syncStatus.success ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              {syncStatus.loading && <div className="spinner-sm" />}
              {syncStatus.msg}
            </div>
          )}

          <button 
            className="btn btn-primary" 
            onClick={handleSync}
            disabled={!syncUrl || syncStatus?.loading}
            style={{ width: '100%', borderRadius: 10, padding: '14px', background: 'var(--accent)', fontWeight: 800, fontSize: 14 }}
          >
            {syncStatus?.loading ? '🔄 Syncing Data...' : '📤 Sync All with Google Sheets'}
          </button>
          
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>
            This will push all unsynced manual entries into their respective month sheets.
          </p>
        </div>
      </div>
      {/* ── Month Manager ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h6 style={{ margin: 0, fontWeight: 700, color: 'var(--text1)', fontSize: 14 }}>📅 Monthly Sheet Registry</h6>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
            Each month gets its own Google Sheet. Data streams live — no manual sync needed.
          </p>
        </div>

        {/* Existing months */}
        {(months || []).length > 0 ? (
          <div style={{ padding: '12px 24px' }}>
            {months.map(m => (
              <div key={m.sheetId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: m.sheetId === activeSheetId ? 'var(--accent2)' : 'var(--text3)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)' }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    ID: {m.sheetId.slice(0, 20)}…
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {m.sheetId !== activeSheetId && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => onSwitch(m.sheetId)}
                      style={{ padding: '4px 12px', fontSize: 11, borderRadius: 8 }}
                    >
                      Activate
                    </button>
                  )}
                  {m.sheetId === activeSheetId && (
                    <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 700 }}>✓ Active</span>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => handleRemove(m.sheetId)}
                    style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            No months registered yet. Add your first one below.
          </div>
        )}

        {/* Add new month form */}
        <div style={{ padding: '20px 24px', background: 'rgba(59,130,246,0.04)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)', marginBottom: 14 }}>➕ Add New Month</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6, fontWeight: 600 }}>LABEL</label>
              <input
                className="form-control"
                placeholder="e.g. March 2026"
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6, fontWeight: 600 }}>MONTH</label>
                <select
                  className="form-control"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 0.6 }}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 6, fontWeight: 600 }}>YEAR</label>
                <select
                  className="form-control"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)' }}
                >
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>
                GOOGLE SHEET URL
              </label>
              {isFutureMonth(month, year) && (
                <span style={{ fontSize: 10, color: 'var(--accent2)', fontWeight: 800 }}>☁️ RECOMENDED: MODERN CLOUD MODE</span>
              )}
            </div>
            <input
              className="form-control"
              placeholder={isFutureMonth(month, year) ? "No URL needed for future months (Cloud-First)..." : "Required for legacy months (https://docs.google.com/...)"}
              value={input}
              onChange={e => setInput(e.target.value)}
              style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: isFutureMonth(month, year) ? '1px solid var(--accent2)' : '1px solid var(--border)' }}
            />
            {isFutureMonth(month, year) && (
              <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>
                This month is after the cloud transition. You can leave this blank to use the high-performance App-Only mode.
              </p>
            )}
          </div>

          {testMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 600,
              background: testMsg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : testMsg.startsWith('⏳') ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)',
              color: testMsg.startsWith('✅') ? 'var(--accent2)' : testMsg.startsWith('⏳') ? 'var(--accent)' : 'var(--danger)',
              border: `1px solid ${testMsg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : testMsg.startsWith('⏳') ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {testMsg}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={adding || !label}
            style={{
              borderRadius: 10, padding: '12px 24px',
              background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', border: 'none', fontWeight: 700
            }}
          >
            {adding ? '⏳ Connecting...' : '⚡ Add Month'}
          </button>
        </div>
      </div>

      {/* Identity & Security */}
      <div className="card">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h6 style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>🔐 Identity & Security Matrix</h6>
        </div>
        <div style={{ padding: '16px 24px' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
            Current Role: <strong style={{ color: 'var(--accent)' }}>{role?.toUpperCase() || 'STAFF'}</strong>
          </div>
          
          <PasswordChangeSection />

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Environment Isolation</h3>
            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>Testing Mode</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    Isolate test entries from production dashboards.
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const isTest = localStorage.getItem('finance_pro_test_mode') === 'true';
                    localStorage.setItem('finance_pro_test_mode', !isTest);
                    window.location.reload();
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: localStorage.getItem('finance_pro_test_mode') === 'true' ? '#f59e0b' : 'var(--bg2)',
                    color: localStorage.getItem('finance_pro_test_mode') === 'true' ? '#000' : 'var(--text3)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {localStorage.getItem('finance_pro_test_mode') === 'true' ? 'ACTIVE' : 'OFF'}
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text3)', margin: 0 }}>
                <strong>WARNING:</strong> While testing mode is ON, you will ONLY see data marked as test data. Production data will be hidden until you toggle back to OFF.
              </p>
            </div>
          </div>
          
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 20 }}>
            Advanced security protocols are enforced via Supabase Auth (v2).
          </p>
        </div>
      </div>
    </div>
  );
}

function PasswordChangeSection() {
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePwd = async () => {
    if (newPwd.length < 6) return setStatus('❌ Password must be at least 6 characters');
    if (newPwd !== confirmPwd) return setStatus('❌ Passwords do not match');

    setLoading(true);
    setStatus('⏳ Validating security tokens...');
    
    // Using global supabase instance if available, else will need import
    // Note: In finance-pro, we might need to import supabase from lib
    try {
      const { supabase } = await import('../supabase');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setStatus('✅ Credentials updated successfully!');
      setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setStatus('❌ Security violation: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text1)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Credential Authority</h3>
      <div style={{ spaceY: 10 }}>
         <input 
           type="password" 
           className="form-control" 
           placeholder="New Password" 
           value={newPwd} 
           onChange={e => setNewPwd(e.target.value)}
           style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', width: '100%', marginBottom: 10 }}
         />
         <input 
           type="password" 
           className="form-control" 
           placeholder="Confirm New Password" 
           value={confirmPwd} 
           onChange={e => setConfirmPwd(e.target.value)}
           style={{ borderRadius: 8, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', width: '100%', marginBottom: 15 }}
         />
         {status && (
           <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 15, color: status.startsWith('✅') ? 'var(--accent2)' : 'var(--danger)' }}>
             {status}
           </div>
         )}
         <button 
           onClick={handleChangePwd} 
           disabled={loading || !newPwd}
           className="btn btn-sm"
           style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 700, borderRadius: 8, width: '100%', padding: '10px' }}
         >
           {loading ? 'Processing...' : 'Securely Update Credentials'}
         </button>
      </div>
    </div>
  );
}

export default Settings;
