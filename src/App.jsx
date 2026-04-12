import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import "./index.css";

import { useSheetEngine, useYTDEngine } from "./lib/useSheetEngine";
import { 
  getMonthsSynced, 
  getActiveSheetIdSynced, 
  setActiveSheetIdSynced 
} from "./lib/monthRegistry";
import { startSessionKeepAlive } from "./lib/sessionKeepAlive";
import { registerServiceWorker, requestNotificationPermission, detectChanges, sendNotification, showToast, subscribeToPush } from "./lib/notifications";

// Components
import LoginScreen from "./components/LoginScreen";
import Dashboard   from "./components/Dashboard";
import Sales       from "./components/Sales";
import Production  from "./components/Production";
import Expenses    from "./components/Expenses";
import Materials   from "./components/Materials";
import CashFlow    from "./components/CashFlow";
import StockPricing from "./components/StockPricing";
import Attendance   from "./components/Attendance";
import Maintenance  from "./components/Maintenance";
import Settings    from "./components/Settings";
import Management from "./components/Management";
import SyncBar     from "./components/SyncBar";
import AdminManagement from "./components/AdminManagement";
import Security from "./components/Security";
import NotificationBell from "./components/NotificationBell";

const NAV = [
  { id: "dashboard",    label: "Finance Overview",    icon: "◉",  section: "Overview",    minRole: "ENGINEER" },
  { id: "sales",        label: "Revenue & Sales",      icon: "🧾", section: "Operations",  minRole: "ENGINEER" },
  { id: "production",  label: "Production Stats",     icon: "🏭", section: "Operations",  minRole: "ENGINEER" },
  { id: "attendance",  label: "Attendance Sheet",      icon: "📋", section: "Operations",  minRole: "ENGINEER" },
  { id: "expenses",    label: "Expenses Ledger",       icon: "💸", section: "Finance",     minRole: "ADMIN" },
  { id: "maintenance", label: "Maintenance Costs",     icon: "🔧", section: "Finance",     minRole: "ADMIN" },
  { id: "materials",   label: "Stock & Inventory",    icon: "📦", section: "Finance",     minRole: "ADMIN" },
  { id: "cashflow",    label: "Cash Flow",             icon: "💰", section: "Finance",     minRole: "ADMIN" },
  { id: "stock",       label: "Unit Economics",        icon: "⚖️", section: "Finance",     minRole: "ADMIN" },
  { id: "security",    label: "Security Center",       icon: "🛡️", section: "System",      minRole: "ENGINEER" },
  { id: "settings",    label: "Sheet Connections",     icon: "🔗", section: "System",      minRole: "SUPER_USER" },
  { id: "management",  label: "Management Center",     icon: "🛂", section: "System",      minRole: "ADMIN" },
  { id: "admin",       label: "Authorize Log",          icon: "🔑", section: "System",      minRole: "ADMIN" },
];

const ROLE_LEVELS = {
  "SUPER_USER": 3,
  "SUPER_ADMIN": 3,
  "admin": 2,
  "ADMIN": 2,
  "ENGINEER": 1,
  "PENDING": 0
};

export default function App() {
  const [user,     setUser]    = useState(null);
  const [role,     setRole]    = useState("PENDING");
  const [isLoading, setAuthLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [mustReset, setMustReset] = useState(false);
  const [resetPwd, setResetPwd] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isTestMode = localStorage.getItem('finance_pro_test_mode') === 'true';
  const [page,     setPage]    = useState("dashboard");
  const [newUpdates,  setNewUpdates]  = useState([]);

  const [months,        setMonths]        = useState([]);
  const [activeSheetId, setActiveIdState] = useState(null);
  const prevDataRef = useRef(null); // For change detection
  const isCheckingUserRef = useRef(false);

  const memoMonths = React.useMemo(() => months, [JSON.stringify(months)]);

  const switchSheet = (id) => {
    setActiveIdState(id);
    setActiveSheetIdSynced(id, user); // Pass current user to avoid getSession lock
  };

  const onMonthsChange = (updated) => {
    setMonths(updated);
    if (!updated.find(m => m.sheetId === activeSheetId)) {
      const next = updated[0]?.sheetId ?? null;
      switchSheet(next);
    }
  };

  const isYTD = activeSheetId === 'ALL';
  const sheetResult = useSheetEngine(isYTD ? null : activeSheetId, memoMonths);
  const ytdResult   = useYTDEngine(memoMonths);  // always run in background for globalStats (warehouse carryforward)
  
  const { data, loading: sheetLoading, error, lastSyncedAt, refresh } = isYTD ? ytdResult : sheetResult;

  useEffect(() => {
    const checkUser = async (u) => {
      if (isCheckingUserRef.current) return;
      isCheckingUserRef.current = true;

      try {
        if (!u) { setUser(null); setRole("PENDING"); setMustReset(false); return; }
        setUser(u);
        
        const superEmails = [
          "agritech-production@hotmail.com", 
          "ahmed.farid@agritech.com", 
          "ahmedfarid@agritech.com",
          "miarafa@gmail.com",
          "agritechinternationalfactory@gmail.com"
        ];
        
        let detectedRole = "PENDING";
        let profileData = null;

        try {
          const profilePromise = supabase.from("profiles").select("role, force_password_reset").eq("id", u.id).maybeSingle();
          const { data: profile, error: dbErr } = await Promise.race([
            profilePromise,
            new Promise((_, reject) => setTimeout(() => reject('Profile Timeout'), 5000))
          ]);
          
          if (!dbErr) {
            profileData = profile;
            detectedRole = profile?.role || "PENDING";
          }
        } catch (dbErr) {
          console.warn("Profile fetch skipped or failed, relying on bypass list.", dbErr);
        }

        // ABSOLUTE BYPASS: Email list always overrides DB role for safety
        if (superEmails.includes(u.email?.toLowerCase().trim())) {
          console.log("Authority Verified: Super User Bypass Active for", u.email);
          detectedRole = "SUPER_USER";
        }

        setRole(detectedRole);
        
        // SUPER USER IMMUNITY: Super Users cannot be locked out by the force_reset flag
        if (profileData?.force_password_reset && detectedRole !== "SUPER_USER") {
          setMustReset(true);
        }

        const cloudMonths = await getMonthsSynced(u).catch(() => null);
        // Use localStorage for active sheet ID immediately — avoids another Supabase lock acquisition
        const localActive = localStorage.getItem('agritech_active_sheet');
        const firstMonthId = (cloudMonths || [])[0]?.sheetId ?? null;
        setMonths(cloudMonths || []);
        setActiveIdState(localActive || firstMonthId);
        
        // Sync active sheet from cloud in background (non-blocking)
        getActiveSheetIdSynced(u).then(cloudActive => {
          if (cloudActive) setActiveIdState(cloudActive);
        }).catch(() => {});

      } catch (err) {
        console.error("Auth System Error:", err);
      } finally {
        isCheckingUserRef.current = false;
        setAuthLoading(false);
      }
    };

    const timer = setTimeout(() => { if (isLoading) setLoadingTimeout(true); }, 5000);

    // SINGULAR AUTH ENTRY: relying only on state change to avoid lock war
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] State Event:", event);
      checkUser(session?.user);
    });
    
    document.documentElement.setAttribute('translate', 'no');
    document.body.setAttribute('translate', 'no');

    // ── START KEEP-ALIVE + PWA SETUP ──
    startSessionKeepAlive();
    registerServiceWorker().then(reg => {
      // Auto-subscribe if already granted (on reload)
      if (reg && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        subscribeToPush(reg);
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // ── CHANGE DETECTION: fire push notification when data updates ──
  useEffect(() => {
    if (!data) return;
    if (prevDataRef.current) {
      const changes = detectChanges(prevDataRef.current, data);
      if (changes.length > 0) {
        // Persist seen status: filter out changes that the user has already acknowledged on this device
        const seenChanges = JSON.parse(localStorage.getItem('agritech_seen_updates') || '[]');
        const filtered = changes.filter(c => !seenChanges.includes(`${c.title}|${c.body}`));
        
        if (filtered.length > 0) {
          setNewUpdates(prev => {
            const combined = [...prev, ...filtered];
            // Keep unique
            const unique = [];
            const seen = new Set();
            for (const item of combined) {
              const key = `${item.title}|${item.body}`;
              if (!seen.has(key)) {
                unique.push(item);
                seen.add(key);
              }
            }
            return unique;
          });
          
          filtered.forEach(change => {
            sendNotification(change.title, change.body, change.type);
            showToast(change.title, change.body, 'info');
          });
        }
      }
    }
    prevDataRef.current = data;
  }, [data]);

  const handleClearUpdates = () => {
    // Save current updates to seen list in localStorage
    try {
      const seenChanges = JSON.parse(localStorage.getItem('agritech_seen_updates') || '[]');
      const currentKeys = newUpdates.map(c => `${c.title}|${c.body}`);
      const updatedSeen = [...new Set([...seenChanges, ...currentKeys])].slice(-200); // keep last 200
      localStorage.setItem('agritech_seen_updates', JSON.stringify(updatedSeen));
      
      // Also clear the persistent ones in notifications.js storage to be safe
      localStorage.setItem('agritech_notifications', JSON.stringify([]));
      
      setNewUpdates([]);
    } catch (e) {
      console.error("Error clearing updates:", e);
      setNewUpdates([]); // fallback clear
    }
  };

  const isSuper = role === "SUPER_USER" || role === "SUPER_ADMIN";
  const isAdmin = role === "admin" || role === "ADMIN" || isSuper;
  const userLevel = ROLE_LEVELS[role] || 0;
  const sections = [...new Set(NAV.map(n => n.section))];
  const activeMonth = (months || []).find(m => m.sheetId === activeSheetId);

  const globalStats = {
    totalProduced:        ytdResult.data?.summary?.totalProduced     || 0,
    totalSold:            ytdResult.data?.summary?.totalSold         || 0,
    netProfit:            ytdResult.data?.summary?.netProfit         || 0,
    totalRevenue:         ytdResult.data?.summary?.totalRevenue      || 0,
    totalPaid:            ytdResult.data?.summary?.totalPaid         || 0,
    totalOutstanding:     ytdResult.data?.summary?.totalOutstanding  || 0,
    totalCosts:           ytdResult.data?.summary?.totalCosts        || 0,
    operatingCosts:       ytdResult.data?.summary?.operatingCosts    || 0,
    materialCosts:        ytdResult.data?.summary?.materialCosts     || 0,
    availableCash:        ytdResult.data?.summary?.availableCash     || 0,
    // ── Cross-month material aggregates ──
    matTotalReceivedKg:   ytdResult.data?.summary?.matTotalReceivedKg  || 0,
    matTotalUsedKg:       ytdResult.data?.summary?.matTotalUsedKg      || 0,
    matTotalCost:         ytdResult.data?.summary?.matTotalCost        || 0,
    matAvailableKg:       ytdResult.data?.summary?.matAvailableKg      || 0,
    ytdLoaded:            !!ytdResult.data,
    monthCount:           (months || []).length,
  };

  const renderPage = () => {
    // If we have no sheet connected, show settings
    if (!activeSheetId && page !== "settings" && page !== "admin" && page !== "security") {
      return <div className="no-data">Connect a sheet in Settings</div>;
    }

    // Stabilized render switch: Components handle their own inner loading or show an overlay
    // but the main Switch block stays consistent in the DOM.
    const pageKey = `comp-${page}-${activeSheetId || 'none'}`;
    
    // Safety check: if we are switching sheets and have NO data at all, show the global loader
    if (!data && sheetLoading && (page !== "settings" && page !== "admin" && page !== "security")) {
      return (
        <div key="page-sync-loader" style={{ padding: 120, textAlign: 'center', color: 'var(--text3)' }}>
          <div className="spinner" style={{ margin: '0 auto 20px' }} />
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', animation: 'pulse 1.5s infinite' }}>Synchronizing {page} Page...</div>
          <div style={{ fontSize: 10, marginTop: 10, opacity: 0.5 }}>Fetching latest economics from Google Sheets</div>
          <div style={{ marginTop: 30 }}>
            <button 
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 9, opacity: 0.7 }}
            >
              ⚠️ Stuck? Repair Connection
            </button>
          </div>
        </div>
      );
    }

    try {
      switch (page) {
        case "dashboard":    return <Dashboard key={pageKey} data={data} role={role} monthLabel={activeMonth?.label || (isYTD ? "Full Analysis" : "")} onRefresh={refresh} newUpdates={newUpdates} clearUpdates={handleClearUpdates} globalStats={globalStats} isYTD={isYTD} />;
        case "sales":        return <Sales key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} />;
        case "production":   return <Production key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} globalStats={globalStats} />;
        case "expenses":     return <Expenses key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} globalStats={globalStats} />;
        case "maintenance":  return <Maintenance key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} />;
        case "materials":    return <Materials key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} carryForward={data?.carryForward} globalStats={globalStats} />;
        case "cashflow":     return <CashFlow key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} carryForward={data?.carryForward} globalStats={globalStats} />;
        case "stock":        return <StockPricing key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} globalStats={globalStats} />;
        case "attendance":   return <Attendance key={pageKey} data={data} user={user} role={role} isAdmin={isAdmin} isSuper={isSuper} />;
        case "security":     return <Security key={pageKey} user={user} />;
        case "admin":        return <AdminManagement key={pageKey} role={role} userEmail={user.email} />;
        case "settings":     return <Settings key={pageKey} role={role} months={months} activeSheetId={activeSheetId} onSwitch={switchSheet} onMonthsChange={onMonthsChange} />;
        case "management":   return <Management key={pageKey} user={user} role={role} isSuper={isSuper} />;
        default:             return <div key="fallback-empty">Select a page</div>;
      }
    } catch (e) {
      console.error("Render Error:", e);
      return (
        <div className="no-data" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>🛠️</div>
          <h3 style={{ color: 'white', marginBottom: 10 }}>Session Stability Synchronized</h3>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>The system is recalibrating your data stream. This typically happens during high-speed navigation.</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ marginTop: 20 }}>Restore Connection</button>
        </div>
      );
    }
  };

  return (
    <div key="agritech-root-shell" className="app" translate="no">
      {/* ── PHASE 1: BOOTSTRAP LOADING ── */}
      {isLoading && (
        <div key="boot-layer" className="stability-screen" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="spinner-icon" />
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Establishing Security Proxy...</span>
          </div>
          {loadingTimeout && (
            <div className="fade-in-up" style={{ textAlign: 'center' }}>
              <p style={{ color: '#475569', fontSize: 10, marginBottom: 12 }}>Sync protocol taking longer than expected.</p>
              <button 
                onClick={() => { localStorage.clear(); window.location.reload(true); }}
                className="btn btn-sm btn-secondary"
              >
                ⚙️ Repair Connection & Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PHASE 2: AUTHENTICATION ── */}
      {!isLoading && !user && <LoginScreen key="auth-layer" />}

      {/* ── PHASE 3: SECURITY CHALLENGE ── */}
      {!isLoading && user && mustReset && (
        <div key="reset-layer" style={{ position: 'fixed', inset: 0, background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: 'rgba(30,41,59,0.5)', backdropFilter: 'blur(10px)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 24, padding: 40, width: '100%', maxWidth: 420, textAlign: 'center' }}>
             <h2 style={{ color: 'white' }}>Security Protocol Required</h2>
             <input type="password" placeholder="New Password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} style={{ width: '100%', margin: '20px 0', padding: 12 }} />
             <button onClick={() => {/* password reset logic */}} className="btn btn-primary">Initialize Protocol</button>
          </div>
        </div>
      )}

      {/* ── PHASE 4: CLEARANCE PENDING ── */}
      {!isLoading && user && !mustReset && role === "PENDING" && (
        <div key="pending-layer" className="reset-overlay" style={{ zIndex: 9000 }}>
           <div className="reset-card">
              <h2>Clearance Pending</h2>
              <p>{user?.email}</p>
              <button onClick={() => supabase.auth.signOut()}>Disconnect Session</button>
           </div>
        </div>
      )}

      {/* ── PHASE 5: OPERATIONAL ACCESS (THE MAIN APP) ── */}
      {!isLoading && user && !mustReset && role !== "PENDING" && (
        <div key="core-app-shell" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
          <aside className="sidebar">
            <div className="sidebar-logo">AgriTech Pro<span>Finance</span></div>
            <div className="sidebar-scroll">
              {sections.map(section => (
                <div className="sidebar-section" key={section} style={{ marginBottom: 20 }}>
                  <div className="sidebar-label" style={{ opacity: 0.5, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', padding: '10px 20px', letterSpacing: '0.1em' }}>{section}</div>
                  {NAV.filter(n => n.section === section && userLevel >= (ROLE_LEVELS[n.minRole] || 0)).map(n => (
                    <div key={n.id} className={`sidebar-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)} style={{ padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', transition: '0.2s' }}>
                      <span style={{ marginRight: 12, opacity: page === n.id ? 1 : 0.6 }}>{n.icon}</span> {n.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div 
              className="sidebar-footer" 
              onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} 
              style={{ padding: 20, borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'center', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', marginTop: 'auto', zIndex: 10, position: 'relative' }}
            >
              Disconnect Session
            </div>
          </aside>

          <main className="main">
            {isTestMode && (
              <div style={{
                background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                color: 'white',
                padding: '6px 20px',
                fontSize: 10,
                fontWeight: 900,
                textAlign: 'center',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(239,68,68,0.2)'
              }}>
                ⚠️ Testing Mode Active — Data is Isolated from Production
              </div>
            )}
            <div key="sync-bar-container" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {page !== "settings" && page !== "admin" && page !== "security" && (
                <SyncBar months={months} activeSheetId={activeSheetId} onSwitch={switchSheet} lastSyncedAt={lastSyncedAt} availableCash={data?.summary?.availableCash} error={error} onRefresh={refresh} loading={sheetLoading} />
              )}
              <div style={{ marginLeft: 'auto', paddingRight: 12, flexShrink: 0 }}>
                <NotificationBell onPermissionGranted={() => console.log('[App] Push notification permission granted')} />
              </div>
            </div>
            <div key={`page-wrapper-${activeSheetId || 'none'}`} style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Overlay loader instead of tree-replacement */}
              {sheetLoading && !data && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.8)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <div className="spinner" />
                </div>
              )}
              {renderPage()}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
