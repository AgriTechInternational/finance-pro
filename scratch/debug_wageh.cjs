
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log("Fetching ALL partner_transactions for Wageh...");
  const { data, error } = await supabase
    .from('partner_transactions')
    .select('*')
    .eq('partner_name', 'Wageh');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${data.length} transactions:`);
  data.forEach(t => {
    console.log(`- ID: ${t.id}, Date: ${t.date}, Type: ${t.type}, Amount: ${t.amount}, Notes: ${t.notes}, Test: ${t.is_dev_test}`);
  });
}

check();
