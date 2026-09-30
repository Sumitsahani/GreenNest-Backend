const fs = require('node:fs');
async function main() {
  const credentials=JSON.parse(fs.readFileSync(0,'utf8').replace(/^\uFEFF/,''));
  const login=await fetch('http://127.0.0.1:3000/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
  const body=await login.json();
  if(!login.ok||!body.data?.accessToken)throw new Error('Login failed');
  const headers={Authorization:'Bearer '+body.data.accessToken};
  const previous=JSON.parse(fs.readFileSync('api-audit-auth.json','utf8'));
  const plant=previous.results.find(r=>r.template.endsWith('/intelligence')&&r.path)?.path;
  const paths=['/api/v1/products','/api/v1/garden/today','/api/v1/garden/plants','/api/v1/orders',plant].filter(Boolean);
  const rows=[];
  async function measure(port,path) {
    const start=performance.now();
    const r=await fetch(`http://127.0.0.1:${port}${path}`,{headers,signal:AbortSignal.timeout(20000)});
    await r.arrayBuffer();
    return {port,path,status:r.status,ms:Math.round(performance.now()-start)};
  }
  for(const path of paths)for(let i=0;i<5;i++)for(const port of [3000,3101]) rows.push({...await measure(port,path),sample:i});
  const bursts=[];
  for(let i=0;i<3;i++)for(const port of [3000,3101]) {
    const start=performance.now();
    const results=await Promise.all(Array.from({length:10},(_,n)=>measure(port,['/api/v1/orders','/api/v1/settings','/api/v1/addresses','/api/v1/wishlist','/api/v1/garden/plants'][n%5])));
    bursts.push({port,totalMs:Math.round(performance.now()-start),statuses:results.map(r=>r.status)});
  }
  const med=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
  const summary=paths.map(path=>({path,beforeMedianMs:med(rows.filter(r=>r.port===3000&&r.path===path).map(r=>r.ms)),afterMedianMs:med(rows.filter(r=>r.port===3101&&r.path===path).map(r=>r.ms))}));
  const report={date:new Date().toISOString(),scope:'Local warm requests; 5 samples per endpoint per server; 3 bursts of 10 protected requests. No load/SLA claim.',summary,burstMedians:[3000,3101].map(port=>({port,ms:med(bursts.filter(r=>r.port===port).map(r=>r.totalMs))})),rows,bursts};
  fs.writeFileSync('performance-comparison.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({summary,bursts:report.burstMedians,failed:rows.filter(r=>r.status!==200),failedBursts:bursts.filter(r=>r.statuses.some(s=>s!==200))},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
