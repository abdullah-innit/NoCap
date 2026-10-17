const {fail,validId,int}=require('./domain');
function validate(format,teams,min,max){if(!Array.isArray(teams)||teams.length<min||teams.length>max||teams.some(t=>!validId(t))||new Set(teams).size!==teams.length)fail(400,'VALIDATION_ERROR',{fields:['teams']});}
function roundRobin(teams,p={}){
  validate('round_robin',teams,2,40);const legs=p.legs??1;if(![1,2].includes(legs)||!Array.isArray(p.withdrawals??[]))fail(400,'VALIDATION_ERROR',{fields:['params']});
  const n=teams.length,list=n%2?[...teams,null]:[...teams],half=list.length/2,rounds=[];
  for(let leg=1;leg<=legs;leg++){
    let a=[...list];for(let local=1;local<list.length;local++){
      const round=(leg-1)*(list.length-1)+local,matches=[],byes=[];
      for(let i=0;i<half;i++){
        const x=a[i],y=a[list.length-1-i];if(x===null||y===null){byes.push(x??y);continue;}
        const N=n%2?n:n+1,xi=teams.indexOf(x),yi=teams.indexOf(y);
        let home=((yi-xi+N)%N)<=Math.floor(N/2)?x:y,away=home===x?y:x;
        if(leg===2)[home,away]=[away,home];
        matches.push({match_id:`RR-L${leg}-R${round}-M${matches.length+1}`,leg,home,away,status:'scheduled',awarded_to:null});
      }
      rounds.push({round,matches,byes});a=[a[0],a.at(-1),...a.slice(1,-1)];
    }
  }
  for(const w of p.withdrawals??[])if(!teams.includes(w.team_id)||!int(w.after_round)||w.after_round>rounds.length)fail(400,'VALIDATION_ERROR',{fields:['params.withdrawals']});
  const policy=p.withdrawal_policy??'forfeit_remaining';if(!['forfeit_remaining','void_all'].includes(policy))fail(400,'VALIDATION_ERROR',{fields:['params.withdrawal_policy']});
  const withdrawn=t=>p.withdrawals?.find(w=>w.team_id===t);
  for(const r of rounds)for(const m of r.matches){const h=withdrawn(m.home),a=withdrawn(m.away);if(policy==='void_all'&&(h||a)){m.status='voided';continue;}
    const hd=h&&r.round>h.after_round,ad=a&&r.round>a.after_round;if(hd&&ad)m.status='voided';else if(hd||ad){m.status='forfeit';m.awarded_to=hd?m.away:m.home;}}
  const flat=rounds.flatMap(r=>r.matches),summary={total:flat.length,scheduled:flat.filter(m=>m.status==='scheduled').length,forfeit:flat.filter(m=>m.status==='forfeit').length,voided:flat.filter(m=>m.status==='voided').length};
  return [200,{format:'round_robin',legs,team_count:n,round_count:rounds.length,rounds,summary}];
}
const seedOrder=n=>n===2?[1,2]:seedOrder(n/2).flatMap(s=>[s,n+1-s]);
function swiss(teams,p={}){
  validate('swiss',teams,2,64);
  const n=teams.length,total_rounds=p.total_rounds??Math.ceil(Math.log2(n)),round=p.round??1,history=p.history??[];
  if(!int(total_rounds,1)||total_rounds>n-1||!int(round,1)||round>total_rounds||!Array.isArray(history)||history.length!==round-1||history.some((h,i)=>h.round!==i+1||!Array.isArray(h.matches)))fail(400,'VALIDATION_ERROR',{fields:['params']});
  const scores=Object.fromEntries(teams.map(t=>[t,0])),opponents=Object.fromEntries(teams.map(t=>[t,[]])),met=new Set(),byeTeams=new Set();
  for(const h of history){
    if(h.bye!=null){if(!teams.includes(h.bye)||byeTeams.has(h.bye))fail(400,'VALIDATION_ERROR',{fields:['params.history']});scores[h.bye]+=1;byeTeams.add(h.bye);}
    const used=new Set(h.bye?[h.bye]:[]);
    for(const m of h.matches){if(!teams.includes(m.home)||!teams.includes(m.away)||m.home===m.away||used.has(m.home)||used.has(m.away)||!['home','away','draw'].includes(m.result))fail(400,'VALIDATION_ERROR',{fields:['params.history']});
      used.add(m.home);used.add(m.away);const key=[m.home,m.away].sort().join('|');if(met.has(key))fail(400,'VALIDATION_ERROR',{fields:['params.history']});met.add(key);
      opponents[m.home].push(m.away);opponents[m.away].push(m.home);
      if(m.result==='draw'){scores[m.home]+=.5;scores[m.away]+=.5;}else scores[m.result==='home'?m.home:m.away]+=1;
    }
    if(used.size!==n)fail(400,'VALIDATION_ERROR',{fields:['params.history']});
  }
  const buchholz=Object.fromEntries(teams.map(t=>[t,opponents[t].reduce((a,o)=>a+scores[o],0)]));
  const ordered=[...teams].sort((a,b)=>scores[b]-scores[a]||buchholz[b]-buchholz[a]||teams.indexOf(a)-teams.indexOf(b));
  const standings=ordered.map((team_id,i)=>({rank:i+1,team_id,score:scores[team_id],buchholz:buchholz[team_id]}));
  let bye=null,pairs=[];
  if(round===1){const m=Math.floor(n/2);if(n%2)bye=teams[n-1];for(let i=0;i<m;i++)pairs.push([teams[i],teams[i+m]]);}
  else{
    const candidates=n%2?teams.filter(t=>!byeTeams.has(t)).sort((a,b)=>scores[a]-scores[b]||teams.indexOf(b)-teams.indexOf(a)):[null];
    for(const candidate of candidates){
      const remaining=ordered.filter(t=>t!==candidate),memo=new Map();
      const solve=(list)=>{
        if(!list.length)return {cost:0,pairs:[]};const key=list.join('|');if(memo.has(key))return memo.get(key);
        const first=list[0];let best=null;
        for(let j=1;j<list.length;j++){const second=list[j];if(met.has([first,second].sort().join('|')))continue;
          const rest=list.slice(1,j).concat(list.slice(j+1)),found=solve(rest);if(!found)continue;
          const cost=found.cost+Math.abs(scores[first]-scores[second]);if(!best||cost<best.cost)best={cost,pairs:[[first,second],...found.pairs]};
        }
        memo.set(key,best);return best;
      };
      const found=solve(remaining);if(found){bye=candidate;pairs=found.pairs;break;}
    }
    if(!pairs.length)fail(409,'NO_VALID_PAIRING',{round});
  }
  const pairings=pairs.map(([home,away],i)=>({match_id:`SW-R${round}-M${i+1}`,home,away}));
  return [200,{format:'swiss',round,total_rounds,pairings,bye,standings}];
}
function singleElim(teams,p={}){
  validate('single_elim',teams,2,128);const B=2**Math.ceil(Math.log2(teams.length)),k=Math.log2(B),rounds=[],all={};
  const make=(round,index,bracket='main')=>({match_id:`R${round}M${index}`,bracket,round,index,home:null,away:null,home_seed:null,away_seed:null,bye:false,winner:null,loser:null,winner_to:round<k?{match_id:`R${round+1}M${Math.ceil(index/2)}`,slot:index%2?'home':'away'}:null,loser_to:null});
  for(let r=1;r<=k;r++){const matches=Array.from({length:B/2**r},(_,i)=>make(r,i+1));rounds.push({round:r,matches});for(const m of matches)all[m.match_id]=m;}
  const order=seedOrder(B);for(let i=0;i<B/2;i++){const m=rounds[0].matches[i],a=order[i*2],b=order[i*2+1];m.home_seed=a;m.away_seed=b;m.home=teams[a-1]??null;m.away=teams[b-1]??null;if(!m.away){m.bye=true;m.winner=m.home;}}
  const propagate=()=>{for(let r=0;r<rounds.length;r++)for(const m of rounds[r].matches)if(m.winner&&m.winner_to)all[m.winner_to.match_id][m.winner_to.slot]=m.winner;};propagate();
  for(const result of p.results??[]){const m=all[result.match_id];if(!m||![m.home,m.away].includes(result.winner))fail(400,'VALIDATION_ERROR',{fields:['params.results']});m.winner=result.winner;m.loser=m.home===result.winner?m.away:m.home;propagate();}
  if(p.third_place_match){const semi=rounds.at(-2)?.matches??[];const tp={match_id:'TP',bracket:'third_place',round:k,index:1,home:semi[0]?.loser??null,away:semi[1]?.loser??null,home_seed:null,away_seed:null,bye:false,winner:null,loser:null,winner_to:null,loser_to:null};
    for(let i=0;i<semi.length;i++)semi[i].loser_to={match_id:'TP',slot:i?'away':'home'};rounds.push({round:k+1,matches:[tp]});}
  return [200,{format:'single_elim',bracket_size:B,rounds}];
}
function doubleElim(teams,p={}){
  validate('double_elim',teams,3,128);const B=2**Math.ceil(Math.log2(teams.length)),k=Math.log2(B),reset=p.bracket_reset??false;
  if(typeof reset!=='boolean'||!Array.isArray(p.results??[]))fail(400,'VALIDATION_ERROR',{fields:['params']});
  const winners=[],losers=[],all={};
  const make=(match_id,bracket,round,index)=>({match_id,bracket,round,index,home:null,away:null,home_seed:null,away_seed:null,bye:false,winner:null,loser:null,winner_to:null,loser_to:null});
  for(let r=1;r<=k;r++){const matches=Array.from({length:B/2**r},(_,i)=>make(`WR${r}M${i+1}`,'winners',r,i+1));winners.push({round:r,matches});for(const m of matches)all[m.match_id]=m;}
  for(let r=1;r<=2*(k-1);r++){const j=Math.ceil(r/2),matches=Array.from({length:B/2**(j+1)},(_,i)=>make(`LR${r}M${i+1}`,'losers',r,i+1));losers.push({round:r,matches});for(const m of matches)all[m.match_id]=m;}
  const gf1=make('GF1','grand_final',1,1),gf2=reset?make('GF2','grand_final',2,1):null;all.GF1=gf1;if(gf2)all.GF2=gf2;
  if(gf2){gf2.conditional=true;gf2.required=null;}
  for(let r=1;r<=k;r++)for(const m of winners[r-1].matches){
    const i=m.index;
    m.winner_to=r<k?{match_id:`WR${r+1}M${Math.ceil(i/2)}`,slot:i%2?'home':'away'}:{match_id:'GF1',slot:'home'};
    m.loser_to=r===1?{match_id:`LR1M${Math.ceil(i/2)}`,slot:i%2?'home':'away'}:{match_id:`LR${2*r-2}M${i}`,slot:'away'};
  }
  for(let r=1;r<=2*(k-1);r++)for(const m of losers[r-1].matches){
    const i=m.index;if(r===2*(k-1))m.winner_to={match_id:'GF1',slot:'away'};
    else if(r%2)m.winner_to={match_id:`LR${r+1}M${i}`,slot:'home'};
    else m.winner_to={match_id:`LR${r+1}M${Math.ceil(i/2)}`,slot:i%2?'home':'away'};
  }
  const order=seedOrder(B);for(let i=0;i<B/2;i++){const m=winners[0].matches[i],a=order[2*i],b=order[2*i+1];m.home_seed=a;m.away_seed=b;m.home=teams[a-1]??null;m.away=teams[b-1]??null;if(!m.away){m.bye=true;m.winner=m.home;}}
  const route=(m)=>{if(m.winner&&m.winner_to)all[m.winner_to.match_id][m.winner_to.slot]=m.winner;if(m.loser&&m.loser_to)all[m.loser_to.match_id][m.loser_to.slot]=m.loser;};
  for(const m of winners[0].matches)route(m);
  let todo=[...(p.results??[])];for(let pass=0;pass<=todo.length&&todo.length;pass++){
    const next=[];let changed=false;
    for(const result of todo){const m=all[result.match_id];if(!m||m.bye||m.winner)fail(400,'VALIDATION_ERROR',{fields:['params.results']});
      if(!m.home||!m.away){next.push(result);continue;}
      if(![m.home,m.away].includes(result.winner))fail(400,'VALIDATION_ERROR',{fields:['params.results']});
      m.winner=result.winner;m.loser=m.home===result.winner?m.away:m.home;route(m);changed=true;
      if(m.match_id==='GF1'&&gf2){gf2.home=gf1.home;gf2.away=gf1.away;gf2.required=m.winner===gf1.away;}
    }
    if(!changed&&next.length)fail(400,'VALIDATION_ERROR',{fields:['params.results']});todo=next;
  }
  return [200,{format:'double_elim',bracket_size:B,bracket_reset:reset,winners,losers,grand_final:gf2?[gf1,gf2]:[gf1]}];
}
function fixtures(b){if(!b||typeof b!=='object')fail(400,'VALIDATION_ERROR',{fields:['body']});
  if(b.format==='round_robin')return roundRobin(b.teams,b.params);
  if(b.format==='swiss')return swiss(b.teams,b.params);
  if(b.format==='single_elim')return singleElim(b.teams,b.params);
  if(b.format==='double_elim')return doubleElim(b.teams,b.params);
  fail(400,'VALIDATION_ERROR',{fields:['format']});
}
module.exports={fixtures,roundRobin,singleElim,swiss,doubleElim};
