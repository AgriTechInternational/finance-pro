import React, { useState } from 'react';

export default function QuickActions({ onNavigate }) {
  const [open, setOpen] = useState(false);

  const actions = [
    { id: 'sales',      label: 'New Sale',      icon: '🧾', color: 'var(--accent2)' },
    { id: 'expenses',   label: 'Add Expense',   icon: '💸', color: 'var(--danger)' },
    { id: 'production', label: 'Log Output',    icon: '🏭', color: 'var(--accent)' },
    { id: 'attendance', label: 'Clock In',      icon: '📋', color: 'var(--accent3)' },
  ];

  return (
    <div className="quick-actions-wrap">
      <div className={`actions-menu ${open ? 'open' : ''}`}>
        {actions.map((action, i) => (
          <div 
            key={action.id} 
            className="action-item"
            style={{ 
              '--delay': `${i * 0.05}s`, 
              '--color': action.color,
              transitionDelay: open ? `${i * 0.05}s` : '0s'
            }}
            onClick={() => { onNavigate(action.id); setOpen(false); }}
          >
            <span className="action-label">{action.label}</span>
            <div className="action-icon">{action.icon}</div>
          </div>
        ))}
      </div>
      
      <button 
        className={`main-fab ${open ? 'active' : ''}`} 
        onClick={() => setOpen(!open)}
        title="Quick Access"
      >
        <div className="fab-icon">{open ? '✕' : '✦'}</div>
      </button>

      <style>{`
        .quick-actions-wrap {
          position: fixed;
          bottom: 32px;
          right: 32px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 16px;
        }

        .main-fab {
          width: 56px;
          height: 56px;
          border-radius: 28px;
          background: var(--accent);
          border: none;
          color: white;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 8px 32px rgba(59, 130, 246, 0.4);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .main-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 12px 48px rgba(59, 130, 246, 0.5);
        }

        .main-fab.active {
          background: var(--surface-opaque);
          transform: rotate(90deg);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }

        .actions-menu {
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .actions-menu.open {
          pointer-events: auto;
          opacity: 1;
          transform: translateY(0);
        }

        .action-item {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          opacity: 0;
          transform: translateX(20px);
        }

        .open .action-item {
          opacity: 1;
          transform: translateX(0);
        }

        .action-icon {
          width: 44px;
          height: 44px;
          border-radius: 22px;
          background: var(--surface-opaque);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: var(--card-shadow);
          transition: all 0.2s ease;
        }

        .action-label {
          background: var(--surface-opaque);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text);
          border: 1px solid var(--border);
          box-shadow: var(--card-shadow);
          white-space: nowrap;
          opacity: 0;
          transform: translateX(10px);
          transition: all 0.2s ease;
        }

        .action-item:hover .action-label {
          opacity: 1;
          transform: translateX(0);
          border-color: var(--color);
          color: var(--color);
        }

        .action-item:hover .action-icon {
          background: var(--color);
          transform: scale(1.1);
          border-color: white;
        }
      `}</style>
    </div>
  );
}
