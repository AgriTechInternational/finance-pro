
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log("Checking partner_transactions for April 2026...");
  const { data, error } = await supabase
    .from('partner_transactions')
    .select('*')
    .gte('date', '2026-04-01')
    .lte('date', '2026-04-30')
    .eq('partner_name', 'Wageh');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${data.length} transactions for Wageh in April:`);
  data.forEach(t => {
    console.log(`- ${t.date}: ${t.type} ${t.amount} EGP (${t.notes})`);
  });
}

check();
