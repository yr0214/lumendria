const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const scenarioPath = path.join(root, 'scenario_v3.json');
const imagesDir = path.join(root, 'images');
let data = fs.readFileSync(scenarioPath, 'utf8');
const scenario = JSON.parse(data);
const missing = new Set();
for(const [key, node] of Object.entries(scenario.nodes||{})){
  const imgs = node.images;
  if(!imgs) continue;
  const arr = Array.isArray(imgs)? imgs : [imgs];
  for(const img of arr){
    if(/^\d+$/.test(String(img))){
      const fn = `${key}-${img}.png`;
      if(!fs.existsSync(path.join(imagesDir, fn))) missing.add(path.join('images', fn));
    } else {
      const name = path.basename(String(img));
      if(!fs.existsSync(path.join(imagesDir, name))) missing.add(path.join('images', name));
    }
  }
}
if(missing.size===0) console.log('NO_MISSING');
else console.log([...missing].sort().join('\n'));
