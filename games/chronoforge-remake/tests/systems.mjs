/**
 * Deterministic, fast scenario tests. Run: node games/chronoforge-remake/tests/systems.mjs
 * Synthetic fixtures initialize levels/equipment/story milestones, or readiness when
 * isolating a rule. Battle effects and balance runs use the production action/update
 * APIs. No browser campaign playthrough, DOM stubs, or alternate combat code is used.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {HEROES,ITEMS,SKILLS,LINKS,ENEMIES} from '../src/data.js';
import * as state from '../src/state.js';
import {startBattle,updateBattle,battleAction,battleView,actionFrame} from '../src/battle.js';
import {OBJECTS} from '../src/world.js';

const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const report={kind:'Synthetic system scenarios; production logic, not a browser playthrough',checks:[],balance:[],restoredEnemies:[]};
const check=(name,fn)=>{fn();report.checks.push({name,passed:true});};
const fresh=()=>({s:state.createState(),refresh(){},toast(message){this.lastToast=message;},finishBattle(win,reward){this.finished={win,reward};}});
const encounter=(enemy='architect')=>({id:`test-${enemy}`,name:`Test ${ENEMIES[enemy].name}`,enemies:[enemy],boss:!!ENEMIES[enemy].boss,region:'crown'});
const pump=(g,seconds)=>{for(let t=0;t<seconds;t+=0.025)updateBattle(g,0.025);};
const resolve=g=>{for(let n=0;n<200&&g.battle.action;n++)updateBattle(g,0.025);assert.equal(g.battle.action,null,'action must reach recovery completion');};
function fixture(level=5,enemy='architect'){
  const g=fresh();for(const h of g.s.heroes){h.level=level;h.sp=(level-1)*2;for(const d of Object.values(SKILLS).filter(s=>s.hero===h.id))state.learn(g.s,h.id,d.id);}
  state.rest(g.s,true);startBattle(g,encounter(enemy));return g;
}
function ready(g,id='kaida'){
  assert(!g.battle.action);for(const h of g.battle.heroes)h.atb=100;
  updateBattle(g,.001);assert(battleAction(g,'hero',{id}).ok);return g.battle.heroes.find(h=>h.id===id);
}
function tech(g,id,target){assert(battleAction(g,'command',{id:'tech'}).ok);assert(battleAction(g,'select',{id}).ok);if(g.battle.view==='target')assert(battleAction(g,'target',{id:target}).ok);resolve(g);}
function link(g,id){assert(battleAction(g,'command',{id:'link'}).ok);assert(battleAction(g,'select',{id}).ok);resolve(g);}

check('Initial playable party and owned equipment',()=>{const s=state.createState();assert.equal(s.heroes.length,3);assert.deepEqual([s.party.x,s.party.y],[400,960]);for(const h of s.heroes){assert(h.hp===state.stats(s,h).maxHp);assert(h.equip.weapon);assert(h.equip.armor);}});
check('All settlement types, caps, collection, three-tier milestones, atomic affordability',()=>{
  const s=state.createState();s.resources={...s.resources,coins:10000,ore:10000,energy:10000};
  ['farm','mine','extractor','forge','barracks','archive','walls'].forEach((type,i)=>assert(state.build(s,i,type).ok));
  const info=state.settlementInfo(s);assert.equal(info.rates.food,12);assert.equal(info.bonuses.maxHp,18);assert.equal(info.bonuses.mag,3);assert.equal(info.bonuses.def,2);assert.equal(info.forgeDiscount,.1);
  state.tickSettlement(s,600);assert.deepEqual(s.settlement.stock,info.caps);const food=s.resources.food;assert(state.collect(s).ok);assert.equal(s.resources.food,food+info.caps.food);
  let before=JSON.stringify(s);assert(!state.upgradeBuilding(s,-1).ok);assert.equal(JSON.stringify(s),before);
  s.flags.anchor_mire=true;assert(state.upgradeBuilding(s,-1).ok);for(let i=0;i<7;i++)assert(state.upgradeBuilding(s,i).ok);
  assert(!state.upgradeBuilding(s,-1).ok);s.flags.anchor_ember=true;s.flags.anchor_frost=true;assert(state.upgradeBuilding(s,-1).ok);for(let i=0;i<7;i++)assert(state.upgradeBuilding(s,i).ok);assert(!state.upgradeBuilding(s,0).ok);assert.equal(state.settlementInfo(s).bonuses.maxHp,54);
  const poor=state.createState();poor.resources.coins=0;before=JSON.stringify(poor);assert(!state.build(poor,0,'farm').ok);assert.equal(JSON.stringify(poor),before);
});
check('Commerce, equip compatibility/ownership/levels, rank instances, forge discount',()=>{
  const s=state.createState(),uid=s.heroes[0].equip.weapon;const before=JSON.stringify(s);assert(!state.sell(s,uid).ok);assert(!state.equip(s,'vex',uid).ok);assert.equal(JSON.stringify(s),before);
  assert(state.buy(s,'potion').ok);const bought=s.inventory.at(-1);assert.equal(bought.id,'potion');assert(state.sell(s,bought.uid).ok);
  const late=state.addItem(s,'magma_blade');assert(!state.equip(s,'kaida',late.uid).ok);assert(state.upgradeItem(s,uid).ok);assert.equal(s.inventory.find(i=>i.uid===uid).rank,1);
  const copy=state.addItem(s,'iron_blade');assert.equal(copy.rank,0);const cost=state.upgradeCost(s,copy);assert(state.build(s,0,'forge').ok);assert(state.upgradeCost(s,copy).coins<cost.coins);
  assert(state.unequip(s,'kaida','weapon').ok);assert(state.sell(s,uid).ok);assert(!state.buy(s,'constructor').ok);
});
check('Skill level, point and prerequisite gates; level recovery',()=>{
  const s=state.createState();assert(!state.learn(s,'kaida','chrono_strike').ok);state.gainXp(s,400);const h=s.heroes[0];assert.equal(h.level,4);assert.equal(h.sp,6);assert(!state.learn(s,'kaida','time_sever').ok);assert(state.learn(s,'kaida','chrono_strike').ok);assert(state.learn(s,'kaida','time_sever').ok);assert.equal(h.sp,3);assert(!state.learn(s,'vex','time_sever').ok);
  h.hp=1;h.mp=0;assert(state.rest(s,true).ok);assert.equal(h.hp,state.stats(s,h).maxHp);assert.equal(h.mp,state.stats(s,h).maxMp);
});
check('Save roundtrip, four independent slots, validation, storage failures',()=>{
  const s=state.createState();assert(state.build(s,0,'farm').ok);state.tickSettlement(s,50);s.flags.anchor_mire=true;
  for(const slot of ['auto','1','2','3'])assert(state.save(s,slot).ok);assert.deepEqual(state.load('2'),state.validateState(s));assert(state.saveMeta('2').savedAt);assert(state.removeSave('2').ok);assert.equal(state.load('2'),null);assert(state.load('auto'));
  const bad={...s,heroes:[null,null,null]};assert.equal(state.validateState(bad),null);const corrupt=JSON.parse(JSON.stringify(s));corrupt.inventory.push({id:'constructor',uid:'bogus',rank:3});corrupt.settlement.plots[1]={type:'__proto__',tier:2};corrupt.resources.coins=-20;corrupt.heroes[0].hp=1e20;const clean=state.validateState(corrupt);assert(clean);assert(!clean.inventory.some(i=>i.uid==='bogus'));assert.equal(clean.settlement.plots[1],null);assert.equal(clean.resources.coins,0);assert.equal(clean.heroes[0].hp,state.stats(clean,'kaida').maxHp);
  const set=globalThis.localStorage.setItem;globalThis.localStorage.setItem=()=>{throw new Error('Quota exceeded');};assert(!state.save(s).ok);globalThis.localStorage.setItem=set;
});
check('Natural ATB readiness, wait-mode pause, active-time progression, one impact after many updates',()=>{
  const g=fresh(),sounds=[];g.battleSound=kind=>sounds.push(kind);startBattle(g,{id:'road',name:'Road',enemies:['scrapper','rat']});pump(g,8);assert.equal(g.battle.readyHero,'kaida');const frozen=g.battle.enemies[0].atb;pump(g,4);assert.equal(g.battle.enemies[0].atb,frozen);
  const target=g.battle.enemies[0],hp=target.hp;assert(battleAction(g,'command',{id:'attack'}).ok);assert(battleAction(g,'target',{id:target.id}).ok);assert.equal(g.battle.heroes[0].atb,0);assert.equal(sounds.length,0);resolve(g);assert(target.hp<hp);assert.deepEqual(sounds,['hit']);assert.equal(g.battle.lastAction.impacts,1);const after=target.hp;pump(g,.2);assert.equal(target.hp,after);
  g.s.settings.wait=false;const atb=g.battle.enemies[0].atb;pump(g,.2);assert(g.battle.enemies[0].atb>atb||g.battle.action);
});
check('Action atlas frames stay synchronized with the single impact and never loop',()=>{
  for(const [impactAt,total]of [[.4,.98],[.6,1.18],[.95,2.05],[1.15,1.8]]){
    assert.equal(actionFrame({elapsed:0,impactAt,total}),0);assert.equal(actionFrame({elapsed:impactAt-.001,impactAt,total}),2);
    assert.equal(actionFrame({elapsed:impactAt,impactAt,total}),3);assert.equal(actionFrame({elapsed:impactAt+.21,impactAt,total}),3);
    assert.equal(actionFrame({elapsed:impactAt+.23,impactAt,total}),4);assert.equal(actionFrame({elapsed:total-.001,impactAt,total}),5);
  }
});
check('Invalid links: story, downed, unready, and low-MP participants never charged',()=>{
  for(const reason of ['locked','downed','unready','mp']){
    const g=fixture();ready(g);g.s.flags.anchor_mire=reason!=='locked';const vex=g.battle.heroes[1];if(reason==='downed')vex.hp=0;if(reason==='unready')vex.atb=30;if(reason==='mp')vex.mp=9;
    assert(battleAction(g,'command',{id:'link'}).ok);const before=JSON.stringify(g.battle.heroes);assert(!battleAction(g,'select',{id:'tidal_rift'}).ok);assert.equal(JSON.stringify(g.battle.heroes),before,reason);assert(!g.battle.action);
  }
});
check('Wait for allies, atomic pair and triple MP/ATB costs, single coordinated impact',()=>{
  const g=fixture(6);g.s.flags.anchor_mire=true;g.s.flags.truth=true;g.battle.heroes[0].atb=100;g.battle.heroes[1].atb=42;g.battle.heroes[2].atb=10;updateBattle(g,.001);assert(battleAction(g,'command',{id:'wait'}).ok);
  for(let n=0;n<1000&&(!g.battle.readyHero||g.battle.action);n++)updateBattle(g,.025);assert(g.battle.heroes.every(h=>h.atb===100));
  const before=g.battle.heroes.map(h=>h.mp);link(g,'tidal_rift');assert.deepEqual(g.battle.heroes.map(h=>h.mp),[before[0]-10,before[1]-10,before[2]]);assert.deepEqual(g.battle.heroes.map(h=>h.atb),[0,0,100]);assert.equal(g.battle.lastAction.impacts,1);
  ready(g);const mp=g.battle.heroes.map(h=>h.mp);link(g,'unwritten_hour');assert.deepEqual(g.battle.heroes.map(h=>h.mp),mp.map(n=>n-16));assert(g.battle.heroes.every(h=>h.atb===0));assert.equal(g.battle.lastAction.impacts,1);assert(g.battle.loopBroken);
});
check('Real slow, drain, healing, shields, taunt, immunity, revival, and consumable effects',()=>{
  const g=fixture(5);const [kaida,vex,rune]=g.battle.heroes;ready(g,'kaida');tech(g,'chrono_strike','architect-0');assert(g.battle.enemies[0].status.slow>0);
  ready(g,'vex');vex.hp-=80;const hp=vex.hp,mp=vex.mp;tech(g,'entropy_surge');assert(vex.hp>hp);assert(vex.mp>mp-14);
  ready(g,'vex');kaida.hp-=100;const hurt=kaida.hp;tech(g,'mend','kaida');assert(kaida.hp>hurt);
  ready(g,'rune');tech(g,'aegis_field');assert(g.battle.heroes.every(h=>h.status.shield>0));
  ready(g,'rune');tech(g,'bulwark');assert(rune.status.taunt>0&&rune.status.guard>0);
  ready(g,'rune');tech(g,'temporal_wall');assert(g.battle.heroes.every(h=>h.status.immune===2));
  // Readiness fixture schedules one genuine boss attack, then verifies no HP loss.
  const before=g.battle.heroes.map(h=>h.hp);for(const h of g.battle.heroes)h.atb=0;g.battle.readyHero=null;g.battle.enemies[0].atb=100;updateBattle(g,.025);assert.equal(g.battle.action.side,'enemy');resolve(g);assert.deepEqual(g.battle.heroes.map(h=>h.hp),before);assert(g.battle.heroes.some(h=>h.status.immune===1));
  ready(g,'rune');kaida.hp=0;tech(g,'rekindle','kaida');assert(kaida.hp>0);
  ready(g,'kaida');vex.mp=0;const ether=g.s.inventory.find(i=>i.id==='ether');assert(battleAction(g,'command',{id:'item'}).ok);assert(battleAction(g,'select',{id:ether.uid}).ok);assert(battleAction(g,'target',{id:'vex'}).ok);resolve(g);assert.equal(vex.mp,35);assert(!g.s.inventory.some(i=>i.uid===ether.uid));
});
check('Equipment and settlement change actual dealt/received damage',()=>{
  function attackBonus(enhanced){const g=fresh();if(enhanced){g.s.resources.coins=1000;g.s.resources.ore=1000;const w=g.s.heroes[0].equip.weapon;state.upgradeItem(g.s,w);}startBattle(g,encounter());ready(g);const hp=g.battle.enemies[0].hp;battleAction(g,'command',{id:'attack'});battleAction(g,'target',{id:'architect-0'});resolve(g);return hp-g.battle.enemies[0].hp;}
  assert(attackBonus(true)>attackBonus(false));
  function defendedDamage(built){const g=fresh();if(built)state.build(g.s,0,'walls');startBattle(g,encounter());for(const h of g.battle.heroes)h.atb=0;g.battle.enemies[0].atb=100;const hp=g.battle.heroes.map(h=>h.hp);updateBattle(g,.025);resolve(g);return hp.reduce((n,v,i)=>n+v-g.battle.heroes[i].hp,0);}
  assert(defendedDamage(true)<defendedDamage(false));
  const s=state.createState(),hp=state.stats(s,'kaida').maxHp,magic=state.stats(s,'vex').mag;state.build(s,0,'barracks');state.build(s,1,'archive');assert.equal(state.stats(s,'kaida').maxHp,hp+18);assert.equal(state.stats(s,'vex').mag,magic+3);
});
check('Defeat retry restores exact snapshot; retreat restores safe-town health',()=>{
  const g=fixture();const snapshot=JSON.stringify(g.battle.snapshot);g.s.resources.coins=0;g.s.inventory.pop();for(const h of g.battle.heroes)h.hp=0;updateBattle(g,.025);assert.equal(g.battle.phase,'defeat');assert(battleAction(g,'retry').ok);assert.equal(JSON.stringify(g.s),snapshot);
  for(const h of g.battle.heroes)h.hp=0;updateBattle(g,.025);assert(battleAction(g,'retreat').ok);assert.equal(g.s.party.interior,null);assert.equal(g.s.party.x,g.s.lastTown.x);assert(g.s.heroes.every(h=>h.hp===state.stats(g.s,h).maxHp));
});
check('Enemy death animation age advances through recovery and remains stable after victory',()=>{
  const g=fixture(4,'rat');g.battle.enemies[0].hp=1;ready(g);battleAction(g,'command',{id:'attack'});battleAction(g,'target',{id:'rat-0'});
  for(let i=0;i<40&&!g.battle.action?.impacted;i++)updateBattle(g,.025);
  const enemy=g.battle.enemies[0];assert.equal(enemy.hp,0);assert.equal(enemy.deathAge,0);pump(g,.15);assert(enemy.deathAge>0&&enemy.deathAge<.32);resolve(g);assert(g.battle.result.win);assert(enemy.deathAge>=.32);const age=enemy.deathAge;pump(g,.1);assert(enemy.deathAge>age);
});

function loadout(level){
  const g=fresh();for(const h of g.s.heroes){h.level=level;h.sp=(level-1)*2;for(const skill of Object.values(SKILLS).filter(k=>k.hero===h.id))state.learn(g.s,h.id,skill.id);}
  state.build(g.s,0,'farm');state.build(g.s,1,'barracks');state.build(g.s,2,'archive');state.build(g.s,3,'walls');
  if(level>=3)for(const [hero,id]of [['kaida','bog_fang'],['vex','ember_core'],['rune','glacial_claw']])state.equip(g.s,hero,state.addItem(g.s,id).uid);
  if(level>=4)for(const h of g.s.heroes)state.equip(g.s,h.id,state.addItem(g.s,'frost_plate').uid);
  if(level>=5)state.equip(g.s,'kaida',state.addItem(g.s,'magma_blade').uid);
  g.s.flags.anchor_mire=level>=4;g.s.flags.anchor_ember=level>=5;g.s.flags.anchor_frost=level>=6;g.s.flags.truth=level>=6;state.rest(g.s,true);return g;
}
function runBalanced(g,e){
  startBattle(g,e);let elapsed=0,actions=0,lastLink=-20;const used=new Set();
  const choose=(id,target)=>{battleAction(g,'command',{id:'tech'});const out=battleAction(g,'select',{id});assert(out.ok,out.message);if(g.battle.view==='target')assert(battleAction(g,'target',{id:target}).ok);used.add(id);};
  while(!g.battle.result&&elapsed<300){
    updateBattle(g,.05);elapsed+=.05;const b=g.battle;if(b.action||!b.readyHero)continue;const h=b.heroes.find(x=>x.id===b.readyHero),persist=g.s.heroes.find(x=>x.id===h.id),enemy=b.enemies.find(x=>x.hp>0);if(!enemy)continue;actions++;
    const down=b.heroes.find(x=>!x.hp),wounded=[...b.heroes].filter(x=>x.hp>0).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp)[0];
    const knows=id=>persist.skills.includes(id)&&h.mp>=SKILLS[id].mp;
    if(down&&knows('rekindle')){choose('rekindle',down.id);continue;}
    if(wounded.hp/wounded.maxHp<.5&&knows('mend')){choose('mend',wounded.id);continue;}
    if(down||wounded.hp/wounded.maxHp<.32||h.mp<6){const supply=g.s.inventory.find(i=>i.id===(down?'phoenix':h.mp<6?'ether':'potion'));if(supply){battleAction(g,'command',{id:'item'});battleAction(g,'select',{id:supply.uid});battleAction(g,'target',{id:down?.id||(h.mp<6?h.id:wounded.id)});used.add(ITEMS[supply.id].name);continue;}}
    const linkDef=Object.values(LINKS).reverse().find(d=>g.s.flags[d.flag]&&d.effect!=='linkheal'&&d.heroes.every(id=>{const p=b.heroes.find(x=>x.id===id);return p.hp>0&&p.mp>=d.mp;}));
    if(linkDef&&elapsed-lastLink>12&&wounded.hp/wounded.maxHp>.45){
      if(!b.heroes.filter(x=>x.hp>0).every(x=>x.atb===100)){battleAction(g,'command',{id:'wait'});continue;}
      battleAction(g,'command',{id:'link'});assert(battleAction(g,'select',{id:linkDef.id}).ok);lastLink=elapsed;used.add(linkDef.id);continue;
    }
    if(h.id==='rune'&&knows('aegis_field')&&b.heroes.some(x=>x.hp>0&&!(x.status.shield>10))){choose('aegis_field');continue;}
    if(knows('time_sever')){choose('time_sever',enemy.id);continue;}
    if(knows('chrono_strike')&&!(enemy.status.slow>2)){choose('chrono_strike',enemy.id);continue;}
    if(knows('entropy_surge')&&(b.enemies.filter(x=>x.hp>0).length>1||h.hp/h.maxHp<.8)){choose('entropy_surge');continue;}
    if(knows('void_lance')){choose('void_lance',enemy.id);continue;}
    if(knows('rift_cleave')&&b.enemies.filter(x=>x.hp>0).length>1){choose('rift_cleave');continue;}
    if(h.hp/h.maxHp<.5&&knows('second_wind')){choose('second_wind');continue;}
    if(h.id==='rune'&&h.mp<9){battleAction(g,'command',{id:'defend'});used.add('defend');continue;}
    battleAction(g,'command',{id:'attack'});assert(battleAction(g,'target',{id:enemy.id}).ok);used.add('attack');
  }
  return {encounter:e.id,startingLevel:g.battle.snapshot.heroes[0].level,win:g.battle.result?.win===true,simulatedSeconds:Math.round(elapsed),decisions:actions,techniques:[...used],remainingHp:g.s.heroes.map(h=>h.hp),result:g.battle.reward};
}
for(const [id,level,enemies]of [['fresh-road',1,['scrapper','rat']],['level3-mire',3,['warden']],['level4-ember',4,['emberlord']],['level5-frost',5,['colossus']],['level6-final',6,['architect']]]){
  const g=loadout(level),r=runBalanced(g,{id,name:id,enemies,boss:level>1,region:'crown'});report.balance.push(r);assert(r.win,`${id} must be winnable with this fixed milestone loadout`);
}
check('All six restored enemy identities have playable optional encounters and unique actions',()=>{
  assert.equal(Object.keys(ENEMIES).length,19);
  for(const id of ['gravbot','mire_hulk','neon_cultist','sandworm_hatchling','frost_revenant','magma_behemoth']){
    const authored=OBJECTS.find(o=>o.type==='encounter'&&o.enemies.includes(id));assert(authored,`${id} needs an actual world encounter`);
    const g=loadout(4),r=runBalanced(g,authored);report.restoredEnemies.push(r);assert(r.win,`${id} must be winnable at the fixed level4 fixture`);
  }
});
check('Swamp Coil, Slag Tooth and Mire Charm can be bought, equipped, saved and earned as loot',()=>{
  assert.equal(Object.keys(ITEMS).length,22);const s=state.createState();state.gainXp(s,65);
  for(const id of ['swamp_coil','slag_tooth','mire_charm']){assert(state.buy(s,id).ok);const item=s.inventory.at(-1);assert.equal(item.id,id);assert(state.equip(s,'kaida',item.uid).ok);}
  assert(state.save(s,'3').ok);assert(state.load('3').inventory.some(i=>i.id==='mire_charm'));
  for(const [enemy,item]of [['rat','slag_tooth'],['stalker','mire_charm'],['drone','swamp_coil']]){const g=loadout(4),r=runBalanced(g,{id:`restored-loot-${enemy}`,name:'Restored loot',enemies:[enemy],region:'mire'});assert(r.win);assert(g.battle.reward.items.includes(item));assert(g.s.inventory.some(i=>i.id===item));}
});
check('First clear pays once and repeat rewards are reduced',()=>{
  const g=loadout(3),e={id:'repeat-test',name:'Repeat test',enemies:['rat'],region:'haventide'};
  const first=runBalanced(g,e);assert(first.win);const coins=g.s.resources.coins,payout=g.battle.reward.coins;for(let i=0;i<50;i++)updateBattle(g,.05);assert.equal(g.s.resources.coins,coins);assert.equal(g.s.cleared[e.id],1);assert(battleAction(g,'continue').ok);assert(battleAction(g,'continue').ok);assert.equal(g.s.resources.coins,coins);
  state.rest(g.s,true);const second=runBalanced(g,e);assert(second.win);assert(g.battle.reward.coins<payout);assert.equal(g.s.cleared[e.id],2);assert.equal(g.battle.reward.items.length,0);
});

report.passed=true;
writeFileSync(new URL('./systems-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${report.checks.length} system checks; ${report.balance.length} fixed-milestone balance scenarios; ${report.restoredEnemies.length} restored enemy scenarios.`);
for(const r of report.balance)console.log(`  ${r.encounter}: victory in ${r.simulatedSeconds}s / ${r.decisions} decisions.`);
