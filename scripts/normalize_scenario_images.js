const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const scenarioPath = path.join(root, 'scenario_v3.json');
const imagesDir = path.join(root, 'images');
let data = fs.readFileSync(scenarioPath, 'utf8');
let scenario = JSON.parse(data);
const existing = new Set(fs.readdirSync(imagesDir));
let changed = false;
function resolveCandidates(nodeKey, entry){
  if (entry == null) return [];
  const s = String(entry).trim();
  if (/^data:/i.test(s)) return [s];
  if (/^images\//.test(s)){
    const name = s.replace(/^images\//, '');
    return [ 'images/' + name ];
  }
  if (/^https?:\/\//i.test(s) || /^file:\/\//i.test(s)){
    // try extract basename
    const name = path.basename(s);
    return ['images/' + name];
  }
  if (/^\d+$/.test(s)){
    return [`images/${nodeKey}-${s}.png`];
  }
  // otherwise treat as file name or path under images/
  const name = path.basename(s);
  return ['images/' + name];
}

for(const [key, node] of Object.entries(scenario.nodes || {})){
  if (!node.hasOwnProperty('images') && !node.hasOwnProperty('image')) continue;
  const raw = node.images ?? node.image;
  const arr = Array.isArray(raw)? raw : [raw];
  const kept = [];
  for(const e of arr){
    const candidates = resolveCandidates(key, e);
    for(const c of candidates){
      const fname = c.replace(/^images\//,'');
      if (existing.has(fname)){
        if (!kept.includes(c)) kept.push(c);
        break;
      }
    }
  }
  if (kept.length === 0){
    // no images found; remove property
    if (node.hasOwnProperty('images')) delete node.images;
    if (node.hasOwnProperty('image')) delete node.image;
    changed = true;
  } else {
    // write normalized images array (ensure images/ prefix)
    if (node.hasOwnProperty('images')){
      node.images = kept.slice();
    } else {
      node.image = kept.slice();
    }
    changed = true;
  }
}

if (changed){
  fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2), 'utf8');
  console.log('UPDATED');
} else {
  console.log('NO_CHANGE');
}
