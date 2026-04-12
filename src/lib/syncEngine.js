import { supabase, tables } from '../supabase';

/**
 * Syncs unsynced data from Supabase to Google Sheets via the Apps Script Web App.
 * @param {string} syncUrl - The Google Apps Script Web App URL.
 * @param {Array} months - The month registry (to find sheetIds by date).
 */
export async function syncAllToSheets(syncUrl, months) {
  if (!syncUrl) throw new Error("Google Sync URL not configured in Settings.");

  const results = {
    sales: 0,
    expenses: 0,
    production: 0,
    inventory: 0,
    attendance: 0,
    errors: []
  };

  // 1. Fetch all unsynced rows across all tables
  try {
    const [sales, expenses, production, inventory, attendance] = await Promise.all([
      supabase.from(tables.TRANSACTIONS).select('*').eq('is_synced', false),
      supabase.from(tables.EXPENSES).select('*').eq('is_synced', false),
      supabase.from('production').select('*').eq('is_synced', false),
      supabase.from(tables.INVENTORY).select('*').eq('is_synced', false),
      supabase.from('attendance').select('*').eq('is_synced', false)
    ]);

    // 2. Process each category
    await processSync(syncUrl, months, 'sales', sales.data, mapSalesRow, tables.TRANSACTIONS, results);
    await processSync(syncUrl, months, 'expenses', expenses.data, mapExpenseRow, tables.EXPENSES, results);
    await processSync(syncUrl, months, 'production', production.data, mapProductionRow, 'production', results);
    await processSync(syncUrl, months, 'inventory', inventory.data, mapInventoryRow, tables.INVENTORY, results);
    await processSync(syncUrl, months, 'attendance', attendance.data, mapAttendanceRow, 'attendance', results);

    return results;
  } catch (err) {
    console.error("Sync Error:", err);
    throw err;
  }
}

async function processSync(syncUrl, months, type, rows, mapper, tableName, results) {
  if (!rows || rows.length === 0) return;

  // Group rows by target sheetId (month)
  const grouped = {};
  for (const row of rows) {
    const date = new Date(row.date);
    const m = date.getMonth();
    const y = date.getFullYear();
    const config = months.find(c => c.month === m && c.year === y);
    
    if (!config) {
      results.errors.push(`No sheet found for ${row.date} (${type})`);
      continue;
    }

    const { sheetId } = config;
    if (!grouped[sheetId]) grouped[sheetId] = [];
    grouped[sheetId].push(row);
  }

  // Sync each group
  for (const [sheetId, groupRows] of Object.entries(grouped)) {
    try {
      // Map to sheet format
      const sheetRows = groupRows.map(mapper);
      
      // We need to know the tab name. For sales, it's the partner_name. 
      // For others, it's standard.
      const tabName = getTabName(type, groupRows[0]);

      const response = await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors', // Apps Script requires no-cors for simple redirects, or proper CORS setup
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetId,
          tabName,
          rows: sheetRows
        })
      });

      // Note: With no-cors, we can't read the response body. 
      // We assume success if no exception is thrown, then update Supabase.
      // To be safer, we mark them as synced.
      const ids = groupRows.map(r => r.id);
      const { error: updErr } = await supabase.from(tableName).update({ is_synced: true }).in('id', ids);
      if (updErr) throw updErr;

      results[type] += groupRows.length;
    } catch (err) {
      results.errors.push(`Error syncing ${type} to ${sheetId}: ${err.message}`);
    }
  }
}

function getTabName(type, firstRow) {
  if (type === 'sales') return firstRow.partner_name;
  if (type === 'production') return 'DailyProduction';
  if (type === 'expenses') return 'DailyExpenses';
  if (type === 'inventory') return 'MaterialInventory';
  if (type === 'attendance') return 'AttendanceSheet';
  return 'GeneralReport';
}

// --- ROW MAPPERS (Matches parseSheet.js expectations) ---

function mapSalesRow(r) {
  // Cols: No, Date, Description, Color, Qty6L, Qty8L, Price, TotalPrice, Paid, Remain, Note
  const isDebit = r.type === 'Debit';
  return [
    '', 
    r.date, 
    r.notes || (isDebit ? 'Sale' : 'Payment'), 
    '', 
    0, 0, 0, 
    isDebit ? r.amount : 0, 
    !isDebit ? r.amount : 0, 
    0, 
    ''
  ];
}

function mapExpenseRow(r) {
  // Cols: No, Date, Type/Category, Price, Qty, Total, Note
  return ['', r.date, r.category, r.amount, 1, r.amount, r.description || ''];
}

function mapProductionRow(r) {
  // Cols: Day, Date, Shift, Worker, Qty, Type, Total, Note
  return ['', r.date, 1, r.worker_name, r.bags_produced, r.product_type || '6L', r.bags_produced, r.notes || ''];
}

function mapInventoryRow(r) {
  // Cols: No, Date, Type, Info..., Qty, Price, Amount, Payment, Note
  // Simplified mapping for inventory
  return ['', r.date, r.material_name, r.type, r.quantity, r.price || 0, r.quantity * (r.price || 0), '', r.notes || ''];
}

function mapAttendanceRow(r) {
  // Cols: No, Date, Shift, Name, In, Out, TotalHours, Late, OT, Note
  return ['', r.date, r.shift || 1, r.worker_name, r.check_in || '08:00', r.check_out || '16:00', 8, 0, 0, r.notes || ''];
}
