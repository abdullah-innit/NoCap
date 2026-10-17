const {fail,validId,addEvent,canon}=require('./domain');
const roster=require('./roster');
function version(s,a){if(a.type==='score_event'){const m=s.matches[a.payload.match_id];if(!m)fail(404,'MATCH_NOT_FOUND');return m.events.length;}
  if(a.type==='roster_transfer'){const r=s.rosters[a.payload.league_id];if(!r)fail(404,'LEAGUE_NOT_FOUND');if(!r.players[a.payload.player_id])fail(404,'PLAYER_NOT_FOUND');return s.audit.filter(x=>x.league_id===a.payload.league_id&&x.player_id===a.payload.player_id).length;}
  fail(400,'VALIDATION_ERROR',{fields:['actions.type']});}
function sync(s,b,salt){
  if(!validId(b.device_id)||!Array.isArray(b.actions)||b.actions.length<1||b.actions.length>100||b.actions.some(a=>!validId(a.action_id)||!['score_event','roster_transfer'].includes(a.type)||!Number.isInteger(a.base_version)||a.base_version<0||!a.payload||typeof a.payload!=='object'||Number.isNaN(Date.parse(a.queued_at))))fail(400,'VALIDATION_ERROR',{fields:['device_id','actions']});
  const results=Array(b.actions.length),sorted=b.actions.map((a,index)=>({...a,index})).sort((a,c)=>Date.parse(a.queued_at)-Date.parse(c.queued_at)||a.index-c.index);
  let processed_order=0;
  for(const a of sorted){processed_order++;const recordKey=`${b.device_id}|${a.action_id}`,record=s.offline[recordKey];let status='rejected',resolution='server_wins',error_code=null,signature=null,current=0;
    try{
      current=version(s,a);
      const old=s.eventsById[a.payload.event_id];
      if(record||(a.type==='score_event'&&old&&canon(old.body)===canon(a.payload))){status='duplicate';resolution='skipped_duplicate';}
      else if(a.base_version>current){error_code='INVALID_BASE_VERSION';}
      else{
        const [http,response]=a.type==='score_event'?addEvent(s,a.payload,salt):roster.transfer(s,a.payload);
        if(http===200){status='duplicate';resolution='skipped_duplicate';}
        else{status='applied';resolution=a.base_version<current?'rebased_append':'appended';signature=a.type==='score_event'?response.signature:null;s.offline[recordKey]={type:a.type,payload:a.payload};}
        current=version(s,a);
      }
    }catch(e){error_code=e.code??'INTERNAL_ERROR';try{current=version(s,a);}catch{current=0;}}
    results[a.index]={action_id:a.action_id,status,resolution,error_code,processed_order,server_version:current,signature};
  }
  return [200,{device_id:b.device_id,results,summary:{applied:results.filter(x=>x.status==='applied').length,rejected:results.filter(x=>x.status==='rejected').length,duplicate:results.filter(x=>x.status==='duplicate').length}}];
}
module.exports={sync};
