const crypto=require('node:crypto');
const {fail}=require('./domain');
const context={tenant_id:'tenant-alpha',foreign_tenant_id:'tenant-beta',own_league_id:'league-alpha-1',other_league_id:'league-alpha-2',foreign_league_id:'league-beta-1',own_club_id:'club-alpha-1',other_club_id:'club-alpha-2',foreign_club_id:'club-beta-1',own_player_id:'player-alpha-1',other_player_id:'player-alpha-2',foreign_player_id:'player-beta-1'};
const roles=['super_admin','league_organizer','club_manager','player','viewer'];
const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const key=()=>process.env.DAY1_SALT;
function jwt(payload){const head=base64({alg:'HS256',typ:'JWT'}),body=base64(payload),data=`${head}.${body}`,sig=crypto.createHmac('sha256',key()).update(data).digest('base64url');return `${data}.${sig}`;}
function verify(header){
  if(!header?.startsWith('Bearer '))fail(401,'UNAUTHENTICATED');
  const token=header.slice(7),parts=token.split('.');if(parts.length!==3)fail(401,'UNAUTHENTICATED');
  const data=`${parts[0]}.${parts[1]}`,sig=crypto.createHmac('sha256',key()).update(data).digest('base64url');
  if(!sig||sig.length!==parts[2].length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(parts[2])))fail(401,'UNAUTHENTICATED');
  let head,body;try{head=JSON.parse(Buffer.from(parts[0],'base64url'));body=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{fail(401,'UNAUTHENTICATED');}
  if(head.alg!=='HS256'||!roles.includes(body.role)||!Number.isInteger(body.exp)||body.exp<=Math.floor(Date.now()/1000))fail(401,'UNAUTHENTICATED');
  return body.role;
}
function matrix(){const tokens={};for(const role of roles)tokens[role]=jwt({role,tenant_id:role==='super_admin'?null:'tenant-alpha',exp:Math.floor(Date.now()/1000)+3600*4});return [200,{tokens,context}];}
function login(body){const users={
  'admin@nascon.test':'super_admin','organizer@nascon.test':'league_organizer','manager@nascon.test':'club_manager','player@nascon.test':'player','viewer@nascon.test':'viewer'
};
  if(typeof body.email!=='string'||typeof body.password!=='string')fail(400,'VALIDATION_ERROR',{fields:['email','password']});
  const role=users[body.email.toLowerCase()];if(!role||body.password!=='Nascon@26')fail(401,'UNAUTHENTICATED');
  return [200,{token:jwt({role,tenant_id:role==='super_admin'?null:'tenant-alpha',exp:Math.floor(Date.now()/1000)+3600*4}),role,email:body.email.toLowerCase()}];
}
function probe(method,path,auth){
  const defs=[['POST',/^\/audit\/v1\/rbac\/tenants$/,'tenant'],['POST',/^\/audit\/v1\/rbac\/leagues\/([^/]+)\/fixtures$/,'league'],['POST',/^\/audit\/v1\/rbac\/clubs\/([^/]+)\/roster$/,'club_write'],['POST',/^\/audit\/v1\/rbac\/clubs\/([^/]+)\/products$/,'club_write'],['PATCH',/^\/audit\/v1\/rbac\/players\/([^/]+)$/,'player'],['GET',/^\/audit\/v1\/rbac\/clubs\/([^/]+)$/,'club_read'],['GET',/^\/audit\/v1\/rbac\/platform\/config$/,'platform']];
  for(const [verb,pattern,type] of defs){const m=path.match(pattern);if(method!==verb||!m)continue;
    const role=verify(auth),target=m[1];
    const known=type==='league'?['league-alpha-1','league-alpha-2','league-beta-1']:type==='club_write'||type==='club_read'?['club-alpha-1','club-alpha-2','club-beta-1']:type==='player'?['player-alpha-1','player-alpha-2','player-beta-1']:[];
    if(target&&!known.includes(target))fail(404,type==='league'?'LEAGUE_NOT_FOUND':type==='player'?'PLAYER_NOT_FOUND':'CLUB_NOT_FOUND');
    let allowed=role==='super_admin';
    if(!allowed&&target?.includes('-beta-'))fail(403,'FORBIDDEN');
    if(type==='league'&&role==='league_organizer'&&target===context.own_league_id)allowed=true;
    if(type==='club_write'&&role==='club_manager'&&target===context.own_club_id)allowed=true;
    if(type==='player'&&((role==='player'&&target===context.own_player_id)||(role==='club_manager'&&target===context.own_player_id)))allowed=true;
    if(type==='club_read'&&target!==context.foreign_club_id)allowed=true;
    if(!allowed)fail(403,'FORBIDDEN');return [200,{authorized:true}];
  }
  return null;
}
const hits=new Map();
function ping(client){const now=Date.now(),a=(hits.get(client)??[]).filter(t=>now-t<10000);if(a.length>=100){hits.set(client,a);fail(429,'RATE_LIMITED');}a.push(now);hits.set(client,a);return [200,{pong:true}];}
module.exports={matrix,probe,ping,login,verify};
