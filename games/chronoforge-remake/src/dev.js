// Explicit development opt-in only: imported exclusively with ?dev=1.
// These helpers INITIALIZE documented scenarios. Gameplay actions still run
// through the same combat, progression, collision, save and narrative systems.
import * as State from './state.js';
import {ITEMS,SKILLS,HEROES} from './data.js';
import {REGIONS,OBJECTS,INTERIORS,getObjects,walkable,findPath} from './world.js';
import {startBattle,updateBattle,battleAction} from './battle.js';

const allObjects=()=>[...OBJECTS,...Object.values(INTERIORS).flatMap(room=>room.objects.map(o=>({...o,inRoom:room.id})))];
export function installDev(g,api){
 function levelTo(s,level){while(s.heroes[0].level<level)State.gainXp(s,State.nextXp(s.heroes[0].level)-s.heroes[0].xp);}
 function setState(s){const clean=State.validateState(s);if(!clean)throw new Error('Invalid checkpoint state');g.s=clean;api.resetTransient();g.mode='world';api.ensurePosition();g.refresh();}
 function checkpoint(name='fresh'){
  const s=State.createState();s.settings.sound=false;s.settings.speed=2;
  if(name!=='fresh'){
   s.flags.intro=true;s.flags.road=true;s.flags.briefing=true;s.cleared.road_scrappers=1;s.journal=['departure','road','briefing'];
   s.discovered=REGIONS.map(r=>r.id);for(const r of REGIONS.filter(r=>r.town))s.flags['visited_'+r.id]=true;
   s.resources={coins:2400,ore:500,food:50,energy:180,renown:45};
   levelTo(s,{settlement:3,midgame:4,links:5,anchors:6,finale:7,defeat:1}[name]||1);
   for(const h of s.heroes)for(const k of Object.values(SKILLS).filter(k=>k.hero===h.id&&k.level<=h.level&&!h.skills.includes(k.id))){h.sp=Math.max(h.sp,k.cost);State.learn(s,h.id,k.id);}
  }
  if(['links','anchors','finale'].includes(name)){
   for(const [flag,boss]of [['anchor_mire','mire_guardian'],['anchor_ember','crater_guardian'],['anchor_frost','frost_guardian']]){s.flags[flag]=true;s.cleared[boss]=1;s.journal.push(flag);}
   for(const id of ['bog_fang','ember_core','glacial_claw','frost_plate','moss_ward','magma_blade','void_scepter','titan_shard','ember_crown'])State.addItem(s,id,1);
   for(const h of s.heroes){for(const slot of ['weapon','armor','accessory']){const candidates=s.inventory.filter(i=>ITEMS[i.id].slot===slot&&ITEMS[i.id].level<=h.level&&(!ITEMS[i.id].heroes||ITEMS[i.id].heroes.includes(h.id))&&!s.heroes.some(other=>other.id!==h.id&&Object.values(other.equip).includes(i.uid))).sort((a,b)=>ITEMS[b.id].tier-ITEMS[a.id].tier);if(candidates[0])State.equip(s,h.id,candidates[0].uid);}}
   State.rest(s,true);
  }
  if(name==='links'||name==='finale'){s.flags.truth=true;s.journal.push('truth');}
  if(name==='finale'){
   s.cleared.crown_gate=1;s.party={x:360,y:360,interior:'crown_spire',returnPoint:{x:3035,y:1185}};
   s.settlement.hall=3;['farm','mine','extractor','forge','barracks','archive','walls'].forEach((type,i)=>{s.settlement.plots[i]={type,tier:2,level:2};});State.rest(s,true);
  }
  setState(s);g.devCheckpoint=name;return api.snapshot();
 }
 function near(id,distance=38){
  const obj=allObjects().find(o=>o.id===id);if(!obj)throw new Error('Unknown object: '+id);
  const p=g.s.party;if(obj.inRoom){p.interior=obj.inRoom;const door=OBJECTS.find(o=>o.interior===obj.inRoom);p.returnPoint={x:door?.x||400,y:(door?.y||925)+35};}else{p.interior=null;p.returnPoint=null;}
  p.x=obj.x;p.y=obj.y+(obj.exit?-Math.abs(distance):distance);g.camera=null;g.path=[];g.trail=[];g.encounterGrace=60;api.ensurePosition();g.nearby=obj;g.refresh();return api.snapshot();
 }
 const dev={
  checkpoints:['fresh','settlement','midgame','links','anchors','finale','defeat'],checkpoint,
  loadState:raw=>{setState(raw);return api.snapshot();},
  near,
  teleport(x,y,interior=null){g.s.party={x,y,interior,returnPoint:null};g.path=[];g.camera=null;g.trail=[];g.encounterGrace=60;api.ensurePosition();g.refresh();return api.snapshot();},
  startBattle(id,{ready=false,story=false}={}){const o=allObjects().find(o=>o.type==='encounter'&&o.id===id);if(!o)throw new Error('Unknown encounter: '+id);g.overlay=null;g.path=[];if(story)g.startBattle(o);else startBattle(g,o);if(ready&&g.battle){for(const h of g.battle.heroes)h.atb=100;updateBattle(g,.001);}g.refresh();return api.snapshot();},
  ready(ids=['kaida','vex','rune']){if(!g.battle)throw new Error('No battle');for(const h of g.battle.heroes)if(ids.includes(h.id))h.atb=100;g.battle.waiting=false;updateBattle(g,.001);g.refresh();return api.snapshot();},
  hero(id,values){const h=g.battle?.heroes.find(h=>h.id===id)||g.s.heroes.find(h=>h.id===id);if(!h)throw new Error('Unknown hero');for(const key of ['hp','mp','atb'])if(Number.isFinite(values[key]))h[key]=Math.max(0,values[key]);g.refresh();return api.snapshot();},
  enemy(id,values){const e=g.battle?.enemies.find(e=>e.id===id||e.catalogId===id);if(!e)throw new Error('Unknown enemy');for(const key of ['hp','atb'])if(Number.isFinite(values[key]))e[key]=Math.max(0,values[key]);g.refresh();return api.snapshot();},
  advance(seconds=1){if(!Number.isFinite(seconds)||seconds<0||seconds>300)throw new Error('Advance between 0 and 300 seconds');for(let t=0;t<seconds;t+=1/60){const dt=Math.min(1/60,seconds-t);if(g.mode==='battle'&&!g.overlay)updateBattle(g,dt);State.tickSettlement(g.s,dt);g.s.elapsed+=dt;g.time+=dt;}g.refresh();return api.snapshot();},
  interaction(id){g.interact(id);return api.snapshot();},
  objects:()=>allObjects().map(o=>({id:o.id,type:o.type,x:o.x,y:o.y,region:o.region,inRoom:o.inRoom,requires:o.requires})),
  collision:(x,y)=>walkable(g.s,x,y),path:(x,y)=>findPath(g.s,g.s.party,{x,y}),
  snapshot:api.snapshot,
 };
 Object.defineProperty(window,'__dev',{value:Object.freeze(dev)});
 console.info('Chronoforge development checkpoints enabled. window.__dev.checkpoints lists scenario fixtures.');
}
