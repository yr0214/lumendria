const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const root = path.resolve(__dirname, '..');
const scenarioPath = path.join(root, 'scenario_v3.json');
const base = 'http://localhost:8000/';

function httpHead(url){
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(url, {method:'HEAD', timeout:5000}, (res)=>{
        resolve({url, status: res.statusCode});
      });
      req.on('error', (e)=> resolve({url, error: e.message}));
      req.on('timeout', ()=> { req.abort(); resolve({url, error:'timeout'}); });
      req.end();
    } catch (e){ resolve({url, error: e.message}); }
  });
}

(async function(){
  const data = JSON.parse(fs.readFileSync(scenarioPath,'utf8'));
  const nodes = data.nodes || {};
  const urls = new Set();
  for(const [k,n] of Object.entries(nodes)){
    const raw = n.images ?? n.image ?? null;
    if(!raw) continue;
    const arr = Array.isArray(raw) ? raw : [raw];
    for(const e of arr){
      if(!e) continue;
      const s = String(e).trim();
      if(/^https?:\/\//i.test(s)) urls.add(s);
      else if(/^images\//.test(s)) urls.add(base + s);
      else if(/^[^:/\\]+\.[a-z]{2,4}$/i.test(s)) urls.add(base + 'images/' + s);
      else urls.add(base + s);
    }
  }

  const list = Array.from(urls).sort();
  const results = [];
  for(const u of list){
    // wait a bit between requests
    // eslint-disable-next-line no-await-in-loop
    const r = await httpHead(u);
    results.push(r);
    console.log(r.url, r.status || r.error || 'unknown');
  }

  const bad = results.filter(x => x.status && x.status >=400 || x.error);
  console.log('\nSUMMARY: Total', results.length, 'bad:', bad.length);
  if(bad.length) console.log(bad.map(b=> (b.status? b.status : b.error)+ ' ' + b.url).join('\n'));
})();
