const assert=require('node:assert/strict');
const base=process.env.API_BASE_URL||'http://localhost:8080';
async function call(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
(async()=>{
  assert.equal((await call('/health')).status,200);
  assert.equal((await call('/audit/v1/reset',{stock:{'var-jersey-001-M':1}})).status,200);
  const jobs=Array.from({length:20},(_,i)=>call('/audit/v1/checkout',{order_id:`burst-${i}`,customer_id:`buyer-${i}`,items:[{variant_id:'var-jersey-001-M',quantity:1}],discount_code:null,payment:{token:'tok_success'}}));
  const results=await Promise.all(jobs);
  assert.equal(results.filter(x=>x.status===201).length,1);
  assert.equal(results.filter(x=>x.status===409&&x.data.error.code==='OUT_OF_STOCK').length,19);
  const receipt=results.find(x=>x.status===201).data.receipt;
  assert.ok(Buffer.from(receipt.pdf_base64,'base64').subarray(0,4).toString()==='%PDF');
  assert.equal((await call('/audit/v1/inventory/var-jersey-001-M')).data.stock,0);
  console.log('HTTP smoke passed: health, reset, 20-buyer stock safety, receipt PDF and inventory.');
})().catch(e=>{console.error(e);process.exitCode=1;});
