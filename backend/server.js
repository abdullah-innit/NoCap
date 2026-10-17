const http=require('node:http');
const {Pool}=require('pg');
const d=require('./domain');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function init(){await pool.query('CREATE TABLE IF NOT EXISTS app_state(id integer PRIMARY KEY,data jsonb NOT NULL)');await pool.query('INSERT INTO app_state(id,data) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[JSON.stringify(d.baseline())]);}
async function state(write,fn){
  const client=await pool.connect();try{
    if(write)await client.query('BEGIN');
    const r=await client.query(`SELECT data FROM app_state WHERE id=1 ${write?'FOR UPDATE':''}`);if(!r.rows.length)d.fail(503,'NOT_READY');
    const s=r.rows[0].data,result=await fn(s);
    if(write){await client.query('UPDATE app_state SET data=$1 WHERE id=1',[JSON.stringify(s)]);await client.query('COMMIT');}
    return result;
  }catch(e){if(write)await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
async function route(method,path,b){
  if(method==='GET'&&path==='/health'){const r=await pool.query('SELECT data FROM app_state WHERE id=1');if(!r.rows.length)d.fail(503,'NOT_READY');return [200,{status:'ok'}];}
  if(method==='POST'&&path==='/audit/v1/reset')return state(true,s=>{
    if(b.seed!==undefined&&!Number.isInteger(b.seed))d.fail(400,'VALIDATION_ERROR',{fields:['seed']});
    if(b.stock!==undefined&&(!b.stock||typeof b.stock!=='object'||Object.values(b.stock).some(v=>!d.int(v))))d.fail(400,'VALIDATION_ERROR',{fields:['stock']});
    const fresh=d.baseline(b.seed??42,b.stock);for(const k of Object.keys(s))delete s[k];Object.assign(s,fresh);
    return [200,{status:'reset_complete',seed:s.seed,sports:Object.keys(s.sports),tenants:['tenant-alpha','tenant-beta'],stock:s.stock}];
  });
  if(method==='POST'&&path==='/audit/v1/sports')return state(true,s=>{d.validateSport(b);if(s.sports[b.sport_id])d.fail(409,'SPORT_EXISTS');const config={...b,tie_break_order:b.tie_break_order??['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots']};s.sports[b.sport_id]=config;return [201,{sport_id:b.sport_id,status:'created',config}];});
  if(method==='POST'&&path==='/audit/v1/events')return state(true,s=>d.addEvent(s,b,process.env.DAY1_SALT));
  let m=path.match(/^\/audit\/v1\/score\/([^/]+)$/);if(method==='GET'&&m)return state(false,s=>[200,d.score(s,decodeURIComponent(m[1]))]);
  if(method==='POST'&&path==='/audit/v1/checkout')return state(true,s=>d.checkout(s,b,process.env.DAY1_SALT));
  m=path.match(/^\/audit\/v1\/inventory\/([^/]+)$/);if(method==='GET'&&m)return state(false,s=>{const variant_id=decodeURIComponent(m[1]);if(!['var-jersey-001-M','var-jersey-001-L'].includes(variant_id))d.fail(404,'VARIANT_NOT_FOUND');return [200,{variant_id,stock:s.stock[variant_id]??0,reserved:0}];});
  d.fail(404,'NOT_FOUND');
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)d.fail(413,'PAYLOAD_TOO_LARGE');chunks.push(chunk);}
    let b={};if(size){try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{d.fail(400,'VALIDATION_ERROR',{fields:['body']});}}
    if(!b||typeof b!=='object'||Array.isArray(b))d.fail(400,'VALIDATION_ERROR',{fields:['body']});
    const [status,payload]=await route(req.method,new URL(req.url,'http://localhost').pathname,b);res.writeHead(status);res.end(JSON.stringify(payload));
  }catch(e){const status=e.status??500;res.writeHead(status);res.end(JSON.stringify({error:{code:e.code??'INTERNAL_ERROR',message:status===500?'Internal server error':e.message,details:e.details??{}}}));if(status===500)console.error(e);}
});
init().then(()=>server.listen(8080,'0.0.0.0')).catch(e=>{console.error(e);process.exit(1)});
