const {fail,validId,int,canon}=require('./domain');
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(`${x}T00:00:00Z`));
const now=()=>new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
const audit=(s,action,player_id,league_id,from_squad_id,to_squad_id,effective_date,state,who,why)=>({audit_id:`au-${String(s.audit.length+1).padStart(4,'0')}`,action,player_id,league_id,from_squad_id,to_squad_id,effective_date,state,who,when:now(),why});
function setup(s,b){
  const l=b.league;if(!l||!validId(l.league_id)||!validId(l.tenant_id)||!validId(l.sport_id)||!s.sports[l.sport_id]||!l.transfer_window||!date(l.transfer_window.open)||!date(l.transfer_window.close)||l.transfer_window.open>l.transfer_window.close||!Array.isArray(b.squads)||!Array.isArray(b.players)||!Array.isArray(b.matches_in_progress??[]))fail(400,'VALIDATION_ERROR',{fields:['league','squads','players']});
  const squadIds=new Set(),players={};for(const q of b.squads){if(!validId(q.squad_id)||!validId(q.club_id)||!validId(q.tenant_id)||squadIds.has(q.squad_id))fail(400,'VALIDATION_ERROR',{fields:['squads']});squadIds.add(q.squad_id);}
  for(const p of b.players){if(!validId(p.player_id)||!validId(p.squad_id)||!squadIds.has(p.squad_id)||players[p.player_id]||!['captain','vice_captain','starter','substitute'].includes(p.role))fail(400,'VALIDATION_ERROR',{fields:['players']});players[p.player_id]={...p,parent_squad_id:null,loan_end_date:null,registration_type:'initial'};}
  const league={...l,max_squad_size:l.max_squad_size??s.sports[l.sport_id].roster.max_squad_size,required_positions:l.required_positions??s.sports[l.sport_id].roster.required_positions};
  s.audit=s.audit.filter(x=>x.league_id!==l.league_id);
  for(const [key,value] of Object.entries(s.transfers))if(value.body.league_id===l.league_id)delete s.transfers[key];
  s.rosters[l.league_id]={league,squads:Object.fromEntries(b.squads.map(q=>[q.squad_id,q])),players,matches_in_progress:b.matches_in_progress??[]};
  const squad_counts={};for(const q of b.squads)squad_counts[q.squad_id]=Object.values(players).filter(p=>p.squad_id===q.squad_id).length;
  return [201,{league_id:l.league_id,status:'configured',squad_counts}];
}
function transfer(s,b){
  const fields=[];for(const k of ['request_id','league_id','player_id','from_squad_id','requested_by'])if(!validId(b[k]))fields.push(k);
  if(!['transfer','loan','release'].includes(b.type))fields.push('type');
  if(b.type!=='release'&&!validId(b.to_squad_id))fields.push('to_squad_id');
  if(!date(b.effective_date))fields.push('effective_date');
  if(b.type==='loan'&&(!date(b.loan_end_date)||b.loan_end_date<=b.effective_date))fields.push('loan_end_date');
  if(fields.length)fail(400,'VALIDATION_ERROR',{fields});
  const prev=s.transfers[b.request_id];if(prev){if(canon(prev.body)!==canon(b))fail(409,'DUPLICATE_REQUEST_ID');return [200,prev.response];}
  const r=s.rosters[b.league_id];if(!r)fail(404,'LEAGUE_NOT_FOUND');
  const p=r.players[b.player_id];if(!p)fail(404,'PLAYER_NOT_FOUND');
  const from=r.squads[b.from_squad_id],to=b.type==='release'?null:r.squads[b.to_squad_id];if(!from||b.type!=='release'&&!to)fail(404,'SQUAD_NOT_FOUND');
  if(from.tenant_id!==r.league.tenant_id||to&&to.tenant_id!==r.league.tenant_id)fail(409,'CROSS_TENANT_TRANSFER');
  if(p.squad_id!==b.from_squad_id)fail(409,'NOT_IN_SQUAD');
  if(b.type!=='release'&&(b.effective_date<r.league.transfer_window.open||b.effective_date>r.league.transfer_window.close))fail(409,'TRANSFER_WINDOW_CLOSED');
  if(p.parent_squad_id)fail(409,'PLAYER_ON_LOAN');
  if(to&&Object.values(r.players).filter(x=>x.squad_id===to.squad_id).length+1>r.league.max_squad_size)fail(409,'SQUAD_FULL');
  if(Object.values(r.players).filter(x=>x.squad_id===from.squad_id&&x.position===p.position).length-1<(r.league.required_positions[p.position]??0))fail(409,'MIN_POSITION_VIOLATION');
  const match=r.matches_in_progress.find(x=>x.home_squad_id===from.squad_id||x.away_squad_id===from.squad_id),state=match?'deferred_until_match_end':'active';
  const fromId=p.squad_id;p.squad_id=to?.squad_id??null;p.parent_squad_id=b.type==='loan'?fromId:null;p.loan_end_date=b.type==='loan'?b.loan_end_date:null;p.registration_type=b.type;p.role='substitute';
  const entry=audit(s,b.type,b.player_id,b.league_id,fromId,p.squad_id,b.effective_date,state,b.requested_by,b.reason??'');s.audit.push(entry);
  const registration=b.type==='release'?null:{player_id:b.player_id,league_id:b.league_id,squad_id:p.squad_id,parent_squad_id:p.parent_squad_id,registration_type:b.type,start_date:b.effective_date,loan_end_date:p.loan_end_date,role:p.role};
  const response={request_id:b.request_id,status:'accepted',state,blocking_match_id:match?.match_id??null,registration,audit_entry:entry};s.transfers[b.request_id]={body:b,response};return [201,response];
}
function history(s,player_id,as_of){
  if(as_of&&!date(as_of))fail(400,'VALIDATION_ERROR',{fields:['as_of']});const today=as_of??new Date().toISOString().slice(0,10);
  let found;for(const [league_id,r] of Object.entries(s.rosters))if(r.players[player_id]){found={league_id,r,p:r.players[player_id]};break;}
  if(!found)fail(404,'PLAYER_NOT_FOUND');const {league_id,p}=found;
  if(p.parent_squad_id&&today>p.loan_end_date){const returnDate=new Date(Date.parse(`${p.loan_end_date}T00:00:00Z`)+86400000).toISOString().slice(0,10);const entry=audit(s,'loan_return',player_id,league_id,p.squad_id,p.parent_squad_id,returnDate,'active','system','Loan completed');s.audit.push(entry);p.squad_id=p.parent_squad_id;p.parent_squad_id=null;p.loan_end_date=null;p.registration_type='transfer';p.role='substitute';}
  return [200,{player_id,as_of:today,league_id,current_squad_id:p.squad_id,parent_squad_id:p.parent_squad_id,history:s.audit.filter(x=>x.player_id===player_id&&x.league_id===league_id)}];
}
module.exports={setup,transfer,history};
