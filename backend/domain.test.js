const test=require('node:test');
const assert=require('node:assert/strict');
const {baseline,addEvent,score,checkout,ApiError}=require('./domain');
const salt='test-only';
test('event scoring is reconstructed and a compensation removes a goal',()=>{
  const s=baseline();
  const send=(event_id,type,payload)=>addEvent(s,{event_id,match_id:'m1',type,payload},salt);
  assert.equal(send('e1','match_init',{sport_id:'football',home_team_id:'a',away_team_id:'b'})[0],201);
  send('e2','match_start',{});
  send('e3','score',{team_id:'a',event_type:'goal'});
  assert.equal(score(s,'m1').home.score,1);
  send('e4','compensation',{compensates:'e3',reason:'Correction'});
  assert.equal(score(s,'m1').home.score,0);
  assert.equal(score(s,'m1').events[2].compensated_by,'e4');
});
test('checkout consumes stock once, replays safely, and rejects oversell',()=>{
  const s=baseline(),body={order_id:'o1',customer_id:'c1',items:[{variant_id:'var-jersey-001-M',quantity:1}],discount_code:null,payment:{token:'tok_success'}};
  const [status,r]=checkout(s,body,salt);
  assert.equal(status,201);assert.equal(r.total_minor,450000);assert.equal(s.stock['var-jersey-001-M'],0);
  assert.equal(checkout(s,body,salt)[0],200);
  assert.throws(()=>checkout(s,{...body,order_id:'o2'},salt),e=>e instanceof ApiError&&e.code==='OUT_OF_STOCK');
  assert.equal(s.stock['var-jersey-001-M'],0);
});
test('declined payment leaves stock available',()=>{
  const s=baseline(),body={order_id:'o1',customer_id:'c1',items:[{variant_id:'var-jersey-001-M',quantity:1}],payment:{token:'tok_declined'}};
  assert.throws(()=>checkout(s,body,salt),e=>e.code==='PAYMENT_DECLINED');
  assert.equal(s.stock['var-jersey-001-M'],1);
});
