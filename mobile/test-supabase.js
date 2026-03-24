const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.split('EXPO_PUBLIC_SUPABASE_URL=')[1].replace(/\r/g, '').split('\n')[0].replace(/"/g, '').trim();
const key = env.split('EXPO_PUBLIC_SUPABASE_ANON_KEY=')[1].replace(/\r/g, '').split('\n')[0].replace(/"/g, '').trim();
const supabase = createClient(url, key);

async function test() {
  console.log("Testing 1: No filters");
  let { data: d1, error: e1 } = await supabase.from('players').select('*, clubs!inner(name, leagues(name))').limit(5);
  console.log("Data 1 len:", d1?.length, "Error:", e1);

  console.log("\nTesting 2: filterPos = 'Forward'");
  let { data: d2, error: e2 } = await supabase.from('players').select('*, clubs!inner(name, leagues(name))').ilike('position', '%Forward%').limit(5);
  console.log("Data 2 len:", d2?.length, "Error:", e2);

  console.log("\nTesting 3: filterLeague = 'Real'");
  let { data: d3, error: e3 } = await supabase.from('players').select('*, clubs!inner(name, leagues(name))').ilike('clubs.name', '%Real%').limit(5);
  console.log("Data 3 len:", d3?.length, "Error:", e3);
}
test();
