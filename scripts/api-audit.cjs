const fs = require('node:fs');
const base = 'http://127.0.0.1:3000';
const uuid = '00000000-0000-4000-8000-000000000000';
async function main() {
  const doc = await (await fetch(base + '/api/docs-json')).json();
  const results = [];
  async function check(method, path, expected, label, body) {
    const start = performance.now();
    try {
      const r = await fetch(base + path, {method: method.toUpperCase(), signal: AbortSignal.timeout(15000), ...(body ? {headers: {'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
      const data = await r.json();
      results.push({method, path, label, expected, status:r.status, ms:Math.round(performance.now()-start), pass:expected.includes(r.status), errorCode:data.error?.code});
      return data.data;
    } catch(e) { results.push({method,path,label,expected,pass:false,error:e.name,ms:Math.round(performance.now()-start)}); }
  }
  const products = await check('get','/api/v1/products',[200],'public list');
  const services = await check('get','/api/v1/services',[200],'public list');
  for (const [template, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!['get','post','patch','put','delete'].includes(method)) continue;
      if (method === 'get' && ['/api/v1/products','/api/v1/services'].includes(template)) continue;
      let path = template.replace(/\{([^}]+)\}/g, (_, key) => key === 'component' ? 'database' : key === 'resource' ? 'products' : key === 'action' ? 'accept' : uuid);
      const protectedRoute = op.security?.length || /^\/api\/v1\/(admin|support\/admin)\//.test(path) || path.includes('/tracking');
      let expected, label, body;
      if (protectedRoute) { expected = path.includes('/support/admin/') ? [403] : [401]; label = 'missing authentication'; if (method !== 'get') body = {}; if (path === '/api/v1/auth/profile') expected = [400,401]; }
      else if (method === 'post' && path.startsWith('/api/v1/auth/')) { expected = [400]; label = 'empty input validation'; body = {}; }
      else if (method === 'get') {
        expected = [200]; label = 'public read';
        if (template === '/api/v1/products/{id}') {path = '/api/v1/products/' + (products?.items?.[0]?.id || uuid); expected = products?.items?.length ? [200] : [404];}
        if (template === '/api/v1/services/{id}') {path = '/api/v1/services/' + (services?.[0]?.id || uuid); expected = services?.length ? [200] : [404];}
        if (path.endsWith('/services/slots')) path += '?date=2026-09-28';
      } else {results.push({method,path:template,label:'not probed',pass:null}); continue;}
      await check(method,path,expected,label,body);
    }
  }
  for (const path of ['/api/v1/products?page=0','/api/v1/products?limit=10000','/api/v1/services/slots?date=invalid']) await check('get',path,[400],'invalid query');
  for (const path of ['/api/v1/products/'+uuid,'/api/v1/services/'+uuid,'/api/v1/health/unknown-component']) await check('get',path,[404],'missing resource');
  fs.writeFileSync('api-audit-live.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({operations:Object.values(doc.paths).reduce((n,v)=>n+Object.keys(v).filter(m=>['get','post','patch','put','delete'].includes(m)).length,0),checks:results.length,passed:results.filter(r=>r.pass===true).length,failed:results.filter(r=>r.pass===false),publicReads:results.filter(r=>r.status===200)},null,2));
}
main().catch(e=>{console.error(e.name);process.exitCode=1;});
