const test=require('node:test');
const assert=require('node:assert/strict');
const {baseline,addEvent}=require('./domain');
const {roundRobin,singleElim,swiss,doubleElim}=require('./fixtures');
const {createLeague,standings}=require('./leagues');
const {sync}=require('./offline');
const roster=require('./roster');
const salt='test-only';
test('round robin covers every pair and balances home games',()=>{
  for(let n=2;n<=12;n++){
    const teams=Array.from({length:n},(_,i)=>`t${i}`),r=roundRobin(teams)[1],all=r.rounds.flatMap(x=>x.matches),pairs=new Set(all.map(m=>[m.home,m.away].sort().join('|')));
    assert.equal(all.length,n*(n-1)/2);assert.equal(pairs.size,all.length);
    for(const t of teams)assert.ok(Math.abs(all.filter(m=>m.home===t).length-all.filter(m=>m.away===t).length)<=1);
  }
});
test('single elimination six-team seeding provides two byes',()=>{
  const r=singleElim(['t1','t2','t3','t4','t5','t6'])[1];
  assert.equal(r.bracket_size,8);assert.equal(r.rounds[0].matches.filter(x=>x.bye).length,2);
  assert.equal(r.rounds[0].matches[1].home,'t4');assert.equal(r.rounds[0].matches[1].away,'t5');
});
test('Swiss opening round follows seed order and gives last seed the bye',()=>{
  const r=swiss(['t1','t2','t3','t4','t5'])[1];
  assert.equal(r.bye,'t5');assert.deepEqual(r.pairings.map(x=>[x.home,x.away]),[['t1','t3'],['t2','t4']]);
});
test('double elimination routes winners and losers into a conditional reset',()=>{
  const teams=['t1','t2','t3','t4'];
  const base=doubleElim(teams,{bracket_reset:true})[1];
  assert.equal(base.winners[0].matches.length,2);assert.equal(base.losers.length,2);
  assert.equal(base.grand_final[1].required,null);
  const r=doubleElim(teams,{bracket_reset:true,results:[{match_id:'WR1M1',winner:'t1'},{match_id:'WR1M2',winner:'t2'},{match_id:'LR1M1',winner:'t4'},{match_id:'WR2M1',winner:'t1'},{match_id:'LR2M1',winner:'t4'},{match_id:'GF1',winner:'t4'}]})[1];
  assert.equal(r.grand_final[0].home,'t1');assert.equal(r.grand_final[0].away,'t4');assert.equal(r.grand_final[1].required,true);
});
test('completed events update standings and offline duplicate is skipped',()=>{
  const s=baseline();createLeague(s,{league_id:'lg1',sport_id:'football',teams:['a','b'],fixtures:[{match_id:'m1',home:'a',away:'b'}],qualification:{spots:1}});
  const send=(event_id,type,payload)=>addEvent(s,{event_id,match_id:'m1',type,payload},salt);
  send('e1','match_start',{});send('e2','score',{team_id:'a',event_type:'goal'});send('e3','match_end',{});
  assert.equal(standings(s,'lg1')[1].table[0].team_id,'a');
  const body={device_id:'dev1',actions:[{action_id:'a1',type:'score_event',queued_at:'2026-10-17T11:00:00Z',base_version:3,payload:{event_id:'e4',match_id:'m1',type:'compensation',payload:{compensates:'e2',reason:'correction'}}}]};
  assert.equal(sync(s,body,salt)[1].results[0].status,'applied');
  assert.equal(sync(s,body,salt)[1].results[0].status,'duplicate');
  assert.equal(standings(s,'lg1')[1].table[0].points,1);
});
test('roster loan returns once after its end date and keeps an audit trail',()=>{
  const s=baseline();roster.setup(s,{league:{league_id:'rl',tenant_id:'tenant-alpha',sport_id:'football',transfer_window:{open:'2026-09-01',close:'2026-09-30'},max_squad_size:3,required_positions:{}},squads:[{squad_id:'a',club_id:'ca',tenant_id:'tenant-alpha',name:'A'},{squad_id:'b',club_id:'cb',tenant_id:'tenant-alpha',name:'B'}],players:[{player_id:'p1',name:'Ali',position:'df',squad_id:'a',role:'starter'}],matches_in_progress:[]});
  const body={request_id:'r1',league_id:'rl',player_id:'p1',type:'loan',from_squad_id:'a',to_squad_id:'b',effective_date:'2026-09-15',loan_end_date:'2026-09-20',reason:'Demo',requested_by:'manager'};
  assert.equal(roster.transfer(s,body)[0],201);assert.equal(roster.transfer(s,body)[0],200);
  const h=roster.history(s,'p1','2026-09-21')[1];assert.equal(h.current_squad_id,'a');assert.equal(h.history.length,2);assert.equal(h.history[1].effective_date,'2026-09-21');
  assert.equal(roster.history(s,'p1','2026-09-21')[1].history.length,2);
});
