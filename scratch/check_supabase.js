import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tctgihojkynjpmsheyhq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGdpaG9qa3luanBtc2hleWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQzMzEsImV4cCI6MjA5MDIxMDMzMX0.anwpFu3gVOiYMOLGQPBUhejz5ouRs31RFTWEVxNyMEc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAttendance() {
  console.log("Checking Attendance for May 2026...");
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', '2026-05-01')
    .lte('date', '2026-05-31');
  
  if (error) {
    console.error("Error fetching attendance:", error);
    return;
  }

  console.log(`Found ${data.length} records.`);
  data.forEach(r => {
    console.log(`- ${r.date}: ${r.worker_name} (${r.status}) [TestMode: ${r.is_dev_test}]`);
  });
}

checkAttendance();
