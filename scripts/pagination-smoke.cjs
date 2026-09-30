// Credentials are read from stdin and never written to the report.
process.env.NODE_ENV = 'test';
process.env.DATABASE_CONNECT_ON_STARTUP = 'false';
require('ts-node/register/transpile-only');
require('reflect-metadata');
const {readFileSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {NestFactory}=require('@nestjs/core');
const {AppModule}=require('../src/app.module');
const {setupApp}=require('../src/setup-app');
async function main(){
 const credentials=JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));
 const app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
 const report={date:new Date().toISOString(),environment:'local source, real database, authenticated account',results:[]};
 try{
  setupApp(app);await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(20000)});
  const auth=await login.json();
  assert.equal(login.status,200,'Login failed');assert.ok(auth.data?.accessToken,'Login did not return a token');
  const headers={Authorization:'Bearer '+auth.data.accessToken};
  async function check(path,expected=200){
   const start=performance.now();
   const response=await fetch(base+'/api/v1/'+path,{headers,signal:AbortSignal.timeout(20000)});
   const body=await response.json();
   const result={path,status:response.status,ms:Math.round(performance.now()-start)};
   report.results.push(result);
   assert.equal(response.status,expected,path);
   if(expected===200){
    const {items,meta}=body.data;assert.ok(Array.isArray(items),path+' items');
    assert.ok(items.length<=meta.limit,path+' limit');
    assert.equal(meta.totalPages,Math.ceil(meta.total/meta.limit),path+' count');
    result.count=items.length;result.total=meta.total;result.page=meta.page;
   }
   result.passed=true;return body.data;
  }
  const paths=['products','services','orders','bookings','notifications','addresses','wishlist','garden/plants','spaces','ai/conversations','ai/memories','support/conversations','rewards/transactions','rewards/redemptions'];
  const samples={};
  for(const path of paths){
   const first=await check(path+'?page=1&limit=1');samples[path]=first.items[0];
   const second=await check(path+'?page=2&limit=1');
   if(first.items.length&&second.items.length)assert.notEqual(first.items[0].id,second.items[0].id,path+' duplicate page');
   const end=await check(path+'?page='+(first.meta.totalPages+1)+'&limit=1');
   assert.equal(end.items.length,0,path+' final page');
  }
  for(const path of ['orders?status=ACTIVE','bookings?status=HISTORY','notifications?unread=false','notifications?unread=true','garden/plants?environment=INDOOR','spaces?status=COMPLETED','products?featured=false&maxPrice=0','services?search=__no_matching_service__'])await check(path);
  const summaryStart=performance.now();
  const summaryResponse=await fetch(base+'/api/v1/garden/plants/summary',{headers,signal:AbortSignal.timeout(20000)});
  const summary=(await summaryResponse.json()).data;
  assert.equal(summaryResponse.status,200);assert.ok(summary.healthy<=summary.total);assert.ok(Array.isArray(summary.locations));
  report.results.push({path:'garden/plants/summary',status:summaryResponse.status,ms:Math.round(performance.now()-summaryStart),passed:true});
  if(samples['ai/conversations'])await check('ai/conversations/'+samples['ai/conversations'].id+'/messages?limit=2');
  if(samples.spaces)await check('spaces/'+samples.spaces.id+'/designs?limit=2');
  for(const query of ['page=0','limit=101','status=BAD','from=2026-09-20&to=2026-09-01'])await check('orders?'+query,400);
  report.passed=true;
 }catch(error){report.passed=false;report.failure=error instanceof assert.AssertionError?error.message:error.name;process.exitCode=1;}
 finally{await app.close();writeFileSync('pagination-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.results.length,failure:report.failure}));}
}
void main().catch(()=>{console.error('Pagination smoke initialization failed');process.exitCode=1;});
