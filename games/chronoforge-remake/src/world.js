// The continent is one continuous coordinate space. All artwork and geometry
// here are newly authored for The Unwritten Hour.
export const WORLD_W = 3200;
export const WORLD_H = 1920;
export const NAV_SIZE = 16;

const pal = (ground, dark, light, road, stone, leaf, water, accent) => ({ground,dark,light,road,stone,leaf,water,accent});
export const REGIONS = [
  {id:'haventide',name:'Haventide',subtitle:'A harbor worth coming home to',x:0,y:640,w:800,h:640,tier:1,palette:pal('#536c48','#3e5139','#708458','#b69f76','#778879','#3c6952','#294e65','#e3b565'),town:{id:'haventide',name:'Haventide',x:400,y:960}},
  {id:'emberline',name:'Emberline',subtitle:'The road remembers the heat',x:800,y:640,w:800,h:640,tier:2,palette:pal('#a47656','#785840','#bd9069','#d0ae7c','#916f64','#676440','#573f56','#f4ac62'),town:{id:'emberline',name:'Emberline',x:1200,y:960}},
  {id:'orbital',name:'Orbital Reach',subtitle:'Where the sky fell to earth',x:1600,y:640,w:800,h:640,tier:3,palette:pal('#626b80','#484a63','#818997','#adb2b0','#879199','#4c6573','#36495f','#87d8dd'),town:{id:'orbital',name:'Orbital Reach',x:2000,y:960}},
  {id:'crown',name:'Last Crown',subtitle:'A future held behind glass',x:2400,y:640,w:800,h:640,tier:4,palette:pal('#6b526d','#493b57','#89718b','#b49ca5','#8c899b','#69607e','#47374f','#eea5dc'),town:{id:'crown',name:'Last Crown',x:2800,y:960}},
  {id:'crater',name:'Crater Ember',subtitle:'The first broken hour',x:800,y:0,w:800,h:640,tier:2,palette:pal('#615052','#413b45','#7c6060','#a8826b','#635e69','#776249','#df6945','#ffc37a')},
  {id:'frost',name:'Frost Canyon',subtitle:'The promise beneath the ice',x:1600,y:0,w:800,h:640,tier:3,palette:pal('#99b0b5','#6f8896','#c5d5cf','#d6d9c6','#8b9caa','#63898b','#3e718b','#b5f0ed')},
  {id:'forest',name:'Forest Veil',subtitle:'Even ruins can take root',x:0,y:1280,w:800,h:640,tier:1,palette:pal('#385a46','#294638','#587450','#9b9366','#677369','#285747','#294d51','#b8cf7c')},
  {id:'mire',name:'Mire Bog',subtitle:'What the marsh would not bury',x:800,y:1280,w:800,h:640,tier:2,palette:pal('#546257','#394744','#748075','#a49b79','#7b7c78','#426859','#354951','#c4c889')},
];
export const TOWNS = REGIONS.filter(r=>r.town).map(r=>({...r.town,region:r.id,tier:r.tier}));
export const INTERIORS = {};
export const OBJECTS = [];
function add(type,id,region,x,y,name,extra={}) { const o={type,id,region,x,y,name,...extra}; OBJECTS.push(o); return o; }

const serviceNames={inn:'Lantern Inn',shop:'Supply House',smith:'Wayfarer Smithy',archive:'Memory Archive'};
const keepers={haventide:['Mara','Pip','Brann','Edda'],emberline:['Saff','Dara','Tovan','Sera'],orbital:['Lune','Otis','Nix','Echo'],crown:['Ari','Finch','Sol','Mina']};
const serviceX=[112,268,532,688];
for (const r of REGIONS.filter(r=>r.town)) {
  ['inn','shop','smith','archive'].forEach((service,i)=> {
    const id=`${r.id}_${service}`;
    add('door',`door_${id}`,r.id,r.x+serviceX[i],r.y+270,serviceNames[service],{interior:id,service,tier:r.tier});
    INTERIORS[id]={id,name:`${r.town.name} · ${serviceNames[service]}`,service,town:r.id,region:r.id,tier:r.tier,w:720,h:480,objects:[
      {id:`exit_${id}`,type:'door',x:360,y:428,name:'Return to town',exit:true,region:r.id},
      {id:`keeper_${id}`,type:'npc',x:365,y:186,name:keepers[r.id][i],service,tier:r.tier,region:r.id},
      {id:`note_${id}`,type:'sign',x:584,y:300,name:service==='archive'?'Recovered folio':service==='inn'?'Guest book':service==='smith'?'Smithing notes':'Supply ledger',service:`${service}_note`,region:r.id},
    ]};
  });
}
add('hall','haventide_hall','haventide',400,910,'Commons Hall',{plot:-1});
add('npc','mayor','haventide',440,1008,'Nera · harbor steward');
add('npc','lio','haventide',345,1008,'Lio · ferry mechanic');
add('npc','worker','haventide',160,1034,'Tess · commons builder');
add('sign','ferry_memorial','haventide',60,980,'The evacuation bell');
add('sign','haven_sign','haventide',672,989,'East: Emberline · South: Forest Veil');
const plots=[[105,1100],[270,1100],[530,1100],[695,1100],[190,1212],[400,1212],[610,1212]];
plots.forEach(([x,y],i)=>add('plot',`plot_${i}`,'haventide',x,y,`Commons plot ${i+1}`,{plot:i}));
add('npc','ember_guide','emberline',1234,1023,'Dara · caravan keeper');
add('npc','orbital_sentinel','orbital',2050,1009,'Relay sentinel');
add('npc','crown_refugee','crown',2660,1018,'Mina · crown refugee');
add('sign','ember_sign','emberline',1160,984,'North: Crater Ember · South: Mire Bog');
add('sign','orbital_sign','orbital',1960,985,'North: Frost Canyon · East: Last Crown');
add('npc','forest_courier','forest',220,1660,'Tavi · stranded courier',{quest:'courier'});
add('npc','mire_rescue','mire',1012,1516,'Asha · marsh researcher',{quest:'researcher'});
add('npc','crater_miner','crater',1100,155,'Orren · trapped miner',{quest:'miner'});
add('npc','frost_scout','frost',2225,493,'Lyra · lost scout',{quest:'scout'});
add('sign','forest_shrine','forest',615,1468,'The green clock');
add('sign','crater_record','crater',1440,590,'Black-box recorder');
add('sign','frost_record','frost',1744,177,'The sentinel oath');
add('sign','orbital_console','orbital',2300,1145,'Elevator control');

function encounter(id,region,x,y,name,enemies,boss=false) {return add('encounter',id,region,x,y,name,{enemies,boss});}
encounter('road_scrappers','haventide',735,952,'Rusted road patrol',['scrapper','rat']);
encounter('forest_pack','forest',430,1585,'The tangled path',['hound','hound']);
encounter('mire_patrol','mire',1100,1670,'Marsh watchers',['stalker','stalker']);
encounter('mire_guardian','mire',1300,1650,'The Drowned Warden',['warden'],true);
encounter('crater_patrol','crater',1015,453,'Cinder quarry',['golem','rat']);
encounter('crater_guardian','crater',1290,260,'The Ember Lord',['emberlord'],true);
encounter('frost_pack','frost',1830,445,'Canyon pack',['wolf','wolf']);
encounter('frost_guardian','frost',2070,260,'The Frost Colossus',['colossus'],true);
encounter('orbital_patrol','orbital',2225,1044,'Broken relay',['drone','wraith']);
encounter('crown_gate','crown',2840,1080,'The Architect’s herald',['herald','wraith']);
// Optional patrols restore the remaining original creature identities without
// adding story gates or occupying the central travel corridors.
encounter('ember_gravbot','emberline',1360,1050,'The abandoned gravity rig',['gravbot']);
encounter('mire_hulk_roam','mire',1000,1610,'A shadow in the reed beds',['mire_hulk']);
encounter('orbital_cultist','orbital',1780,1020,'The neon witness',['neon_cultist']);
encounter('crater_sandworm','crater',1100,565,'The shifting cinder nest',['sandworm_hatchling']);
encounter('frost_revenant_patrol','frost',2230,320,'The oathless revenant',['frost_revenant']);
encounter('crater_behemoth','crater',1350,580,'The furnace’s last beast',['magma_behemoth']);
add('anchor','anchor_mire','mire',1410,1730,'Anchor of Remembrance',{encounter:'mire_guardian',flag:'anchor_mire'});
add('anchor','anchor_ember','crater',1410,196,'Anchor of Courage',{encounter:'crater_guardian',flag:'anchor_ember'});
add('anchor','anchor_frost','frost',2190,187,'Anchor of Promise',{encounter:'frost_guardian',flag:'anchor_frost'});
add('door','door_crown_spire','crown',3035,1150,'Chronoforge spire',{interior:'crown_spire',service:'spire',requires:['anchor_mire','anchor_ember','anchor_frost','truth']});
INTERIORS.crown_spire={id:'crown_spire',name:'The Chronoforge · The Unwritten Hour',service:'spire',town:'crown',region:'crown',tier:4,w:720,h:480,objects:[
  {id:'exit_crown_spire',type:'door',x:360,y:428,name:'Return to Last Crown',exit:true,region:'crown'},
  {id:'architect',type:'encounter',x:494,y:236,name:'The Void Architect',region:'crown',enemies:['architect'],boss:true},
  {id:'chronoforge',type:'anchor',x:360,y:162,name:'The living reference clock',region:'crown',encounter:'architect',flag:'ending'},
]};
[
 ['haven_cache','haventide',640,1160],['forest_cache','forest',622,1770],['mire_cache','mire',1000,1810],
 ['ember_cache','emberline',1470,1230],['crater_cache','crater',960,165],['frost_cache','frost',2280,575],
 ['orbital_cache','orbital',1780,1160],['crown_cache','crown',2520,1170],
].forEach(([id,region,x,y])=>add('chest',id,region,x,y,'Salvage cache'));

export function regionAt(x,y) {return REGIONS.find(r=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h)||null;}
export function getObjects(s) {
  if(s.party.interior) return INTERIORS[s.party.interior]?.objects||[];
  return OBJECTS.map(o=>o.type==='plot'?{...o,building:s.settlement?.plots?.[o.plot]||null}:o);
}

// Terrain silhouettes are intentionally composed, not randomly scattered.
export const TERRAIN_FEATURES = [
  {region:'haventide',type:'water',points:[[0,0],[265,0],[265,32],[190,32],[190,84],[122,84],[122,140],[68,140],[68,228],[0,228]]},
  {region:'haventide',type:'water',points:[[0,450],[42,450],[42,520],[75,520],[75,640],[0,640]]},
  {region:'emberline',type:'water',points:[[540,425],[688,425],[688,454],[742,454],[742,520],[686,520],[686,550],[554,550],[554,520],[508,520],[508,457],[540,457]]},
  {region:'forest',type:'water',points:[[38,380],[130,380],[130,408],[193,408],[193,474],[155,474],[155,532],[80,532],[80,550],[25,550],[25,426],[38,426]]},
  {region:'mire',type:'water',points:[[40,380],[105,380],[105,415],[162,415],[162,462],[118,462],[118,500],[22,500],[22,448],[40,448]]},
  {region:'mire',type:'water',points:[[450,72],[626,72],[626,103],[736,103],[736,190],[704,190],[704,236],[580,236],[580,199],[464,199],[464,151],[450,151]]},
  {region:'crater',type:'lava',points:[[470,352],[684,352],[684,385],[760,385],[760,493],[720,493],[720,554],[598,554],[598,520],[494,520],[494,465],[446,465],[446,400],[470,400]]},
  {region:'crater',type:'crag',points:[[35,28],[270,28],[270,63],[314,63],[314,104],[266,104],[266,128],[102,128],[102,182],[35,182]]},
  {region:'frost',type:'water',points:[[506,360],[650,360],[650,390],[741,390],[741,429],[692,429],[692,446],[560,446],[560,412],[506,412]]},
  {region:'frost',type:'crag',points:[[28,26],[215,26],[215,62],[282,62],[282,108],[233,108],[233,127],[70,127],[70,168],[28,168]]},
  {region:'orbital',type:'water',points:[[24,410],[94,410],[94,440],[142,440],[142,546],[100,546],[100,603],[24,603]]},
  {region:'crown',type:'water',points:[[36,404],[184,404],[184,434],[222,434],[222,479],[185,479],[185,509],[35,509]]},
];

function inPoly(x,y,points) { let inside=false; for(let i=0,j=points.length-1;i<points.length;j=i++) {const a=points[i],b=points[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;} return inside; }
export function onRoad(r,x,y,margin=0) {
  const lx=x-r.x,ly=y-r.y;
  if(Math.abs(ly-320)<42+margin || Math.abs(lx-400)<37+margin)return true;
  if(r.town&&ly>235&&ly<336&&lx>55&&lx<745)return true;
  if(r.id==='haventide'&&ly>400&&ly<625&&lx>65&&lx<735)return true;
  return false;
}
function reserved(r,x,y,rad=0) {
  if(onRoad(r,x,y,rad+20))return true;
  return OBJECTS.some(o=>o.region===r.id&&Math.abs(o.x-x)<78+rad&&Math.abs(o.y-y)<72+rad);
}
let seed=972143;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
export const SCENERY=[];
for(const r of REGIONS) {
  const woodland=['forest','haventide','mire'].includes(r.id);
  const anchors=woodland?[[72,70],[660,60],[85,210],[700,195],[80,540],[715,555],[280,570],[555,510]]:[[80,60],[650,75],[60,205],[735,540],[225,535],[560,565]];
  for(const [cx,cy] of anchors) for(let i=0;i<(woodland?12:7);i++) {
    const x=r.x+cx+(rand()-.5)*145,y=r.y+cy+(rand()-.5)*125;
    if(x<r.x+18||x>r.x+782||y<r.y+24||y>r.y+620||reserved(r,x,y,8))continue;
    if(TERRAIN_FEATURES.some(f=>f.region===r.id&&inPoly(x-r.x,y-r.y,f.points)))continue;
    const type=woodland?(rand()<.8?'tree':'rock'):r.id==='frost'?(rand()<.55?'pine':'crystal'):r.id==='crown'?(rand()<.45?'spire':'tree'):r.id==='orbital'?(rand()<.45?'ruin':'crystal'):rand()<.62?'rock':'cactus';
    SCENERY.push({type,region:r.id,x:Math.round(x/2)*2,y:Math.round(y/2)*2,size:.72+rand()*.5,variant:Math.floor(rand()*4)});
  }
  if(r.town) for(const x of [50,350,450,748]) for(const y of [300,367]) SCENERY.push({type:'lamp',region:r.id,x:r.x+x,y:r.y+y,size:1,variant:0});
}

const OBSTACLES=[];
for(const o of OBJECTS) {
  if(o.type==='door')OBSTACLES.push({x:o.x-57,y:o.y-93,w:114,h:76});
  if(o.type==='hall')OBSTACLES.push({x:o.x-57,y:o.y-104,w:114,h:87});
}
for(const t of SCENERY)if(['tree','pine','spire','rock','ruin','crystal','cactus'].includes(t.type))OBSTACLES.push({x:t.x-13*t.size,y:t.y-11*t.size,w:26*t.size,h:19*t.size});
const inRect=(x,y,r,pad=0)=>x>=r.x-pad&&y>=r.y-pad&&x<=r.x+r.w+pad&&y<=r.y+r.h+pad;
export function walkable(s,x,y) {
  if(s.party.interior) {
    const room=INTERIORS[s.party.interior]; if(!room)return false;
    if(x<53||x>667||y<128||y>434)return false;
    // Central aisle and keeper position remain reachable from every room.
    const furniture=room.service==='spire'?[]:room.service==='inn'?[{x:76,y:145,w:115,h:95},{x:530,y:145,w:108,h:95},{x:87,y:315,w:101,h:48}]:room.service==='shop'?[{x:77,y:130,w:123,h:127},{x:516,y:130,w:122,h:126},{x:230,y:212,w:80,h:42},{x:413,y:212,w:78,h:42}]:room.service==='smith'?[{x:70,y:127,w:126,h:115},{x:502,y:138,w:122,h:89},{x:224,y:275,w:75,h:49}]:[{x:74,y:133,w:125,h:130},{x:529,y:133,w:121,h:130},{x:243,y:283,w:231,h:54}];
    return !furniture.some(r=>inRect(x,y,r,6));
  }
  const r=regionAt(x,y); if(!r)return false;
  if(x<10||y<10||x>WORLD_W-10||y>WORLD_H-10)return false;
  if(OBSTACLES.some(o=>inRect(x,y,o,5)))return false;
  for(const o of OBJECTS)if(o.type==='plot'&&s.settlement?.plots?.[o.plot]&&inRect(x,y,{x:o.x-42,y:o.y-54,w:84,h:40},4))return false;
  for(const f of TERRAIN_FEATURES)if(f.region===r.id&&inPoly(x-r.x,y-r.y,f.points))return false;
  return true;
}

export function enterDoor(s,obj) {
  if(obj.exit)return exitInterior(s);
  if(!obj.interior||!INTERIORS[obj.interior])return false;
  s.party.returnPoint={x:obj.x,y:obj.y+35};
  s.lastTown={x:TOWNS.find(t=>t.id===obj.region)?.x||obj.x,y:TOWNS.find(t=>t.id===obj.region)?.y||obj.y};
  s.party.interior=obj.interior;s.party.x=360;s.party.y=390;return true;
}
export function exitInterior(s) {
  if(!s.party.interior)return false;
  const door=OBJECTS.find(o=>o.interior===s.party.interior);
  const p=s.party.returnPoint||{x:door?.x||400,y:(door?.y||910)+35};
  s.party.x=p.x;s.party.y=p.y;s.party.interior=null;s.party.returnPoint=null;return true;
}

// A* uses the same collision geometry as direct movement, including diagonal
// corner checks. The resulting path is shortened only along clear sightlines.
export function findPath(s,from,to) {
  const room=s.party.interior?INTERIORS[s.party.interior]:null;
  const width=Math.ceil((room?.w||WORLD_W)/NAV_SIZE),height=Math.ceil((room?.h||WORLD_H)/NAV_SIZE);
  const cell=(x,y)=>({x:Math.max(0,Math.min(width-1,Math.floor(x/NAV_SIZE))),y:Math.max(0,Math.min(height-1,Math.floor(y/NAV_SIZE)))});
  const center=p=>({x:p.x*NAV_SIZE+NAV_SIZE/2,y:p.y*NAV_SIZE+NAV_SIZE/2});
  const cache=new Map();
  const pass=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return false;const k=y*width+x;if(!cache.has(k)){const p=center({x,y});cache.set(k,walkable(s,p.x,p.y));}return cache.get(k);};
  function near(p){if(pass(p.x,p.y))return p;for(let radius=1;radius<=7;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(Math.abs(dx)===radius||Math.abs(dy)===radius)if(pass(p.x+dx,p.y+dy))return {x:p.x+dx,y:p.y+dy};return null;}
  const start=near(cell(from.x,from.y)),end=near(cell(to.x,to.y));if(!start||!end)return [];
  const key=p=>p.y*width+p.x,sk=key(start),ek=key(end),score=new Map([[sk,0]]),prev=new Map(),closed=new Set();
  const heuristic=p=>Math.hypot(end.x-p.x,end.y-p.y);
  const heap=[];
  const push=n=>{heap.push(n);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
  const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out;};
  push({...start,k:sk,f:heuristic(start)});let found=false;
  while(heap.length&&closed.size<22000){const n=pop();if(closed.has(n.k))continue;if(n.k===ek){found=true;break;}closed.add(n.k);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const x=n.x+dx,y=n.y+dy,k=y*width+x;if(closed.has(k)||!pass(x,y)||(dx&&dy&&(!pass(n.x+dx,n.y)||!pass(n.x,n.y+dy))))continue;
      const cost=score.get(n.k)+(dx&&dy?Math.SQRT2:1);if(cost>=(score.get(k)??Infinity))continue;score.set(k,cost);prev.set(k,n.k);push({x,y,k,f:cost+heuristic({x,y})});
    }
  }
  if(!found)return [];
  const path=[];let k=ek;while(k!==sk){path.push(center({x:k%width,y:Math.floor(k/width)}));k=prev.get(k);if(k===undefined)return [];}path.reverse();
  if(!path.length){if(walkable(s,to.x,to.y))return [{x:to.x,y:to.y}];return [];}
  if(walkable(s,to.x,to.y)&&Math.hypot(path.at(-1).x-to.x,path.at(-1).y-to.y)<NAV_SIZE*1.5)path.push({x:to.x,y:to.y});
  const clear=(a,b)=>{const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/5);for(let i=1;i<=n;i++)if(!walkable(s,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;return true;};
  const result=[];let origin=from,i=0;while(i<path.length){let furthest=i;for(let j=i+1;j<Math.min(path.length,i+50);j++){if(clear(origin,path[j]))furthest=j;else break;}result.push(path[furthest]);origin=path[furthest];i=furthest+1;}return result;
}
