const crypto=require('node:crypto');
const {fail,validId,int,score}=require('./domain');
const ALL_TIES=['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'];
function createLeague(s,b){
  if(!validId(b.league_id)||!validId(b.sport_id)||!Array.isArray(b.teams)||b.teams.length<2||b.teams.length>40||b.teams.some(x=>!validId(x))||new Set(b.teams).size!==b.teams.length||!Array.isArray(b.fixtures)||!b.qualification||!int(b.qualification.spots,1)||b.qualification.spots>b.teams.length)fail(400,'VALIDATION_ERROR',{fields:['league_id','sport_id','teams','fixtures','qualification']});
  if(!s.sports[b.sport_id])fail(404,'SPORT_NOT_FOUND');
  if(s.leagues[b.league_id])fail(409,'LEAGUE_EXISTS');
  const matchIds=new Set();for(const f of b.fixtures){
    if(!validId(f.match_id)||!b.teams.includes(f.home)||!b.teams.includes(f.away)||f.home===f.away||matchIds.has(f.match_id))fail(400,'VALIDATION_ERROR',{fields:['fixtures']});
    if(s.matches[f.match_id])fail(409,'MATCH_EXISTS');matchIds.add(f.match_id);
  }
  const points=b.points??{win:3,draw:1,loss:0};if(!['win','draw','loss'].every(k=>Number.isInteger(points[k])))fail(400,'VALIDATION_ERROR',{fields:['points']});
  const tie_break_order=b.tie_break_order??s.sports[b.sport_id].tie_break_order??ALL_TIES;
  if(!Array.isArray(tie_break_order)||tie_break_order.some(x=>!ALL_TIES.includes(x))||new Set(tie_break_order).size!==tie_break_order.length)fail(400,'VALIDATION_ERROR',{fields:['tie_break_order']});
  const league={...b,points,tie_break_order, lots_seed:b.lots_seed??s.seed};s.leagues[b.league_id]=league;
  for(const f of b.fixtures)s.matches[f.match_id]={sport_id:b.sport_id,league_id:b.league_id,home:f.home,away:f.away,events:[]};
  return [201,{league_id:b.league_id,status:'created',team_count:b.teams.length,fixture_count:b.fixtures.length}];
}
function standings(s,league_id){
  const l=s.leagues[league_id];if(!l)fail(404,'LEAGUE_NOT_FOUND');
  const sport=s.sports[l.sport_id],table={},h2h={};
  for(const team_id of l.teams){table[team_id]={team_id,played:0,won:0,drawn:0,lost:0,scored:0,conceded:0,diff:0,points:0,fair_play:0,status:'still_possible',resolved_by:null};h2h[team_id]={};}
  for(const a of l.teams)for(const b of l.teams)if(a!==b)h2h[a][b]={played:0,points:0,scored:0,conceded:0};
  const remaining={};for(const team_id of l.teams)remaining[team_id]=0;
  const completed=[];
  for(const fixture of l.fixtures){
    const result=score(s,fixture.match_id);
    if(result.status!=='completed'||result.outcome==='undecided'){remaining[fixture.home]++;remaining[fixture.away]++;continue;}
    completed.push(result);
    const home=table[fixture.home],away=table[fixture.away];home.played++;away.played++;
    home.scored+=result.home.score;home.conceded+=result.away.score;away.scored+=result.away.score;away.conceded+=result.home.score;
    home.fair_play+=result.home.fair_play;away.fair_play+=result.away.fair_play;
    if(result.outcome==='draw'){home.drawn++;away.drawn++;home.points+=l.points.draw;away.points+=l.points.draw;}
    else if(result.outcome==='home_win'){home.won++;away.lost++;home.points+=l.points.win;away.points+=l.points.loss;}
    else{away.won++;home.lost++;away.points+=l.points.win;home.points+=l.points.loss;}
    for(const [t,u,sc,co] of [[fixture.home,fixture.away,result.home.score,result.away.score],[fixture.away,fixture.home,result.away.score,result.home.score]]){
      const row=h2h[t][u];row.played++;row.scored+=sc;row.conceded+=co;row.points+=result.outcome==='draw'?l.points.draw:result.winner_team_id===t?l.points.win:l.points.loss;
    }
  }
  for(const t of l.teams){const x=table[t];x.diff=x.scored-x.conceded;}
  const criterion=(team,group,key)=>{
    if(key==='h2h_points')return group.reduce((n,o)=>n+(h2h[team][o]?.points??0),0);
    if(key==='h2h_diff')return group.reduce((n,o)=>n+(h2h[team][o]?.scored??0)-(h2h[team][o]?.conceded??0),0);
    if(key==='overall_diff')return table[team].diff;
    if(key==='draw_lots')return crypto.createHash('sha256').update(`${l.lots_seed}|${league_id}|${team}`).digest('hex');
    return table[team][key];
  };
  const order=[...l.tie_break_order.filter(x=>x!=='draw_lots'),'draw_lots'];
  const resolve=(group,start=0)=>{
    if(group.length<=1)return group;
    for(let i=start;i<order.length;i++){
      const key=order[i],v=group.map(t=>criterion(t,group,key));if(new Set(v).size===1)continue;
      const values=[...new Set(v)].sort((a,b)=>key==='draw_lots'?String(a).localeCompare(String(b)):b-a);
      const out=[];for(const value of values){const sub=group.filter((t,j)=>v[j]===value);out.push(...(sub.length>1?resolve(sub,0):sub));}
      for(let j=0;j<out.length-1;j++)if(!table[out[j]].resolved_by)table[out[j]].resolved_by=key;
      return out;
    }
    return group;
  };
  const pointsGroups=[...new Set(l.teams.map(t=>table[t].points))].sort((a,b)=>b-a);
  const ordered=pointsGroups.flatMap(p=>resolve(l.teams.filter(t=>table[t].points===p)));
  const k=l.qualification.spots,W=l.points.win;
  for(const t of l.teams){
    const p=table[t].points,max=p+W*remaining[t];
    if(l.teams.filter(o=>o!==t&&table[o].points+W*remaining[o]>=p).length<k)table[t].status='clinched';
    else if(l.teams.filter(o=>o!==t&&table[o].points>max).length>=k)table[t].status='eliminated';
  }
  return [200,{league_id,sport_id:l.sport_id,qualification_spots:k,table:ordered.map((t,i)=>({rank:i+1,...table[t]})),h2h}];
}
module.exports={createLeague,standings};
