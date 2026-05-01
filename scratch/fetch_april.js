import fetch from 'node-fetch';

const id = '11Tf5W3euky4Z_1svgWUOuiRDOYl3YKEv95oM6fwuGkg';

async function fetchTab(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  return res.text();
}

async function run() {
  const gen = await fetchTab('General Report');
  console.log('--- General Report ---');
  console.log(gen.split('\n').slice(0, 10).join('\n'));
  
  const end = await fetchTab('End Product Inventory');
  console.log('\n--- End Product Inventory ---');
  console.log(end.split('\n').slice(0, 10).join('\n'));
}
run();
