// ============================================================
// parseSheet.js  — Column-exact parsers for every tab type
// ============================================================

const MONTH_MAP = {
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
  jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};

export function parseDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.toLowerCase() === 'date' || s.toLowerCase() === 'n/a') return null;

  // Remove leading day-of-week  e.g. "Sunday, "
  s = s.replace(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sat|Sun|Mon|Tue|Wed|Thu|Fri),\s*/i, '');
  s = s.replace(/^\w+,\s*/i, ''); // Aggressive catch-all for any "DayName, "

  // 1.5 'Day, Month Date, Year' or 'Month Date, Year'
  // e.g. "March 1, 2026" or " March 1 2026"
  const cleanS = s.trim(); 
  
  // 2. "1-Mar-2026" or "01/03/2026" 
  const fuzzyA = cleanS.match(/(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-/,]+(\d{2,4})/);
  if (fuzzyA) {
    const m = MONTH_MAP[fuzzyA[2].toLowerCase().slice(0, 3)];
    if (m !== undefined) {
      const yr = +fuzzyA[3] < 100 ? 2000 + +fuzzyA[3] : +fuzzyA[3];
      return new Date(yr, m, +fuzzyA[1]);
    }
  }

  const fuzzyB = cleanS.match(/([A-Za-z]{3,})[\s\-/,]+(\d{1,2})[\s\-/,]*(\d{0,4})/);
  if (fuzzyB) {
    const m = MONTH_MAP[fuzzyB[1].toLowerCase().slice(0, 3)];
    if (m !== undefined) {
      const yr = fuzzyB[3] ? (+fuzzyB[3] < 100 ? 2000 + +fuzzyB[3] : +fuzzyB[3]) : 2026;
      return new Date(yr, m, +fuzzyB[2]);
    }
  }

  // 4. Numeric DD/MM or DD/MM/YYYY (day-first format used in the sheet)
  //    e.g. "5/3/2026" = March 5, "31/3/2026" = March 31, "12/3" = March 12
  const numericFull = s.match(/^(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?$/);
  if (numericFull) {
    const day = +numericFull[1];
    const mon = +numericFull[2];
    const yr  = numericFull[3] ? (+numericFull[3] < 100 ? 2000 + +numericFull[3] : +numericFull[3]) : 2026;
    // Use DD/MM interpretation (day first) since source sheets use Egyptian date format
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return new Date(yr, mon - 1, day);
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function toISO(d) {
  if (!d || isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Universal date formatter to prevent "Invalid Date" in UI.
 * Takes a YYYY-MM-DD string or a Date object.
 */
export function formatDisplayDate(raw) {
  if (!raw) return '—';
  
  let d;
  if (raw instanceof Date) {
    d = raw;
  } else {
    // Try YYYY-MM-DD first
    const iso = String(raw).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    } else {
      d = new Date(raw);
    }
  }

  if (!d || isNaN(d.getTime())) {
    // If it's still invalid, return the raw string if it looks like a date, else dash
    return (typeof raw === 'string' && raw.length > 3) ? raw : '—';
  }

  // Format as "Wed, Apr 1"
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Standard Shift Definitions:
 * Shift 1: 08:00 AM - 04:00 PM (Morning) 
 * Shift 2: 04:00 PM - 12:00 AM (Afternoon)
 * Shift 3: 12:00 AM - 08:00 AM (Night)
 */
export function getShiftLabel(shiftNum) {
  const s = String(shiftNum || '');
  if (s === '1') return 'Morning (Shift 1)';
  if (s === '2') return 'Afternoon (Shift 2)';
  if (s === '3') return 'Night (Shift 3)';
  return s ? `Shift ${s}` : '';
}

function num(v) {
  if (v == null) return 0;
  return parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
}

function cell(v) {
  return String(v ?? '').trim();
}

/**
 * Extract a specific cell by its Google Sheets coordinate (e.g., J72)
 * @param {string[][]} rows 
 * @param {string} coord e.g. "J72"
 */
export function extractCell(rows, coord) {
  if (!rows || rows.length === 0) return 0;
  const match = coord.match(/([A-Z]+)(\d+)/);
  if (!match) return 0;
  
  const colStr = match[1];
  const rowIdx = parseInt(match[2]) - 1;
  
  // Convert column string (A, B, ..., Z, AA, ...) to 0-indexed number
  let colIdx = 0;
  for (let i = 0; i < colStr.length; i++) {
    colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
  }
  colIdx -= 1; // 0-indexed

  if (rows[rowIdx] && rows[rowIdx][colIdx]) {
    return num(rows[rowIdx][colIdx]);
  }
  return 0;
}

function isTotal(row) {
  const txt = row.slice(0, 3).map(c => cell(c).toLowerCase()).join(' ');
  return txt.includes('total') || txt.includes('grand') || txt.includes('summary');
}

// ============================================================
// ✅ GeneralReport — scan for labelled summary rows
// ============================================================
export function parseGeneralReport(rows) {
  let revenue = 0, totalCosts = 0, cashBalance = 0, openingBalance = 0, totalProducedOverride = 0;
  let manualLedgerSum = 0;
  let detectedMonth = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const searchString = row.map(c => cell(c)).join(' ').toLowerCase();
    
    // Find ANY number in the row to use as a candidate value
    const rowNumbers = row.map(c => num(c)).filter(n => n !== 0);
    const primaryVal = rowNumbers[rowNumbers.length - 1] || 0;

    if (searchString.includes('total revenue') || searchString.includes('total sales')) {
      revenue = primaryVal;
    }
    
    // Manual Ledger Items (The components of 116,950)
    const ledgerKeywords = ['material', 'master batch', 'rent', 'electricity', 'daily expenses', 'salaries', 'labour march'];
    if (ledgerKeywords.some(k => searchString.includes(k))) {
      // Avoid summing the 'start' reminder into the costs
      if (!searchString.includes('reminder') && !searchString.includes('money')) {
        // Search the row for a number that looks like a cost
        const costVal = rowNumbers.find(n => n > 10) || primaryVal;
        manualLedgerSum += costVal;
      }
    }

    // Capture specific production override (e.g. 2.73)
    if (searchString.includes('achived total production')) {
      // Specifically look for a small number like 2.73 in the row
      const prodVal = rowNumbers.find(n => n > 0 && n < 100) || primaryVal;
      if (prodVal > 0) totalProducedOverride = prodVal;
    }

    // Capture official manual reconciliation total from 'Cash Avilable' cell
    if (searchString.includes('cash avilable') || searchString.includes('cash available')) {
      // Find the specific manual total in cells J/K/L (indexes 9/10/11)
      const val = rowNumbers.find(n => n !== 0 && Math.abs(n) > 100) || primaryVal;
      if (val !== 0) cashBalance = val;
    }

    // Capture manual 'Sub total' from the monthly expenses table
    if (searchString.includes('sub total') && i > 30) {
      const val = rowNumbers.find(n => n > 10000) || primaryVal;
      if (val > 10000) manualLedgerSum = val;
    }
    
    // Capture opening reminder (136,000)
    // The CSV has 'Tharwat Money Reminder' in one cell and '136,000' in the one below/nearby
    if (searchString.includes('tharwat money reminder')) {
      // Look for 136,000 in the current row OR the next row
      const val = rowNumbers.find(n => n >= 100000) || primaryVal;
      if (val > 100000) {
        openingBalance = val;
      }
    }

    // Detect month from header or cells
    if (searchString.includes('march')) detectedMonth = 3;
    if (searchString.includes('april')) detectedMonth = 4;
  }
  
  // Final totalCosts logic: If we found the manual 'Monthly Expenses' subtotal, use it!
  const finalOfficialCosts = (manualLedgerSum > 10000) ? manualLedgerSum : totalCosts;
  const officialNetProfit = revenue - finalOfficialCosts;

  return { 
    revenue, 
    totalCosts: finalOfficialCosts, 
    cashBalance, 
    openingBalance, 
    totalProducedOverride, 
    netProfit: officialNetProfit,
    month: detectedMonth,
    roboticTotalCosts: totalCosts // Keep for audit
  };
}

// ============================================================
// ✅ DailyProduction — 3 rows per day (one per shift/worker)
// Actual CSV structure (0-indexed):
//   [0] = Day No (only on first of 3 rows, blank for rows 2 & 3)
//   [1] = Full date string, e.g. "Sunday, March 1, 2026" (only on first row)
//   [2] = Shift number (1 / 2 / 3)
//   [3] = Worker name (Gomaa / Ibrahim / Mahmoud)
//   [4] = Production quantity (bags produced this shift)
//   [5] = Product type / extra info (e.g. "8L")
//   [6] = Daily total (only on first row, aggregated)
//   [7] = Note
// ============================================================
export function parseDailyProduction(rows) {
  const logs = [];
  let currentDateStr = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    // Col [1] carries the full date string only on the DAY header row
    const rawDate = cell(row[1]);
    if (rawDate && rawDate.length > 5 && !rawDate.match(/^\d+$/)) {
      currentDateStr = rawDate.trim();
    }
    if (!currentDateStr) continue;

    const shiftNo  = cell(row[2]);     // "1" / "2" / "3"
    const worker   = cell(row[3]);     // "Gomaa" / "Ibrahim" / "Mahmoud"
    const qty      = num(row[4]);      // bags produced this shift

    const d = parseDate(currentDateStr);

    // Skip header rows and rows without a worker
    if (!worker || worker.length < 2) continue;
    const wLow = worker.toLowerCase();
    if (wLow === 'name' || wLow === 'worker' || wLow === 'type') continue;

    if (!d) continue;

    logs.push({
      date:   toISO(d),
      shift:  shiftNo,
      worker: worker.trim(),
      qty,              // bags produced by this worker on this shift-day
      total:  qty,      // kept for backward compatibility
    });
  }

  return logs.filter(l => l.date).sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// ✅ EndProductInventory — aggregate summary of produced/sold/remaining bags
// Sheet columns (0-indexed):
//   [0]=No [1]=Date [2]=Type("6 L") [3]=Color [4]=Produced [5]=? [6]=CumulProduced [7]=Sold [8]=Remaining [9]=Note
// Summary row at end: No='', Type='6L', Produced='', CumulProduced=total, Sold=total, Remaining=net
// ============================================================
export function parseEndProductInventory(rows) {
  // Strategy: collect daily rows first, then check for a summary/total row at the bottom.
  // We return one aggregate record per product type.
  const byType = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;

    const rawType = cell(row[2]);
    if (!rawType) continue;

    // Normalize: '6 L' -> '6L', '8 L' -> '8L'
    const typeNorm = rawType.replace(/\s+/g, '').toUpperCase();  // '6L' | '8L'
    if (!typeNorm.match(/^\dL$/)) continue;

    const d    = parseDate(cell(row[1]));
    const prod = num(row[4]);  // bags produced this day
    const sold = num(row[7]);  // bags sold this day
    const rem  = num(row[8]);  // running remaining

    if (!byType[typeNorm]) {
      byType[typeNorm] = { item: typeNorm, totalProduced: 0, totalSold: 0, lastRemaining: 0, dates: [] };
    }

    byType[typeNorm].totalProduced  += prod;
    byType[typeNorm].totalSold      += sold;
    byType[typeNorm].lastRemaining   = rem;   // keep updating; last non-empty wins
    if (d) byType[typeNorm].dates.push(toISO(d));
  }

  // Convert to array with fields expected by the UI
  return Object.values(byType).map(t => ({
    item:     t.item,
    date:     t.dates[0] || null,
    qty:      t.totalProduced,   // total bags produced ("Produced" column)
    sold:     t.totalSold,       // total bags sold
    remaining: t.lastRemaining,  // net remaining bags
    total:    0,                  // no EGP value in this sheet
  }));
}

// ============================================================
// ✅ Customer Sales tab (Wageh, Tharwat, etc.)
// Cols: B=date C=type D=color E=qty6L F=qty8L G=price H=totalPrice I=paid J=remain
// ============================================================
export function parseSalesTab(rows, customerName) {
  const sales = [];

  // Find the header row to detect column layout
  const headerIdx = rows.findIndex(r => {
    const txt = r.join(' ').toLowerCase();
    return txt.includes('total price') || txt.includes('paid');
  });

  for (let i = Math.max(1, headerIdx + 1); i < rows.length; i++) {
    const row = rows[i];
    if (!row || isTotal(row)) continue;

    // Try to get a date from col1 or col0
    const d = parseDate(cell(row[1])) || parseDate(cell(row[0]));
    if (!d) continue;

    const totalPrice  = num(row[7]);
    const paid        = num(row[8]);
    const remain      = num(row[9]);  // sheet's own remain/balance column
    const paymentType = cell(row[10]) || cell(row[9 + 1]) || '';  // Due Date or payment method if present

    // Skip rows with nothing financial
    if (totalPrice <= 0 && paid <= 0 && remain === 0) continue;
    // Skip rows that are pure zero placeholders (no product type, no qty, no amount)
    if (totalPrice <= 0 && paid <= 0) continue;

    // Calculate the actual remaining balance for this transaction row
    // The sheet tracks running balance in 'remain'; negative means overpaid (credit)
    // For a sales row: remain = totalPrice - paid (running)
    // For a payment-only row (paid but no totalPrice): remain is negative (reducing prior balance)
    const effectiveRemain = totalPrice > 0
      ? Math.max(0, totalPrice - paid)
      : 0;  // payment-only rows reduce prior balance, not counted as new outstanding

    sales.push({
      date:        toISO(d),
      customer:    customerName,
      description: cell(row[2]) + (cell(row[3]) ? ' – ' + cell(row[3]) : ''),
      quantity:    num(row[5]) || num(row[4]),
      totalPrice,
      paid,
      remain:      effectiveRemain,
      paymentType: paymentType || '',
    });
  }
  return sales;
}

// ============================================================
// ✅ DailyExpenses — header at row 1, data from row 2
// Skip rows where label includes "total"
// ============================================================
export function parseDailyExpenses(rows) {
  const expenses = [];
  let dataStart  = 1;

  // Find header row automatically
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const joined = rows[i].join(' ').toLowerCase();
    if (joined.includes('date') || joined.includes('type') || joined.includes('category')) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (isTotal(row)) continue;

    const d = parseDate(cell(row[1])) || parseDate(cell(row[0]));
    if (!d) continue;

    // Columns: 0=No, 1=Date, 2=Type/Category, 3=Price, 4=Qty, 5=Total, 6=Note
    const amount = num(row[5]) || num(row[3]); // prefer Total, fallback Price
    if (amount <= 0) continue;

    expenses.push({
      date:        toISO(d),
      category:    cell(row[2]) || 'Other',
      description: cell(row[6]) || cell(row[3]) || '',  // Note column (Arabic description)
      quantity:    num(row[4]),
      amount,
    });
  }
  return expenses;
}

// ============================================================
// ✅ ElectricityAndRent — same structure as DailyExpenses
// ============================================================
export function parseElectricityRent(rows) {
  return parseDailyExpenses(rows).map(e => ({
    ...e,
    category: e.category || 'Utilities',
  }));
}

// ============================================================
// ✅ MaterialInventory  — two-row-per-day format
//
// PURCHASE rows (type = 'Material' | 'Master Batch'):
//   [1]=date  [2]=type  [4]=qty_received_kg  [5]=price/kg  [7]=amount  [9]=payment
//
// USAGE rows (type = '' or sub-row below purchase):
//   [11]=qty_used_kg_today  (how much raw material was consumed in production)
//
// Summary row 69 has totals but we compute from the rows to support filtering.
// ============================================================
export function parseMaterialInventory(rows) {
  // We collect TWO things:
  // 1. Purchase batches — rows where col[2] contains 'Material' or 'Master Batch'
  // 2. Daily usage     — col[11] on any row that has a value there

  let totalReceivedKg = 0;   // sum of purchased kg
  let totalUsedKg     = 0;   // sum of col[11] (kg consumed in production)
  let totalCost       = 0;   // sum of purchase amounts
  const purchaseItems = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const type = cell(row[2]).toLowerCase();

    // Skip header / label rows
    if (type.includes('type') || type.includes('total') || type.includes('grand')) continue;

    // ── Purchase row: has a recognised type AND a quantity ──
    const isMaterial    = type.includes('material');
    const isMasterBatch = type.includes('master') || type.includes('batch');

    if ((isMaterial || isMasterBatch) && num(row[4]) > 0) {
      const qty    = num(row[4]);
      const price  = num(row[5]);
      const deliv  = num(row[6]);
      const amount = num(row[7]) || num(row[8]) || (qty * price + deliv);
      const d      = parseDate(cell(row[1]));

      totalReceivedKg += qty;
      totalCost       += amount;

      purchaseItems.push({
        item:       isMaterial ? 'Material (Plastic)' : 'Master Batch',
        date:       d ? toISO(d) : cell(row[1]),
        qtyKg:      qty,
        pricePerKg: price,
        delivery:   deliv,
        total:      amount,
        subTotal:   amount,
        used:       0,   // filled below
        productionKg: 0, // filled below
      });
    }

    // ── Usage row: col[11] has kg used in production (non-zero) ──
    const usedToday = num(row[11]);
    if (usedToday > 0) {
      totalUsedKg += usedToday;
    }
  }

  // Build a single aggregated summary row for each material type for the UI tables,
  // plus keep individual purchase items for the ledger.
  const summary = [
    {
      item:        'Material (Plastic)',
      date:        null,
      qtyKg:       totalReceivedKg,
      pricePerKg:  totalReceivedKg > 0 ? totalCost / totalReceivedKg : 0,
      delivery:    0,
      total:       totalCost,
      subTotal:    totalCost,
      used:        totalUsedKg,
      productionKg: totalUsedKg,
    }
  ];

  // Return individual purchase items (for the ledger), each with aggregate used=totalUsedKg
  // so MaterialStock can display the warehouse remainder correctly.
  // Also attach _summary flag so the UI can use the right view.
  if (purchaseItems.length === 0) return summary;

  // Attach totals to each item (so engine calcs like materialCosts stay accurate)
  purchaseItems.forEach(p => { p.used = 0; }); // per-batch: used not allocated here

  // Add a synthetic "totals" row that the Materials.jsx component uses for KPI cards
  return [
    ...purchaseItems,
    {
      _isTotalRow:  true,
      item:         '_TOTALS_',
      qtyKg:        totalReceivedKg,
      used:         totalUsedKg,
      total:        totalCost,
      subTotal:     totalCost,
      productionKg: totalUsedKg,
    }
  ];
}

// ============================================================
// ✅ AttendanceSheet — 3 rows per day (one per shift)
// Real structure (from Google Sheet):
// Col A=No, B=Date (full date string, on first shift row only),
// Col C=Shift (1/2/3), D=WorkerName (Gomaa/Ibrahim/Mahmoud),
// Col E=ClockIn, F=ClockOut, G=TotalHours, H=Late, I=OT, J=Note
// Date appears on the FIRST shift row; rows 2&3 have blank B
// ============================================================
export function parseAttendance(rows) {
  const records = [];
  let currentDateStr = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    const colA = cell(row[0]); // No
    const colB = cell(row[1]); // Date (e.g. "Sunday, March 1, 2026")
    const colC = cell(row[2]); // Shift (1, 2, 3)
    const colD = cell(row[3]); // Worker name (Gomaa, Ibrahim, Mahmoud)
    const colE = cell(row[4]); // Clock In
    const colF = cell(row[5]); // Clock Out

    // Update current date when a new date string appears in col B
    // Relaxed criteria: at least 3 chars AND looks like more than just a row index
    if (colB && colB.length >= 3 && !colB.match(/^\d+$/)) {
      currentDateStr = colB.trim();
    } else if (colB && colB.match(/\d+[\/\-]\d+/)) {
      // Handles numeric dates like 11/4 or 11/04
      currentDateStr = colB.trim();
    }

    if (!currentDateStr) continue;

    // Skip header rows and rows with empty/invalid workers
    const dLower = colD.toLowerCase();
    if (dLower === 'type' || dLower === 'name' || dLower === 'worker') continue;
    if (!colD || colD === '') continue;

    const d = parseDate(currentDateStr);
    if (!d) continue;

    const checkIn  = colE;
    const checkOut = colF;
    const present  = checkIn && checkIn !== '0' && checkIn !== '' && checkIn.length > 3;

    records.push({
      date:        toISO(d),
      worker:      colD.trim(),
      shift:       colC,
      checkIn:     present ? checkIn  : null,
      checkOut:    present ? checkOut : null,
      present,
      hoursWorked: present ? calcHours(checkIn, checkOut) : 0,
    });
  }
  return records.filter(r => r.date);
}

/**
 * Scan the Attendance sheet for the "Team Performance" table and extract
 * per-employee Salary and Payment Status.
 * Strategy: Look for the sentinel row, then parse rows below it.
 * Fallback: Scan entire sheet for any row containing a known worker name + salary number + paid/not paid.
 */
/**
 * Parse the Team Performance table from the AttendanceSheet.
 *
 * The actual Google Sheet has a side-by-side layout:
 * - Attendance log in columns A–J (0–9)
 * - Team Performance table in columns M–P (12–15)
 *
 * Column layout of the right-side table (0-indexed):
 *   [12] = Label  ("Team Performance", "Name", "Main Salary", "Addons", "Total Salary",
 *                   "In Advance", "Deduction", "Outstanding Salary",
 *                   "In Advance Total", "Deduction Total", "Total Outstanding", "Total Paid")
 *   [13] = Gomaa's value
 *   [14] = Ibrahim's value
 *   [15] = Mahmoud's value
 *   [16] = Payment status ("Paid" / "Unpaid" / "Not Paid") on summary rows
 *
 * Worker order is positional, not name-based — the worker names themselves
 * appear in the left attendance section, not in the right performance columns.
 */
export function parseTeamPerformance(rows) {
  const performance = {};
  if (!rows || rows.length === 0) return performance;

  // The workers in column order (col13, col14, col15)
  // We confirm by checking for "Team Performance" header in col12.
  const WORKER_ORDER = ['gomaa', 'ibrahim', 'mahmoud'];

  // ── Strategy 1: Parse the right-side column-based table ──
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const col12 = cell(rows[i][12] ?? '').toLowerCase();
    if (col12.includes('team performance') || col12.includes('employee performance')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx !== -1) {
    // Initialize per-worker accumulators
    const workerData = {
      gomaa:   { mainSalary: 0, addons: 0, totalSalary: 0, inAdvance: 0, deduction: 0, outstanding: 0, status: null },
      ibrahim: { mainSalary: 0, addons: 0, totalSalary: 0, inAdvance: 0, deduction: 0, outstanding: 0, status: null },
      mahmoud: { mainSalary: 0, addons: 0, totalSalary: 0, inAdvance: 0, deduction: 0, outstanding: 0, status: null },
    };

    for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 20, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      const label = cell(row[12] ?? '').toLowerCase();
      if (!label) continue;

      const v13 = num(row[13]); // Gomaa
      const v14 = num(row[14]); // Ibrahim
      const v15 = num(row[15]); // Mahmoud
      const statusVal = cell(row[16] ?? '').toLowerCase(); // Overall status on this row

      if (label.includes('main salary')) {
        workerData.gomaa.mainSalary   = v13;
        workerData.ibrahim.mainSalary = v14;
        workerData.mahmoud.mainSalary = v15;
      } else if (label.includes('addon') || label.includes('bonus')) {
        workerData.gomaa.addons   = v13;
        workerData.ibrahim.addons = v14;
        workerData.mahmoud.addons = v15;
      } else if (label.includes('total salary')) {
        workerData.gomaa.totalSalary   = v13;
        workerData.ibrahim.totalSalary = v14;
        workerData.mahmoud.totalSalary = v15;
      } else if (label.includes('in advance') && !label.includes('total')) {
        workerData.gomaa.inAdvance   = v13;
        workerData.ibrahim.inAdvance = v14;
        workerData.mahmoud.inAdvance = v15;
      } else if (label.includes('deduction') && !label.includes('total')) {
        workerData.gomaa.deduction   = v13;
        workerData.ibrahim.deduction = v14;
        workerData.mahmoud.deduction = v15;
      } else if (label.includes('outstanding salary') || label.includes('net salary')) {
        workerData.gomaa.outstanding   = v13;
        workerData.ibrahim.outstanding = v14;
        workerData.mahmoud.outstanding = v15;
      } else if (label.includes('total outstanding')) {
        // The master payment status — ALWAYS overrides any previous status
        // because this is the net financial outcome for the whole month
        if (statusVal) {
          const s = (statusVal === 'paid') ? 'Paid' : 'Not Paid';
          WORKER_ORDER.forEach(w => { workerData[w].status = s; });
        }
      } else if (label.includes('total paid')) {
        // Block is already handled; skip
      } else if ((label.includes('in advance total') || label.includes('deduction total'))) {
        // Status column 16: only assign if status not yet set (will be overridden by 'total outstanding' later)
        if (statusVal) {
          const s = (statusVal === 'paid') ? 'Paid' : 'Not Paid';
          WORKER_ORDER.forEach(w => { if (!workerData[w].status) workerData[w].status = s; });
        }
      }
    }

    // Convert accumulated data to the performance map
    WORKER_ORDER.forEach((w) => {
      const d = workerData[w];
      // Prefer "Outstanding Salary" (net = total - deductions) as the salary display value
      // Fall back to Total Salary if outstanding is 0
      const displaySalary = d.outstanding > 0 ? d.outstanding : (d.totalSalary || d.mainSalary);
      if (displaySalary > 0 || d.status) {
        performance[w] = {
          salary:      displaySalary,
          mainSalary:  d.mainSalary,
          totalSalary: d.totalSalary,
          inAdvance:   d.inAdvance,
          deduction:   d.deduction,
          status:      d.status || 'Not Paid',
        };
      }
    });
    // ── Pass 2: Collect individual In Advance / Deduction line items (dated entries with reasons) ──
    // Structure below the summary table:
    //   Row: [In Advance] (section header)
    //   Row: [Date] [...cols...] [Note]
    //   Rows: [date] [gomaa_amt] [ibrahim_amt] [mahmoud_amt] [reason/note]
    //   Row: [Deduction] (section header)
    //   Row: [Date] [...cols...] [Reason]
    //   Rows: [date] [gomaa_amt] [ibrahim_amt] [mahmoud_amt] [reason]
    const inAdvanceItems = { gomaa: [], ibrahim: [], mahmoud: [] };
    const deductionItems = { gomaa: [], ibrahim: [], mahmoud: [] };

    let section = null;  // 'advance' | 'deduction' | null
    let inDataRows = false;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const col12 = cell(row[12] ?? '').toLowerCase();

      // Detect section headers
      if (col12 === 'in advance') { section = 'advance'; inDataRows = false; continue; }
      if (col12 === 'deduction')  { section = 'deduction'; inDataRows = false; continue; }
      if (!section) continue;

      // Detect the "Date" sub-header that precedes data rows
      if (col12 === 'date') { inDataRows = true; continue; }
      if (!inDataRows) continue;

      // Blank label + no values = end of this section's data
      const dateStr = cell(row[12] ?? '');
      if (!dateStr) continue;

      // Try to parse the date  (format like "5/3/2026" or "3/3/2026")
      const parsedDate = parseDate(dateStr);
      const displayDate = parsedDate ? toISO(parsedDate) : dateStr;

      // Col 13=Gomaa, 14=Ibrahim, 15=Mahmoud, 16=Reason/Note
      const amt13 = num(row[13]);
      const amt14 = num(row[14]);
      const amt15 = num(row[15]);
      const reason = cell(row[16] ?? '') || cell(row[17] ?? '');

      const arr = section === 'advance' ? inAdvanceItems : deductionItems;

      if (amt13 > 0) arr.gomaa.push({ date: displayDate, amount: amt13, reason });
      if (amt14 > 0) arr.ibrahim.push({ date: displayDate, amount: amt14, reason });
      if (amt15 > 0) arr.mahmoud.push({ date: displayDate, amount: amt15, reason });
    }

    // Attach line items to each worker's performance record
    WORKER_ORDER.forEach((w) => {
      if (performance[w]) {
        performance[w].inAdvanceItems = inAdvanceItems[w];
        performance[w].deductionItems = deductionItems[w];
      }
    });
  }

  // ── Strategy 2: Classic row-scan fallback (for differently structured sheets) ──
  if (Object.keys(performance).length === 0) {
    const KNOWN_WORKERS = ['gomaa', 'ibrahim', 'mahmoud'];
    const STATUS_VALS   = ['paid', 'not paid', 'unpaid'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rowText = row.map(c => cell(c).toLowerCase());
      const workerMatch = KNOWN_WORKERS.find(w => rowText.some(t => t.includes(w)));
      if (!workerMatch) continue;

      const salary = (() => {
        for (const c of row) {
          const v = num(c);
          if (v > 500 && v < 1000000) return v;
        }
        return 0;
      })();

      const statusCell = row.find(c => {
        const s = cell(c).toLowerCase();
        return STATUS_VALS.some(sv => s === sv);
      });
      const status = statusCell ? (cell(statusCell).toLowerCase() === 'paid' ? 'Paid' : 'Not Paid') : null;

      if (salary > 0 || status) {
        if (!performance[workerMatch]) {
          performance[workerMatch] = { salary: salary || 0, status: status || 'Not Paid' };
        }
      }
    }
  }

  return performance;
}

function calcHours(inStr, outStr) {
  if (!inStr || !outStr) return 0;
  const parse = (s) => {
    if (typeof s !== 'string') return 0;
    const m = s.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
    if (!m) return 0;
    let h = +m[1], min = +m[2];
    if (m[4]?.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[4]?.toUpperCase() === 'AM' && h === 12) h = 0;
    return h + min / 60;
  };
  
  let valIn  = parse(inStr);
  let valOut = parse(outStr);
  
  // If checkout is 12:00 AM (0) or earlier than checkin, assume it crossed midnight
  let diff = valOut - valIn;
  if (diff <= 0 && outStr.length > 1) {
    diff += 24;
  }
  
  return Math.max(0, diff);
}
