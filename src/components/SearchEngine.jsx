import React, { useState, useMemo, useEffect, useRef } from 'react';

export default function SearchEngine({ data, onNavigate }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef(null);

  // Global shortcut handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Handle Ctrl+K or Cmd+K (Mac) case-insensitively
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
        setIsExpanded(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const results = useMemo(() => {
    if (!query || query.length < 2 || !data) return [];

    const q = query.toLowerCase();
    const matches = [];

    // Search Sales
    if (data.sales) {
      data.sales.forEach(s => {
        if (
          (s.customer && s.customer.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
        ) {
          matches.push({ 
            type: 'Sale', 
            icon: '🧾',
            title: s.customer || 'Unnamed Customer', 
            subtitle: `${(s.totalPrice || 0).toLocaleString()} EGP • ${s.date || 'No Date'}`, 
            item: s 
          });
        }
      });
    }

    // Search Expenses
    if (data.expenses) {
      data.expenses.forEach(e => {
        if (
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q))
        ) {
          matches.push({ 
            type: 'Expense', 
            icon: '💸',
            title: e.description || 'Unnamed Expense', 
            subtitle: `${(e.amount || 0).toLocaleString()} EGP • ${e.date || 'No Date'} (${e.category || 'General'})`, 
            item: e 
          });
        }
      });
    }

    // Search Production
    if (data.production) {
      data.production.forEach(p => {
        if (
          (p.worker && p.worker.toLowerCase().includes(q)) ||
          (p.note && p.note.toLowerCase().includes(q))
        ) {
          matches.push({ 
            type: 'Production', 
            icon: '🏭',
            title: p.worker || 'Unnamed Worker', 
            subtitle: `${p.total || p.qty || 0} bags • ${p.date || 'No Date'}`, 
            item: p 
          });
        }
      });
    }
    
    // Search Materials
    if (data.materials) {
      data.materials.forEach(m => {
        if (
          (m.item && m.item.toLowerCase().includes(q)) ||
          (m.note && m.note.toLowerCase().includes(q))
        ) {
            matches.push({ 
              type: 'Material', 
              icon: '📦',
              title: m.item || 'Unnamed Material', 
              subtitle: `${(m.quantity || m.qtyKg || 0).toLocaleString()} units • ${m.date || 'No Date'}`, 
              item: m 
            });
        }
      })
    }

    // Search Finished Goods
    if (data.finishedGoods) {
      data.finishedGoods.forEach(g => {
        if (
          (g.item && g.item.toLowerCase().includes(q)) ||
          (g.product && g.product.toLowerCase().includes(q))
        ) {
          matches.push({ 
            type: 'Inventory', 
            icon: '🏢',
            title: g.item || g.product || 'Finished Product', 
            subtitle: `${g.qty || g.total || 0} bags • ${g.date || 'Current Stock'}`, 
            item: g 
          });
        }
      });
    }

    // Search Attendance
    if (data.attendance) {
        data.attendance.forEach(a => {
            const workerName = a.worker || a.worker_name || '';
            if (workerName.toLowerCase().includes(q)) {
                matches.push({ 
                  type: 'Attendance', 
                  icon: '📋',
                  title: workerName || 'Unnamed Worker', 
                  subtitle: `${a.status || 'PRESENT'} • ${a.date || 'No Date'}`, 
                  item: a 
                });
            }
        })
    }

    return matches.slice(0, 8); // Top 8 results for clarity
  }, [query, data]);

  return (
    <div className={`search-engine-inner ${isExpanded ? 'expanded' : ''}`} style={{ 
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      width: isExpanded ? '100%' : '40px'
    }}>
      <div className="search-input-container" style={{ 
        position: 'relative', 
        width: '100%',
        display: 'flex',
        alignItems: 'center'
      }}>
        <button 
          onClick={() => {
            setIsExpanded(!isExpanded);
            if (!isExpanded) setTimeout(() => inputRef.current?.focus(), 100);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '8px',
            fontSize: 18,
            display: isExpanded && window.innerWidth > 768 ? 'none' : 'block',
            position: isExpanded ? 'absolute' : 'static',
            left: isExpanded ? 8 : 0,
            zIndex: 10
          }}
        >
          {isExpanded ? '🔍' : '🔍'}
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder="Search items, workers..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => { setIsOpen(true); setIsExpanded(true); }}
          onBlur={() => { if (!query) setIsExpanded(false); }}
          className="search-input-field"
          style={{
            width: isExpanded ? '100%' : '0',
            opacity: isExpanded ? 1 : 0,
            padding: isExpanded ? '8px 40px 8px 36px' : '0',
            background: 'rgba(255,255,255,0.05)',
            border: isExpanded ? '1px solid rgba(59, 130, 246, 0.4)' : 'none',
            borderRadius: '10px',
            fontSize: '13px',
            color: 'white',
            outline: 'none',
            transition: 'all 0.2s',
            pointerEvents: isExpanded ? 'auto' : 'none'
          }}
        />

        {isExpanded && (
          <button 
            onClick={() => { setQuery(''); setIsExpanded(false); setIsOpen(false); }}
            style={{
              position: 'absolute',
              right: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <>
          <div 
            className="search-results-backdrop" 
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }} 
            onClick={() => setIsOpen(false)} 
          />
          <div 
            className="search-results-modal" 
            style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid var(--border-glow)',
                borderRadius: '16px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                zIndex: 1001,
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between' }}>
                <span>Search Results</span>
                <span>{results.length} Matches</span>
            </div>
            
            <div className="search-results-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
              {results.length > 0 ? results.map((r, i) => (
                <div 
                  key={i} 
                  className="search-result-item"
                  style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.2s'
                  }}
                  onClick={() => {
                    const pageMap = {
                      'Sale': 'sales',
                      'Expense': 'expenses',
                      'Production': 'production',
                      'Material': 'materials',
                      'Inventory': 'materials',
                      'Attendance': 'attendance'
                    };
                    if (onNavigate && pageMap[r.type]) {
                      onNavigate(pageMap[r.type]);
                      setIsOpen(false);
                      setQuery('');
                      setIsExpanded(false);
                    }
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {r.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                        <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', textTransform: 'uppercase' }}>{r.type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--mono)' }}>{r.subtitle}</div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>🕵️‍♂️</div>
                    <div style={{ fontSize: 13 }}>No matches found for "{query}"</div>
                </div>
              )}
            </div>
            
            <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border)', fontSize: 9, color: 'var(--text3)', textAlign: 'center' }}>
                Press <span style={{ color: 'white' }}>ESC</span> to close
            </div>
          </div>
        </>
      )}
    </div>
  );
}
