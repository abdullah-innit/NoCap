const assert=require('node:assert/strict');
const base=process.env.API_BASE_URL||'http://localhost:8080';
async function call(path,method='GET',body=null,token=''){
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
}
(async()=>{
  const matrix=(await call('/audit/v1/rbac-matrix','POST',{})).data;
  assert.equal((await call('/audit/v1/rbac/platform/config','GET',null,matrix.tokens.super_admin)).status,200);
  assert.equal((await call('/audit/v1/rbac/platform/config','GET',null,matrix.tokens.viewer)).status,403);
  assert.equal((await call('/audit/v1/rbac/platform/config')).status,401);
  assert.equal((await call('/audit/v1/rbac/clubs/club-beta-1','GET',null,matrix.tokens.viewer)).status,403);
  const login=await call('/api/v1/login','POST',{email:'viewer@nascon.test',password:'Nascon@26'});assert.equal(login.status,200);
  const dashboard=await call('/api/v1/dashboard','GET',null,login.data.token);assert.equal(dashboard.status,200);assert.ok(dashboard.data.fixtures.length);
  console.log('HTTP security passed: role probes, tenant boundary, demo login and dashboard.');
})().catch(e=>{console.error(e);process.exitCode=1;});
