
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMarchExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .gte('date', '2026-03-01')
    .lte('date', '2026-03-31');

  if (error) {
    console.error("Error fetching March expenses:", error);
    return;
  }

  console.log("March Expenses count:", data?.length);
  const large = data?.filter(e => e.amount >= 80000);
  if (large?.length > 0) {
    console.log("Large Expenses found:", large);
  } else {
    console.log("No large expenses in Supabase for March.");
  }
}

checkMarchExpenses();
