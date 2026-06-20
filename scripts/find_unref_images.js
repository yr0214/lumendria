const fs = require('fs');
const scenario = JSON.parse(fs.readFileSync('scenario_v3.json','utf8'));
const files = fs.readdirSync('images').filter(f => !f.startsWith('.'));
const refs = new Set();
for (const [k,node] of Object.entries(scenario.nodes)) {
  const raw = node.images || node.image;
  if (!raw) continue;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const e of arr) {
    if (typeof e === 'string') refs.add(e.replace(/^images\//, ''));
  }
}
const unref = files.filter(f => !refs.has(f));
console.log('UNREFERENCED FILES:', unref.length);
unref.forEach(f => console.log(f));
