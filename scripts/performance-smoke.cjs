const fs = require('node:fs');
async function main() {
  const credentials=JSON.parse(fs.readFileSync(0,'utf8').replace(/^\uFEFF/,''));
  const base='http://127.0.0.1:3000/api/v1';
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
  const session=await login.json();
  if(!login.ok||!session.data?.accessToken)throw new Error('Login failed');
  const paths=['/orders','/settings','/addresses','/wishlist','/garden/plants'];
  const rows=[];
  for(let wave=0;wave<5;wave++) {
    const at=performance.now();
    const responses=await Promise.all(Array.from({length:20},async(_,i)=>{
      const start=performance.now();const path=paths[i%paths.length];
      const r=await fetch(base+path,{headers:{Authorization:'Bearer '+session.data.accessToken},signal:AbortSignal.timeout(15000)});
      await r.arrayBuffer();return {path,status:r.status,ms:Math.round(performance.now()-start)};
    }));
    rows.push({wave,ms:Math.round(performance.now()-at),responses});
  }
  const all=rows.flatMap(r=>r.responses);const sorted=all.map(r=>r.ms).sort((a,b)=>a-b);
  const summary={requests:all.length,concurrency:20,successes:all.filter(r=>r.status===200).length,failures:all.filter(r=>r.status!==200),medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)};
  fs.writeFileSync('performance-smoke.json',JSON.stringify({date:new Date().toISOString(),summary,rows},null,2));
  console.log(JSON.stringify(summary,null,2));
  if(summary.failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
