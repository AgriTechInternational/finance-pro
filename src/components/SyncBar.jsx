import React, { useState, useEffect } from 'react';

function SyncBar({ months, activeSheetId, onSwitch, lastSyncedAt, availableCash, error, onRefresh, loading }) {
  const [secAgo, setSecAgo] = useState(null);

  useEffect(() => {
    if (!lastSyncedAt || !(lastSyncedAt instanceof Date)) return;
    const tick = () => setSecAgo(Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastSyncedAt]);

  const syncLabel = lastSyncedAt
    ? secAgo < 5 ? 'Just now' : `${secAgo}s ago`
    : 'Not synced yet';

  return (
    <div key={`sync-bar-${activeSheetId}`} className={`sync-bar-wrap ${error ? 'error' : ''}`} translate="no">

      {/* ── Row 1: status dot + update label + cash + refresh ── */}
      <div className="sync-bar-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <div
            className={`sync-dot ${error ? 'sync-err' : 'sync-live'}`}
            style={{
              opacity: loading ? 1 : 0.6,
              animation: loading ? 'pulse 0.8s infinite' : 'none',
              background: loading ? 'var(--accent)' : (error ? 'var(--danger)' : 'var(--accent2)'),
            }}
          />
          <span style={{ whiteSpace: 'nowrap', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            {error
              ? <span style={{ color: 'var(--danger)' }}>⚠ Sheet error</span>
              : (
                <>
                  {loading && <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} />}
                  <span>{loading ? 'Synchronizing...' : `Updated ${syncLabel}`}</span>
                </>
              )
            }
          </span>
        </div>

        {/* Cash + Refresh — always visible on right side of row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {availableCash !== undefined && (
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
              padding: '3px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent2)', opacity: 0.8 }}>CASH</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>
                {Number(availableCash).toLocaleString()} <span style={{ fontSize: 9, opacity: 0.6 }}>EGP</span>
              </span>
            </div>
          )}
          {error && (
            <button
              className="btn btn-sm"
              style={{ padding: '4px 10px', fontSize: 10, background: 'var(--danger)', color: 'white', border: 'none', borderRadius: 8 }}
              onClick={onRefresh}
            >
              ↻ Retry
            </button>
          )}
          <button
            className="btn btn-sm btn-secondary"
            style={{ padding: '4px 10px', fontSize: 10, borderRadius: 8 }}
            onClick={onRefresh}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Row 2: month tabs — full width, horizontally scrollable ── */}
      <div className="sync-bar-months">
        {/* YTD Button */}
        <button
          onClick={() => onSwitch('ALL')}
          className="btn btn-sm"
          style={{
            padding: '4px 12px',
            fontSize: 10,
            fontWeight: activeSheetId === 'ALL' ? 900 : 700,
            background: activeSheetId === 'ALL'
              ? 'linear-gradient(135deg,#f59e0b,#ef4444)'
              : 'rgba(245,158,11,0.1)',
            border: activeSheetId === 'ALL' ? 'none' : '1px solid rgba(245,158,11,0.2)',
            color: activeSheetId === 'ALL' ? 'white' : '#f59e0b',
            borderRadius: 20,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0,
            boxShadow: activeSheetId === 'ALL' ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
          }}
        >
          [ ALL MONTHS ]
        </button>

        {months.length > 0 && months.map(m => (
          <button
            key={`${m.year}-${m.month}-${m.sheetId}`}
            onClick={() => onSwitch(m.sheetId)}
            className="btn btn-sm"
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: m.sheetId === activeSheetId ? 800 : 500,
              background: m.sheetId === activeSheetId
                ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)'
                : 'var(--bg3)',
              border: m.sheetId === activeSheetId ? 'none' : '1px solid var(--border)',
              color: m.sheetId === activeSheetId ? 'white' : 'var(--text2)',
              borderRadius: 20,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SyncBar;
