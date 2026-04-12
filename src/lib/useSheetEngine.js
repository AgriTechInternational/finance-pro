// ============================================================
// useSheetEngine.js — Live Google Sheets data hook
// Auto-refreshes every 30 seconds, fetches all tabs in parallel
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  parseGeneralReport, parseDailyProduction, parseDailyExpenses,
  parseElectricityRent, parseMaterialInventory, parseSalesTab, 
  parseAttendance, parseEndProductInventory,
  extractCell, parseTeamPerformance
} from './parseSheet';
import { supabase, tables } from '../supabase';

const REFRESH_MS = 30000;
const STORAGE_KEY = 'agritech_month_registry';

// ── GLOBAL CACHE: Persistent memory across month switches ──
const SHEET_CACHE = new Map(); // sheetId -> { summary, timestamp, ... }

// Customer tabs to discover by name
const CUSTOMER_TABS = ['Wageh', 'Nour', 'Sales', 'Sales Nour', 'Tharwat', 'Elwady', 'El Wady', 'Haitham', 'Adel', 'Emad', 'Nagy', 'Mohamed'];
const UTILITY_TABS  = ['ElectricityAndRent', 'Electricity and Rent', 'Electricity', 'Rent'];
const ATTEND_TABS   = ['AttendanceSheet', 'Attendance'];

// ── CSV fetcher ──────────────────────────────────────────────
async function fetchCSVByGid(sheetId, gid, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trim().startsWith('<!') || text.length < 20) return null;
    return parseCSVText(text);
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function fetchCSVByName(sheetId, tabName, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith('<!') || text.includes('<html') || text.includes('Error') || text.length < 10) return null;
    return parseCSVText(text);
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

function parseCSVText(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let i = 0, inQ = false, cur = '';
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
      i++;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows.filter(r => r.some(c => c !== ''));
}

async function tryTabNames(sheetId, names) {
  for (const name of names) {
    const rows = await fetchCSVByName(sheetId, name);
    if (rows && rows.length > 1) return rows;
  }
  return null;
}

// ── NATIVE MATHEMATICAL ENGINE ──
async function analyzeSingleSheetNatively(id, trueOpeningBalance, prevAvgCostPerKg = 0, prevMatStockKg = 0, prevUnsoldBags = 0, month = null, year = 2026) {
  // ── SUPABASE FETCH (NEW) ──
  const fetchSupabase = async () => {
    if (!month || !year) return { expenses: [], production: [], sales: [], materials: [], attendance: [] };
    const isTestMode = localStorage.getItem('finance_pro_test_mode') === 'true';
    
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const [dbExp, dbProd, dbSales, dbMat, dbAttend] = await Promise.all([
      supabase.from(tables.EXPENSES).select('*').gte('date', start).lte('date', end).is('deleted_at', null).eq('is_dev_test', isTestMode),
      supabase.from('production').select('*').gte('date', start).lte('date', end).is('deleted_at', null).eq('is_dev_test', isTestMode),
      supabase.from(tables.TRANSACTIONS).select('*').gte('date', start).lte('date', end).is('deleted_at', null).eq('is_dev_test', isTestMode),
      supabase.from(tables.INVENTORY).select('*').gte('date', start).lte('date', end).is('deleted_at', null).eq('is_dev_test', isTestMode),
      supabase.from('attendance').select('*').gte('date', start).lte('date', end).is('deleted_at', null).eq('is_dev_test', isTestMode)
    ]);

    return {
      expenses: dbExp.data || [],
      production: (dbProd.data || []).map(p => ({ ...p, total: p.bags_produced, qty: p.bags_produced, worker: p.worker_name || 'N/A' })),
      sales: (dbSales.data || []).map(s => ({ ...s, customer: s.partner_name, totalPrice: s.amount, paid: s.type === 'Credit' ? s.amount : 0, quantity: 0 })), // Simplified for now
      materials: (dbMat.data || []).map(m => ({ ...m, qtyKg: m.type === 'IN' ? m.quantity : 0, used: m.type === 'OUT' ? m.quantity : 0, total: 0 })),
      attendance: (dbAttend.data || []).map(a => ({ ...a, present: a.status === 'PRESENT' }))
    };
  };

  // Discover core tabs by name to avoid GID-mismatch between months
  const [genRows, prodRowsRaw, expRowsRaw, matRows, endProdRows, dbData] = await Promise.all([
    tryTabNames(id, ['General Report', 'GeneralReport']),
    tryTabNames(id, ['DailyProduction', 'Daily Production', 'Production']),
    tryTabNames(id, ['DailyExpenses', 'Daily Expenses', 'Expenses']),
    tryTabNames(id, ['MaterialInventory', 'Material Inventory']),
    tryTabNames(id, ['EndProductInventory', 'End Product Inventory']),
    fetchSupabase()
  ]);


  // Validate production tab: must have "Daily Production" header or worker names in early rows
  const hasProductionHeaders = (rows) => {
    if (!rows || rows.length < 2) return false;
    const top4 = rows.slice(0, 5).map(r => r.join(' ').toLowerCase()).join(' ');
    return top4.includes('daily production') || top4.includes('gomaa') || top4.includes('ibrahim');
  };
  const prodRows = hasProductionHeaders(prodRowsRaw) ? prodRowsRaw : null;

  // Validate: ensure the expenses tab has proper ledger headers (Daily Expense No / Date / Type)
  const hasLedgerHeaders = (rows) => {
    if (!rows || rows.length < 2) return false;
    const header = rows[0].map(c => String(c).toLowerCase()).join(' ');
    return header.includes('date') && (header.includes('type') || header.includes('category') || header.includes('no'));
  };
  const expRows = hasLedgerHeaders(expRowsRaw) ? expRowsRaw : null;


  // Validate: reject any tab that looks like the General Report
  const isNotGeneralReport = (rows) => {
    if (!rows || rows.length < 1) return false;
    const firstRow = rows[0].join(' ').toLowerCase();
    return !firstRow.includes('general report') && !firstRow.includes('general_report');
  };

  const validMatRows     = (matRows     && isNotGeneralReport(matRows))     ? matRows     : null;
  const validEndProdRows = (endProdRows && isNotGeneralReport(endProdRows)) ? endProdRows : null;

  if (!genRows && !prodRows && !expRows) {
    const fallbackGen = await fetchCSVByGid(id, '2126333699');
    if (!fallbackGen) throw new Error('Could not read spreadsheet. Verify tab names.');
    return analyzeSingleSheetNativelyWithGIDs(id, trueOpeningBalance, fallbackGen);
  }

  const [utilRows, attendRows, maintRows] = await Promise.all([
    tryTabNames(id, UTILITY_TABS),
    tryTabNames(id, ATTEND_TABS),
    tryTabNames(id, ['Maintenance', 'Maintenance Costs', 'Maint', 'Maintenance Cost']),
  ]);

  const customerResults = await Promise.all(
    CUSTOMER_TABS.map(name =>
      fetchCSVByName(id, name).then(rows => (rows && rows.length > 1 ? { name, rows } : null))
    )
  );

  const generalSummary = genRows  ? parseGeneralReport(genRows)    : {};
  const production     = [
    ...(prodRows ? parseDailyProduction(prodRows)  : []),
    ...dbData.production
  ];

  const expenses = [
    ...(expRows   ? parseDailyExpenses(expRows)     : []),
    ...(utilRows  ? parseElectricityRent(utilRows)  : []),
    ...dbData.expenses
  ].sort((a, b) => a.date.localeCompare(b.date));

  const materials     = [
    ...(validMatRows     ? parseMaterialInventory(validMatRows)    : []),
    ...dbData.materials
  ];
  const finishedGoods = validEndProdRows ? parseEndProductInventory(validEndProdRows) : [];

  const attendance   = [
    ...(attendRows ? parseAttendance(attendRows)     : []),
    ...dbData.attendance
  ];

  const shiftProductionMap = {};
  production.forEach(p => {
    const key = `${p.date}|${(p.worker || '').toLowerCase()}`;
    shiftProductionMap[key] = (shiftProductionMap[key] || 0) + (p.qty || 0);
  });

  const maintenanceFromExp = expenses.filter(e => {
    const cat = (e.category || '').toLowerCase();
    return cat === 'maintenance' || cat.includes('maint');
  });

  const isLedgerTab = (rows) => {
    if (!rows || rows.length < 2) return false;
    const headerCheck = rows.slice(0, 4).map(r => r.join(' ').toLowerCase()).join(' ');
    return headerCheck.includes('date') && (headerCheck.includes('type') || headerCheck.includes('category'));
  };
  const validMaintTab = (maintRows && maintRows.length > 1 && isLedgerTab(maintRows)) ? parseDailyExpenses(maintRows) : [];

  const seen = new Set();
  const maintenance = [...validMaintTab, ...maintenanceFromExp].filter(e => {
    const key = `${e.date}-${e.category}-${e.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const allSales = [
    ...customerResults
          .filter(Boolean)
          .flatMap(({ name, rows }) => parseSalesTab(rows, name)),
    ...dbData.sales
  ].sort((a, b) => a.date.localeCompare(b.date));

  const totalRevenue     = allSales.reduce((s, r) => s + r.totalPrice, 0);
  const totalPaid        = allSales.reduce((s, r) => s + r.paid,       0);
  const totalOutstanding = Math.max(0, totalRevenue - totalPaid);

  const materialCosts    = materials
    .filter(m => !m._isTotalRow)
    .reduce((s, m) => s + (m.total || m.subTotal || 0), 0) || 0;
  const operatingCosts   = expenses.reduce((s, e) => {
    const cat = (e.category || '').toLowerCase();
    if (cat.includes('material') || cat.includes('stock')) return s;
    return s + e.amount;
  }, 0);

  const logsProducedBags  = production.reduce((s, p) => s + p.total, 0);
  const totalProducedBags = (generalSummary.totalProducedOverride > 0)
    ? (generalSummary.totalProducedOverride * 50)
    : (logsProducedBags || (finishedGoods.reduce((s, g) => s + (g.qty || 0), 0)) || 136.5);
  const totalProducedTons = totalProducedBags / 50;
  const totalProducedKg   = totalProducedTons * 1000;
  
  const totalSold = allSales.reduce((s, r) => s + (r.quantity || 0), 0);

  // ── INVENTORY-ADJUSTED P&L ──
  const matTotalsRow     = materials.find(m => m._isTotalRow) || {};
  const matLedger        = materials.filter(m => !m._isTotalRow && (m.qtyKg || 0) > 0);
  const totalReceivedKg  = matTotalsRow.qtyKg || matLedger.reduce((s, m) => s + (m.qtyKg || 0), 0);
  const manualUsedKg     = matTotalsRow.used  || 0;
  
  // THEORETICAL CONSUMPTION FALLBACK
  // If manual logs are empty but we have produced goods, estimate the raw material used.
  // Finished weight is roughly 1:1 with raw; we use 1.02 multiplier for conservative waste/moisture.
  const theoreticalUsedKg = totalProducedKg * 1.02;
  const totalUsedKg       = (manualUsedKg > 0) ? manualUsedKg : theoreticalUsedKg;

  // Cross-month warehouse stock: use cell J72 as fallback baseline only for the very first month
  const rawMaterialStock = validMatRows ? extractCell(validMatRows, 'J72') : 0;
  
  // ROLLING INVENTORY CALCULATION
  const matStartingStock = prevMatStockKg > 0 ? prevMatStockKg : rawMaterialStock; 
  const rawMatAvailKg    = Math.max(0, matStartingStock + totalReceivedKg - totalUsedKg);

  const avgMatCostPerKg  = totalReceivedKg > 0 ? materialCosts / totalReceivedKg : prevAvgCostPerKg;

  const matCostConsumed  = totalUsedKg > 0
    ? totalUsedKg * avgMatCostPerKg
    : (totalReceivedKg > 0 ? materialCosts * 0.5 : 0);

  const matCostPerBag    = (totalProducedBags > 0 && matCostConsumed > 0)
    ? matCostConsumed / totalProducedBags
    : 0;

  const materialCOGS     = totalSold > 0 ? Math.round(totalSold * matCostPerBag) : 0;

  const rawMatAssetValue      = Math.round(rawMatAvailKg * avgMatCostPerKg);
  
  // ROLLING FINISHED GOODS CALCULATION
  const startingUnsoldBags    = prevUnsoldBags || 0;
  const unsoldBags            = Math.max(0, startingUnsoldBags + totalProducedBags - totalSold);
  
  const finishedGoodsAssetVal = Math.round(unsoldBags * matCostPerBag);
  const totalInventoryAsset   = rawMatAssetValue + finishedGoodsAssetVal;

  const adjustedNetProfit = Math.round(totalRevenue - operatingCosts - materialCOGS);

  const finalTotalCosts  = operatingCosts + materialCosts;
  const cashNetProfit    = totalRevenue - finalTotalCosts;

  const paidMaterialCosts = materials.reduce((s, m) => {
    const note = (m.note || '').toLowerCase();
    if (note.includes('not paid') || note.includes('unpaid')) return s;
    return s + (m.total || m.subTotal || 0);
  }, 0);
  const paidOperatingCosts = expenses.reduce((s, e) => {
    const cat = (e.category || '').toLowerCase();
    if (cat.includes('material') || cat.includes('stock')) return s;
    const note = (e.note || '').toLowerCase();
    const status = (e.status || '').toLowerCase();
    if (note.includes('not paid') || status.includes('unpaid') || status.includes('not paid')) return s;
    return s + e.amount;
  }, 0);
  const totalPaidCosts = paidMaterialCosts + paidOperatingCosts;

  const availableCash = (generalSummary.cashBalance !== undefined && Math.abs(generalSummary.cashBalance) < 100000)
    ? generalSummary.cashBalance
    : (trueOpeningBalance + totalPaid - totalPaidCosts);
  const targetMonth = generalSummary.month;

  const filterByMonth = (list) => {
    if (!targetMonth) return list;
    return list.filter(item => {
      if (!item.date) return true;
      // Timezone-safe month extraction: use regex on the YYYY-MM-DD string
      // or append a fixed time to force consistent boundary interpretation.
      const parts = item.date.split('-');
      if (parts.length < 2) return true;
      const m = parseInt(parts[1], 10);
      return m === targetMonth;
    });
  };

  const conversionRatio   = totalUsedKg > 0 ? totalProducedKg / totalUsedKg : 0;
  const teamPerformance   = attendRows ? parseTeamPerformance(attendRows) : {};

  return {
    summary: {
      openingBalance:    trueOpeningBalance,
      totalRevenue,      totalPaid,       totalOutstanding,
      netProfit:         adjustedNetProfit,
      cashNetProfit,
      materialCOGS,
      operatingCosts,
      materialCosts,
      totalCosts:        operatingCosts + materialCOGS,
      rawMatAssetValue,
      finishedGoodsAssetVal,
      totalInventoryAsset,
      rawMatAvailKg,
      matReceivedThisMonth: totalReceivedKg, // Track this specifically for UI
      unsoldBags,
      matCostPerBag,
      avgMatCostPerKg,
      availableCash,
      totalPaidCosts,
      actualCashSpent: finalTotalCosts,
      totalProduced:     totalProducedTons,
      totalProducedBags,
      totalProducedKg,
      totalSold,
      rawMaterialStock: matStartingStock,
      totalUsedKg,
      conversionRatio,
    },
    sales:        filterByMonth(allSales),
    expenses:     filterByMonth(expenses),
    production:   filterByMonth(production),
    materials:    filterByMonth(materials),
    finishedGoods: filterByMonth(finishedGoods),
    attendance:   filterByMonth(attendance),
    maintenance:  filterByMonth(maintenance),
    teamPerformance,
    shiftProductionMap
  };
}

// ── FALLBACK ENGINE (GID-BASED) ──
async function analyzeSingleSheetNativelyWithGIDs(id, trueOpeningBalance, genRows) {
  // Original hardcoded GIDs for March 2026
  const [prodRows, expRows, matRows, attendRows] = await Promise.all([
    fetchCSVByGid(id, '1657966952'), // Daily Production
    fetchCSVByGid(id, '429672051'),  // Daily Expenses
    fetchCSVByGid(id, '1592750379'), // Material Inventory
    fetchCSVByGid(id, '1270275817')  // Attendance
  ]);

  const generalSummary = genRows  ? parseGeneralReport(genRows)    : {};
  const production     = prodRows ? parseDailyProduction(prodRows)  : [];
  const expenses       = expRows  ? parseDailyExpenses(expRows)      : [];
  const materials      = matRows  ? parseMaterialInventory(matRows) : [];
  const attendance     = attendRows ? parseAttendance(attendRows)     : [];

  // Minimal construction for fallback
  const materialCosts    = materials.filter(m => !m._isTotalRow).reduce((s, m) => s + (m.total || 0), 0);
  const operatingCosts   = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return {
    summary: { 
      openingBalance: trueOpeningBalance,
      totalRevenue: 0, totalPaid: 0, totalOutstanding: 0, 
      totalCosts: (operatingCosts + materialCosts),
      operatingCosts, materialCosts, materialCOGS: materialCosts, // Fallback: equate COGS to purchases
      availableCash: trueOpeningBalance,
      netProfit: 0, totalProduced: 1, totalSold: 0
    },
    sales: [], expenses, production, materials, finishedGoods: [], attendance, maintenance: []
  };
}

// ── REACT HOOK FOR DASHBOARD ──
export function useSheetEngine(sheetId, months = []) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
    lastSyncedAt: null
  });

  const { data, loading, error, lastSyncedAt } = state;

  const sheetIdRef   = useRef(sheetId);
  sheetIdRef.current = sheetId;

  const fetchingRef   = useRef(null);   // tracks which sheetId is currently being fetched
  const fetchStartRef = useRef(0);      // timestamp when lock was acquired (for timeout)
  const abortRef      = useRef(null);   // AbortController — cancelled on sheet switch

  const load = useCallback(async () => {
    const activeId = sheetIdRef.current;
    if (!activeId) {
      setState(s => ({ ...s, data: null, loading: false, error: null }));
      return;
    }

    // Force-release stale lock (> 25s) so a crashed fetch never blocks forever
    const lockAge = Date.now() - fetchStartRef.current;
    if (fetchingRef.current === activeId && lockAge < 25000) return;

    // Cancel any in-flight fetch from a previous call
    if (abortRef.current) { try { abortRef.current.abort(); } catch(_) {} }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetchingRef.current = activeId;
    fetchStartRef.current = Date.now();

    try {
      setState(s => ({ ...s, error: null, loading: !s.data }));

      const sortedMonths = [...months].sort((a,b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
      const targetIdx = sortedMonths.findIndex(m => m.sheetId === activeId);

      if (targetIdx === -1) {
        // Fallback: search for month in the registry to get correct month/year indices
        const target = months.find(m => m.sheetId === activeId);
        const finalResult = await analyzeSingleSheetNatively(activeId, 0, 0, 0, 0, target?.month, target?.year);
        if (sheetIdRef.current === activeId && !ctrl.signal.aborted) {
          SHEET_CACHE.set(activeId, finalResult);
          setState({ data: finalResult, loading: false, error: null, lastSyncedAt: new Date() });
        }
      } else {
        let rollingCash = 0;
        let rollingAvgCostPerKg = 0;
        let rollingMatStock = 0;
        let rollingUnsoldBags = 0;
        let finalResult = null;

        for (let i = 0; i <= targetIdx; i++) {
          if (ctrl.signal.aborted || sheetIdRef.current !== activeId) break;
          const m = sortedMonths[i];
          const cached = SHEET_CACHE.get(m.sheetId);

          if (i < targetIdx && cached) {
            rollingCash = cached.summary.availableCash;
            if (cached.summary.avgMatCostPerKg > 0) rollingAvgCostPerKg = cached.summary.avgMatCostPerKg;
            rollingMatStock = cached.summary.rawMatAvailKg;
            rollingUnsoldBags = cached.summary.unsoldBags;
            continue;
          }

          let baseOpening = rollingCash;
          if (i === 0) {
            try {
              const rawGenRows = await fetchCSVByGid(m.sheetId, '2126333699');
              if (rawGenRows) {
                const parsedGen = parseGeneralReport(rawGenRows);
                baseOpening += (parsedGen.openingBalance || 0);
              }
            } catch(e) {}
          }
          finalResult = await analyzeSingleSheetNatively(m.sheetId, baseOpening, rollingAvgCostPerKg, rollingMatStock, rollingUnsoldBags, m.month, m.year);
          if (ctrl.signal.aborted || sheetIdRef.current !== activeId) break;
          SHEET_CACHE.set(m.sheetId, finalResult);
          
          rollingCash = finalResult.summary.availableCash;
          if (finalResult.summary.avgMatCostPerKg > 0) rollingAvgCostPerKg = finalResult.summary.avgMatCostPerKg;
          rollingMatStock = finalResult.summary.rawMatAvailKg;
          rollingUnsoldBags = finalResult.summary.unsoldBags;
        }
        if (sheetIdRef.current === activeId && finalResult && !ctrl.signal.aborted) {
          setState({ data: finalResult, loading: false, error: null, lastSyncedAt: new Date() });
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // expected — sheet was switched
      console.error("[useSheetEngine] Load Error:", err);
      setState(s => ({ ...s, error: err.message, loading: false }));
    } finally {
      if (fetchingRef.current === activeId) fetchingRef.current = null;
    }
  }, [months]);

  useEffect(() => {
    // Cancel any in-flight fetch when sheetId changes
    if (abortRef.current) { try { abortRef.current.abort(); } catch(_) {} }
    fetchingRef.current = null; // force-release lock on sheet switch

    // INSTANT SWITCH: If we have this month in cache, yield it immediately
    const cached = SHEET_CACHE.get(sheetId);
    if (cached) {
      setState(s => ({ ...s, data: cached, loading: false }));
    } else {
      if (!data) setState(s => ({ ...s, loading: true }));
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(interval);
      if (abortRef.current) { try { abortRef.current.abort(); } catch(_) {} }
    };
  }, [sheetId]); // deliberately NOT including load — avoid re-subscribing on every month change

  return { data, loading, error, lastSyncedAt, refresh: load };
}

const YTD_CACHE = { data: null, timestamp: 0 };

// ── NEW YTD AGGREGATOR HOOK ──
export function useYTDEngine(months) {
  const [state, setState] = useState({
    data: YTD_CACHE.data,
    loading: !YTD_CACHE.data,
    error: null,
    lastSyncedAt: YTD_CACHE.timestamp ? new Date(YTD_CACHE.timestamp) : null
  });

  // Guard against null state during hot reloads or edge cases
  const { data, loading, error, lastSyncedAt } = state || { data: null, loading: true };

  const load = useCallback(async () => {
    if (!months || months.length === 0) {
      setState(s => ({ ...s, data: null, loading: false })); return;
    }

    try {
      // Don't set loading true if we already have some cached data to show
      if (!YTD_CACHE.data) setState(s => ({ ...s, loading: true }));
      setState(s => ({ ...s, error: null }));

      const sortedMonths = [...months].sort((a,b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
      
      let rollingCash = 0;
      let agg = {
        totalRevenue: 0, totalPaid: 0, totalOutstanding: 0,
        totalCosts: 0, operatingCosts: 0, materialCosts: 0, materialCOGS: 0,
        netProfit: 0, totalProduced: 0, totalProducedBags: 0, totalSold: 0,
        rawMaterialStock: 0, conversionRatio: 0
      };
      let latestTeamPerformance = {};

      // Lists to aggregate
      let allSales     = [];
      let expenses     = [];
      let production   = [];
      let materials    = [];      // purchase batches only (no _TOTALS_ rows)
      let finishedGoods = [];
      let attendance   = [];
      let maintenance  = [];
      let matTotalReceivedKg = 0;
      let matTotalUsedKg     = 0;
      let matTotalCost       = 0;


      let rollingAvgCostPerKg = 0;
      let rollingMatStock = 0;
      let rollingUnsoldBags = 0;

      for (let i = 0; i < sortedMonths.length; i++) {
        const m = sortedMonths[i];
        let baseOpening = rollingCash;
        if (i === 0) {
          try {
            const rawGenRows = await fetchCSVByGid(m.sheetId, '2126333699');
            if(rawGenRows) {
              const parsedGen = parseGeneralReport(rawGenRows);
              baseOpening += (parsedGen.openingBalance || 0);
            }
          } catch(e) { }
        }
        const res = await analyzeSingleSheetNatively(m.sheetId, baseOpening, rollingAvgCostPerKg, rollingMatStock, rollingUnsoldBags, m.month, m.year);
        
        agg.totalRevenue += res.summary.totalRevenue;
        agg.totalPaid += res.summary.totalPaid;
        agg.totalOutstanding += res.summary.totalOutstanding;
        agg.totalCosts += res.summary.totalCosts;
        agg.operatingCosts += res.summary.operatingCosts;
        agg.materialCosts += res.summary.materialCosts;
        agg.materialCOGS += (res.summary.materialCOGS || 0);
        agg.netProfit += res.summary.netProfit;
        agg.totalProduced += res.summary.totalProduced;
        agg.totalProducedBags += res.summary.totalProducedBags;
        agg.totalSold += res.summary.totalSold;
        
        // Final values in the chain
        agg.rawMaterialStock = res.summary.rawMatAvailKg;
        agg.unsoldBags = res.summary.unsoldBags;
        
        agg.conversionRatio  = res.summary.conversionRatio  || agg.conversionRatio;
        latestTeamPerformance = Object.keys(res.teamPerformance || {}).length > 0
          ? res.teamPerformance
          : latestTeamPerformance;
        
        // Append data lists — strip _TOTALS_ rows before merging materials
        const monthPurchases = (res.materials || []).filter(m => !m._isTotalRow);
        const monthTotals    = (res.materials || []).find(m => m._isTotalRow) || {};
        matTotalReceivedKg += monthTotals.qtyKg || monthPurchases.reduce((s,m)=>s+(m.qtyKg||0),0);
        matTotalUsedKg     += monthTotals.used  || 0;
        matTotalCost       += monthTotals.total || monthPurchases.reduce((s,m)=>s+(m.total||0),0);

        allSales      = [...allSales,     ...(res.sales        || [])];
        expenses      = [...expenses,     ...(res.expenses      || [])];
        production    = [...production,   ...(res.production    || [])];
        materials     = [...materials,    ...monthPurchases];
        finishedGoods = [...finishedGoods, ...(res.finishedGoods || [])];
        attendance    = [...attendance,   ...(res.attendance    || [])];
        maintenance   = [...maintenance,  ...(res.maintenance   || [])];

        rollingCash = res.summary.availableCash;
        if (res.summary.avgMatCostPerKg > 0) rollingAvgCostPerKg = res.summary.avgMatCostPerKg;
        rollingMatStock = res.summary.rawMatAvailKg;
        rollingUnsoldBags = res.summary.unsoldBags;
      }

      // Sort by date where possible
      const sortByDate = (a, b) => (a.date || '').localeCompare(b.date || '');
      allSales.sort(sortByDate);
      expenses.sort(sortByDate);
      production.sort(sortByDate);
      maintenance.sort(sortByDate);
      // Re-attach a single combined _TOTALS_ row so Materials.jsx can read aggregates correctly
      if (matTotalReceivedKg > 0 || matTotalCost > 0) {
        materials.push({
          _isTotalRow:  true,
          item:         '_TOTALS_',
          qtyKg:        matTotalReceivedKg,
          used:         matTotalUsedKg,
          total:        matTotalCost,
          subTotal:     matTotalCost,
          productionKg: matTotalUsedKg,
        });
      }
      // Re-aggregate finishedGoods by item type across months (e.g. three "6L" months → one row)
      const fgByType = {};
      finishedGoods.forEach(g => {
        const key = g.item || 'Unknown';
        if (!fgByType[key]) fgByType[key] = { item: key, qty: 0, sold: 0, remaining: 0, date: g.date };
        fgByType[key].qty  += (g.qty  || 0);
        fgByType[key].sold += (g.sold || 0);
        if ((g.remaining || 0) > 0) fgByType[key].remaining = g.remaining;
      });
      // Compute remaining = qty - sold if remaining is still 0
      Object.values(fgByType).forEach(g => {
        if (g.remaining === 0 && g.qty > 0) g.remaining = Math.max(0, g.qty - g.sold);
      });
      const aggregatedFinishedGoods = Object.values(fgByType);

      const finalData = {
        summary: {
          ...agg,
          openingBalance:       0,
          availableCash:        rollingCash,
          // ── Cross-month material aggregates (for YTD banner in Materials.jsx) ──
          matTotalReceivedKg,
          matTotalUsedKg,
          matTotalCost,
          matAvailableKg: Math.max(0, matTotalReceivedKg - matTotalUsedKg),
        },
        sales: allSales,
        expenses,
        production,
        materials,
        finishedGoods: aggregatedFinishedGoods,
        attendance,
        maintenance,
        teamPerformance: latestTeamPerformance
      };

      YTD_CACHE.data = finalData;
      YTD_CACHE.timestamp = Date.now();

      setState({ 
        data: finalData, 
        loading: false, 
        error: null, 
        lastSyncedAt: new Date(YTD_CACHE.timestamp) 
      });
    } catch (err) {
      console.error("[useYTDEngine] Load Error:", err);
      setState(s => ({ ...s, error: err.message, loading: false }));
    }
  }, [JSON.stringify(months)]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, lastSyncedAt, refresh: load };
}
