const crypto = require('node:crypto');

class ApiError extends Error { constructor(status, code, details={}) { super(code); this.status=status; this.code=code; this.details=details; } }
const fail=(status,code,details)=>{throw new ApiError(status,code,details)};
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(x);
const int=(x,min=0)=>Number.isInteger(x)&&x>=min;
const canon=x=>Array.isArray(x)?`[${x.map(canon).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`:JSON.stringify(x);
const sign=(salt,key,payload)=>crypto.createHmac('sha256',salt).update(`${key}|${canon(payload)}`,'utf8').digest('hex');
const ties=['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'];
const eventSport=(sport_id,name,scoring_events,roster,draw_allowed=true)=>({sport_id,name,scoring_model:'event',periods:{count:2,duration_minutes:45},scoring_events,draw_allowed,overtime:{policy:'none'},tie_break_order:ties,roster});
function baseline(seed=42,stock={}) {const data={seed,stock:{'var-jersey-001-M':1,'var-jersey-001-L':5,...stock},sports:{
  football:eventSport('football','Football',{goal:{points:1}},{min_squad_size:11,max_squad_size:25,required_positions:{gk:1}}),
  basketball:{...eventSport('basketball','Basketball',{free_throw:{points:1},two_pointer:{points:2},three_pointer:{points:3}},{min_squad_size:5,max_squad_size:15,required_positions:{}},false),periods:{count:4,duration_minutes:12},overtime:{policy:'extra_time',duration_minutes:5}},
  cricket:{sport_id:'cricket',name:'Cricket',scoring_model:'innings',periods:{innings_per_team:1,overs_per_innings:20,balls_per_over:6,wickets_per_innings:10},scoring_events:{dot_ball:{runs:0,legal_ball:true,wicket:false},single:{runs:1,legal_ball:true,wicket:false},two:{runs:2,legal_ball:true,wicket:false},four:{runs:4,legal_ball:true,wicket:false},six:{runs:6,legal_ball:true,wicket:false},wide:{runs:1,legal_ball:false,wicket:false},no_ball:{runs:1,legal_ball:false,wicket:false},wicket:{runs:0,legal_ball:true,wicket:true}},draw_allowed:true,overtime:{policy:'super_over'},tie_break_order:ties,roster:{min_squad_size:11,max_squad_size:18,required_positions:{wicketkeeper:1}}},
  esports:{sport_id:'esports',name:'Esports',scoring_model:'round',periods:{best_of:3},scoring_events:{roundwin:{rounds:1}},draw_allowed:false,overtime:{policy:'none'},tie_break_order:ties,roster:{min_squad_size:5,max_squad_size:8,required_positions:{}}}
},leagues:{},matches:{},eventsById:{},orders:{},rosters:{},transfers:{},audit:[],offline:{}};
  for(const [league_id,teams,fixture,tenant_id] of [
    ['league-alpha-1',['club-alpha-1','club-alpha-2'],'match-alpha-1','tenant-alpha'],
    ['league-alpha-2',['club-alpha-1','club-alpha-2'],'match-alpha-2','tenant-alpha'],
    ['league-beta-1',['club-beta-1','club-beta-2'],'match-beta-1','tenant-beta']]){
    const fixtures=[{match_id:fixture,home:teams[0],away:teams[1]}];
    data.leagues[league_id]={league_id,tenant_id,sport_id:'football',teams,fixtures,points:{win:3,draw:1,loss:0},tie_break_order:ties,qualification:{spots:1},lots_seed:seed};
    data.matches[fixture]={sport_id:'football',league_id,home:teams[0],away:teams[1],events:[]};
  }
  const demoStart={event_id:'demo-match-start',type:'match_start',payload:{},sequence:1,signature:sign(process.env.DAY1_SALT??'local-test-only','demo-match-start',{})};
  data.matches['match-alpha-1'].events.push(demoStart);
  data.eventsById[demoStart.event_id]={body:{event_id:demoStart.event_id,match_id:'match-alpha-1',type:'match_start',payload:{}},response:{event_id:demoStart.event_id,match_id:'match-alpha-1',type:'match_start',sequence:1,match_version:1,signature:demoStart.signature}};
  return data;}
function validateSport(b) {
  const fields=[];
  if(!/^[a-z0-9_-]{2,40}$/.test(b.sport_id||''))fields.push('sport_id');
  if(typeof b.name!=='string'||b.name.length<1||b.name.length>80)fields.push('name');
  if(!['event','innings','round'].includes(b.scoring_model))fields.push('scoring_model');
  if(!b.periods||typeof b.periods!=='object')fields.push('periods');
  else if(b.scoring_model==='event'&&(!int(b.periods.count,1)||!int(b.periods.duration_minutes,1)))fields.push('periods');
  else if(b.scoring_model==='innings'&&!['innings_per_team','overs_per_innings','balls_per_over','wickets_per_innings'].every(k=>int(b.periods[k],1)))fields.push('periods');
  else if(b.scoring_model==='round'&&(!int(b.periods.best_of,1)||b.periods.best_of%2===0))fields.push('periods');
  if(!b.scoring_events||typeof b.scoring_events!=='object'||!Object.keys(b.scoring_events).length)fields.push('scoring_events');
  else for(const [k,v] of Object.entries(b.scoring_events))if(!/^[a-z0-9_]{1,40}$/.test(k)||!v||typeof v!=='object'||(b.scoring_model==='event'&&!int(v.points,1))||(b.scoring_model==='round'&&!int(v.rounds,1))||(b.scoring_model==='innings'&&(!int(v.runs)||typeof v.legal_ball!=='boolean'||typeof v.wicket!=='boolean')))fields.push('scoring_events');
  if(typeof b.draw_allowed!=='boolean')fields.push('draw_allowed');
  if(!b.overtime||!['none','extra_time','shootout','golden_score','super_over'].includes(b.overtime.policy)||('duration_minutes'in b.overtime&&!int(b.overtime.duration_minutes)))fields.push('overtime');
  if(!b.roster||!int(b.roster.min_squad_size,1)||!int(b.roster.max_squad_size,1)||b.roster.min_squad_size>b.roster.max_squad_size||!b.roster.required_positions||typeof b.roster.required_positions!=='object')fields.push('roster');
  if(fields.length)fail(400,'VALIDATION_ERROR',{fields:[...new Set(fields)]});
}
function score(s,match_id){
  const m=s.matches[match_id];if(!m)fail(404,'MATCH_NOT_FOUND');
  const sport=s.sports[m.sport_id], ev=m.events, compensated=new Map();
  for(const e of ev)if(e.type==='compensation')compensated.set(e.payload.compensates,e.event_id);
  let status='upcoming',tie=null;
  const team={};for(const t of [m.home,m.away])team[t]={team_id:t,score:0,wickets:sport.scoring_model==='innings'?0:null,balls:sport.scoring_model==='innings'?0:null,overs:sport.scoring_model==='innings'?'0.0':null,fair_play:0};
  for(const e of ev){
    if(e.type==='match_start')status='in_progress';if(e.type==='match_end')status='completed';
    if(compensated.has(e.event_id))continue;
    if(e.type==='score'){const t=team[e.payload.team_id],cfg=sport.scoring_events[e.payload.event_type];t.score+=cfg.points??cfg.runs??cfg.rounds;
      if(sport.scoring_model==='innings'){t.balls+=Number(cfg.legal_ball);t.wickets+=Number(cfg.wicket);t.overs=`${Math.floor(t.balls/sport.periods.balls_per_over)}.${t.balls%sport.periods.balls_per_over}`;}}
    if(e.type==='discipline')team[e.payload.team_id].fair_play+=e.payload.points;
    if(e.type==='tiebreak_winner')tie=e.payload.team_id;
  }
  const home=team[m.home],away=team[m.away],winner=home.score>away.score?m.home:away.score>home.score?m.away:tie;
  const outcome=status!=='completed'?'pending':winner===m.home?'home_win':winner===m.away?'away_win':sport.draw_allowed?'draw':'undecided';
  return {match_id,sport_id:m.sport_id,league_id:m.league_id??null,status,outcome,winner_team_id:winner,tiebreak_winner_team_id:tie,home,away,version:ev.length,events:ev.map(e=>({sequence:e.sequence,event_id:e.event_id,type:e.type,payload:e.payload,signature:e.signature,compensated:compensated.has(e.event_id),compensated_by:compensated.get(e.event_id)??null}))};
}
function addEvent(s,b,salt){
  if(!validId(b.event_id)||!validId(b.match_id)||typeof b.type!=='string'||!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload))fail(400,'VALIDATION_ERROR',{fields:['event_id','match_id','type','payload']});
  if(!['match_init','match_start','score','discipline','tiebreak_winner','match_end','compensation'].includes(b.type))fail(400,'VALIDATION_ERROR',{fields:['type']});
  const previous=s.eventsById[b.event_id];if(previous){if(canon(previous.body)!==canon(b))fail(409,'DUPLICATE_EVENT_ID');return [200,previous.response];}
  const p=b.payload;let m=s.matches[b.match_id];
  if(b.type==='match_init'){
    if(m)fail(409,'MATCH_EXISTS');if(!validId(p.sport_id)||!validId(p.home_team_id)||!validId(p.away_team_id)||p.home_team_id===p.away_team_id)fail(400,'VALIDATION_ERROR',{fields:['payload']});
    if(!s.sports[p.sport_id])fail(404,'SPORT_NOT_FOUND');m=s.matches[b.match_id]={sport_id:p.sport_id,league_id:p.league_id??null,home:p.home_team_id,away:p.away_team_id,events:[]};
  }else if(!m)fail(404,'MATCH_NOT_FOUND');
  const pr=score(s,b.match_id),sport=s.sports[m.sport_id];
  if((b.type==='match_start'&&pr.status!=='upcoming')||(b.type==='match_end'&&pr.status!=='in_progress'))fail(409,'ILLEGAL_TRANSITION');
  if(['score','discipline','tiebreak_winner'].includes(b.type)&&pr.status!=='in_progress')fail(409,'MATCH_NOT_IN_PROGRESS');
  if(['score','discipline','tiebreak_winner'].includes(b.type)&&![m.home,m.away].includes(p.team_id))fail(400,'VALIDATION_ERROR',{fields:['payload.team_id']});
  if(b.type==='score'){
    const cfg=sport.scoring_events[p.event_type];if(!cfg)fail(400,'UNKNOWN_EVENT_TYPE');const t=p.team_id===m.home?pr.home:pr.away;
    if(sport.scoring_model==='innings'&&(t.balls>=sport.periods.innings_per_team*sport.periods.overs_per_innings*sport.periods.balls_per_over||t.wickets>=sport.periods.innings_per_team*sport.periods.wickets_per_innings))fail(409,'INNINGS_COMPLETE');
    if(sport.scoring_model==='round'&&t.score>=(sport.periods.best_of+1)/2)fail(409,'SERIES_ALREADY_DECIDED');
  }
  if(b.type==='discipline'&&!Number.isInteger(p.points))fail(400,'VALIDATION_ERROR',{fields:['payload.points']});
  if(b.type==='match_end'&&pr.home.score===pr.away.score&&!sport.draw_allowed&&!pr.tiebreak_winner_team_id)fail(409,'TIE_NOT_ALLOWED');
  if(b.type==='compensation'){
    const target=s.eventsById[p.compensates];if(!target)fail(404,'EVENT_NOT_FOUND');
    if(target.body.match_id!==b.match_id||!['score','discipline','tiebreak_winner'].includes(target.body.type)||pr.events.some(e=>e.compensated&&e.event_id===p.compensates))fail(409,'INVALID_COMPENSATION');
  }
  const sequence=m.events.length+1,signature=sign(salt,b.event_id,p),response={event_id:b.event_id,match_id:b.match_id,type:b.type,sequence,match_version:sequence,signature};
  m.events.push({event_id:b.event_id,type:b.type,payload:p,signature,sequence});s.eventsById[b.event_id]={body:b,response};return [201,response];
}
function receiptPdf(orderId,total){
  const line=`Order ${orderId}  Total PKR ${(total/100).toFixed(2)}`.replace(/[()\\]/g,'\\$&'),stream=`BT /F1 14 Tf 40 760 Td (${line}) Tj ET`;
  const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out='%PDF-1.4\n',offsets=[];for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
  const start=Buffer.byteLength(out);out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(const o of offsets)out+=`${String(o).padStart(10,'0')} 00000 n \n`;out+=`trailer << /Root 1 0 R /Size ${objs.length+1} >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(out).toString('base64');
}
function checkout(s,b,salt){
  if(!validId(b.order_id)||!validId(b.customer_id)||!Array.isArray(b.items)||b.items.length<1||b.items.length>10||!b.payment||!['tok_success','tok_declined','tok_capture_fail'].includes(b.payment.token)||b.items.some(x=>!validId(x.variant_id)||!int(x.quantity,1)||x.quantity>10)||new Set(b.items.map(x=>x.variant_id)).size!==b.items.length)fail(400,'VALIDATION_ERROR',{fields:['order_id','customer_id','items','payment']});
  const prev=s.orders[b.order_id];if(prev){if(canon(prev.body)!==canon(b))fail(409,'DUPLICATE_ORDER_ID');return [200,prev.response];}
  for(const item of b.items)if(!['var-jersey-001-M','var-jersey-001-L'].includes(item.variant_id))fail(404,'VARIANT_NOT_FOUND');
  if(b.discount_code!=null&&b.discount_code!=='WELCOME10')fail(400,'INVALID_DISCOUNT_CODE');
  for(const item of b.items)if((s.stock[item.variant_id]??0)<item.quantity)fail(409,'OUT_OF_STOCK',{variant_id:item.variant_id});
  if(b.payment.token==='tok_declined')fail(402,'PAYMENT_DECLINED');if(b.payment.token==='tok_capture_fail')fail(402,'PAYMENT_CAPTURE_FAILED');
  const items=b.items.map(x=>({...x,unit_price_minor:450000})),subtotal_minor=items.reduce((n,x)=>n+x.quantity*x.unit_price_minor,0),discount_minor=b.discount_code?Math.floor(subtotal_minor/10):0,total_minor=subtotal_minor-discount_minor;
  for(const item of b.items)s.stock[item.variant_id]-=item.quantity;
  const n=Object.keys(s.orders).length+1,payload={order_id:b.order_id,customer_id:b.customer_id,items,subtotal_minor,discount_minor,total_minor,currency:'PKR',paid_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z')};
  const response={order_id:b.order_id,status:'paid',currency:'PKR',items,subtotal_minor,discount_minor,total_minor,payment:{authorization_id:`auth_${n}`,capture_id:`cap_${n}`,state:'captured'},receipt:{payload,signature:sign(salt,b.order_id,payload),pdf_base64:receiptPdf(b.order_id,total_minor)}};
  s.orders[b.order_id]={body:b,response};return [201,response];
}
module.exports={ApiError,fail,validId,int,canon,sign,baseline,validateSport,score,addEvent,checkout};
