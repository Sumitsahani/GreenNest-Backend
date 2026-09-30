const fs = require('node:fs');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.AUDIT_OUTPUT || 'api-audit-auth.json';
async function main() {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const start = performance.now();
  const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify(credentials), signal:AbortSignal.timeout(20000) });
  const session = await login.json();
  const report = {date:new Date().toISOString(), login:{status:login.status,ms:Math.round(performance.now()-start),errorCode:session.error?.code}, results:[]};
  if (!login.ok || !session.data?.accessToken) { fs.writeFileSync(output,JSON.stringify(report,null,2)); console.log(JSON.stringify(report)); return; }
  console.log('Login successful. Checking GET endpoints; credentials remain in memory only.');
  const token = session.data.accessToken;
  const doc = await (await fetch(base + '/api/docs-json')).json();
  const data = new Map();
  function first(value) { const list=Array.isArray(value)?value:value?.items??value?.data??value?.plants??value?.conversations??value?.spaces??value?.bookings??value?.orders??value?.jobs??value?.designs; return Array.isArray(list)?list[0]:undefined; }
  async function check(template, path) {
    const at=performance.now();
    try {
      const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
      const raw=await r.text();let body;try{body=JSON.parse(raw);}catch{}
      const row={method:'GET',template,path,status:r.status,ms:Math.round(performance.now()-at),errorCode:body?.error?.code,result:r.ok?'SUCCESS':r.status===403?'ACCESS DENIED':r.status===404?'NOT FOUND':r.status===401?'UNAUTHORIZED':'ERROR'};
      report.results.push(row); if(r.ok)data.set(template,body?.data);
      console.log(JSON.stringify(row));
    } catch(e) {report.results.push({method:'GET',template,path,result:'ERROR',error:e.name,ms:Math.round(performance.now()-at)});}
    fs.writeFileSync(output,JSON.stringify(report,null,2));
  }
  const paths=Object.entries(doc.paths).filter(([,v])=>v.get).map(([p])=>p);
  for(const p of paths.filter(p=>!p.includes('{'))) {
    let path=p;
    if(p.endsWith('/services/slots'))path+='?date=2026-09-28';
    await check(p,path);
  }
  const mappings=[['/garden/plants/','/api/v1/garden/plants'],['/gardener/jobs/','/api/v1/gardener/jobs'],['/bookings/','/api/v1/bookings'],['/ai/conversations/','/api/v1/ai/conversations'],['/support/conversations/','/api/v1/support/conversations'],['/products/','/api/v1/products'],['/services/','/api/v1/services'],['/orders/','/api/v1/orders'],['/spaces/','/api/v1/spaces'],['/admin/customers/','/api/v1/admin/customers']];
  for(const p of paths.filter(p=>p.includes('{'))) {
    let path=p;
    if(p.includes('{component}'))path=p.replace('{component}','database');
    else if(p.includes('{resource}')) { report.results.push({method:'GET',template:p,result:'NOT TESTED',reason:'Generic admin resource requires a separate resource-specific audit.'}); continue; }
    else {
      const mapping=mappings.find(([prefix])=>p.includes(prefix));
      const entity=mapping?first(data.get(mapping[1])):undefined;
      if(!entity?.id) {report.results.push({method:'GET',template:p,result:'NOT TESTED',reason:'No accessible sample record returned by the parent list.'});continue;}
      path=path.replace('{id}',encodeURIComponent(entity.id));
      if(path.includes('{designId}')) {
        const design=first(data.get('/api/v1/spaces/{id}/designs'));
        if(!design?.id){report.results.push({method:'GET',template:p,result:'NOT TESTED',reason:'No accessible design record.'});continue;}
        path=path.replace('{designId}',encodeURIComponent(design.id));
      }
    }
    if(p.endsWith('/recommendations'))path+='?style=MINIMAL&carePreference=EASY';
    await check(p,path);
  }
  const slow=report.results.filter(r=>r.result==='SUCCESS' && (r.ms>=500 || r.template.endsWith('/intelligence')));
  for(const r of slow) for(let i=0;i<2;i++) await check(r.template,r.path);
  report.summary=report.results.reduce((s,r)=>(s[r.result]=(s[r.result]||0)+1,s),{});
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary));
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
