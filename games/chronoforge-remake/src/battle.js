import {HEROES,ITEMS,SKILLS,LINKS,ENEMIES} from './data.js';
import {stats,gainXp,addItem,itemName} from './state.js';
import {drawHero,drawEnemy} from './art.js';
import {drawBattleBackground} from './render.js';
import {formationPosition,battlePose,actionContacts,bodyGeometry} from './battle-motion.js';
export {formationPosition,battlePose,actionContacts,bodyGeometry} from './battle-motion.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const alive=unit=>unit.hp>0;
const ready=unit=>alive(unit)&&unit.atb>=99.999;
const heroBy=(b,id)=>b.heroes.find(h=>h.id===id);
const enemyBy=(b,id)=>b.enemies.find(e=>e.id===id);
const unitBy=(b,id)=>heroBy(b,id)||enemyBy(b,id);
const tell=(g,message)=>{g.toast?.(message);return {ok:false,message};};
const success=message=>({ok:true,message});
const log=(b,text)=>{b.log.push(text);if(b.log.length>40)b.log.shift();};
const notify=g=>g.refresh?.();
function random(b){b.seed=(b.seed*1664525+1013904223)>>>0;return b.seed/4294967296;}
function sync(g){for(const unit of g.battle.heroes){const h=g.s.heroes.find(x=>x.id===unit.id);h.hp=unit.hp;h.mp=unit.mp;}}
function chooseReady(b){if(b.action||b.result||b.waiting)return;const h=heroBy(b,b.readyHero);if(!ready(h||{})){b.readyHero=b.heroes.find(ready)?.id||null;b.view='main';b.pending=null;}b.phase=b.readyHero?'command':'filling';}
function validTargets(b,definition){
  if(definition.target==='enemy'||definition.target==='enemies')return b.enemies.filter(alive);
  if(definition.target==='self')return [heroBy(b,b.readyHero)].filter(Boolean);
  if(definition.effect==='revive'||definition.effect==='linkheal')return b.heroes;
  if(definition.effect==='itemrevive')return b.heroes.filter(h=>!alive(h));
  return b.heroes.filter(alive);
}
const attackDef={id:'attack',name:'Attack',target:'enemy',effect:'physical',power:1,mp:0};
const defendDef={id:'defend',name:'Defend',target:'self',effect:'guard',power:0,mp:0};
function itemDef(item){const d=ITEMS[item.id];return {...d,id:item.uid,itemId:item.id,target:'ally',effect:`item${d.effect}`,mp:0};}
function linkIssue(g,link){
  const b=g.battle;if(!g.s.flags[link.flag])return link.flag==='truth'?'Discover the truth at Last Crown.':'Restore the matching anchor to unlock this bond.';
  for(const id of link.heroes){const h=heroBy(b,id);if(!h||!alive(h))return `${HEROES[id].name} is down.`;if(!ready(h))return `${h.name} needs full ATB. Choose Wait for allies.`;if(h.mp<link.mp)return `${h.name} needs ${link.mp} MP.`;}return null;
}
export function startBattle(g,encounter){
  if(!encounter||typeof encounter.id!=='string'||!Array.isArray(encounter.enemies)||!encounter.enemies.length||encounter.enemies.some(id=>!Object.hasOwn(ENEMIES,id)))return tell(g,'This encounter is not available.');
  if(!g.s.heroes.some(alive))return tell(g,'The party needs to recover at an inn.');
  let seed=19;for(const c of encounter.id)seed=(seed*31+c.charCodeAt(0))>>>0;
  const b={encounter,snapshot:copy(g.s),heroes:g.s.heroes.map((h,index)=>{const t=stats(g.s,h);return {id:h.id,name:h.name,hp:h.hp,mp:h.mp,maxHp:t.maxHp,maxMp:t.maxMp,stats:t,atb:35-index*8,status:{},side:'hero',index};}),
    enemies:encounter.enemies.map((id,index)=>{const d=ENEMIES[id];return {...d,id:`${id}-${index}`,catalogId:id,maxHp:d.hp,atb:8+index*5,status:{},side:'enemy',index,turns:0,bossPhase:1};}),
    action:null,lastAction:null,phase:'filling',view:'main',pending:null,readyHero:null,waiting:false,result:null,reward:null,log:[],floats:[],effects:[],time:0,seed,loopBroken:false};
  g.battle=b;g.mode='battle';g.overlay=null;g.path=[];
  log(b,`${encounter.name} · Fill ATB, then choose an action.`);
  if(encounter.boss)log(b,'Watch the enemy’s next move. Defend and Aegis soften heavy attacks.');
  notify(g);return success('Battle started.');
}

function beginAction(g,definition,targets,kind='skill'){
  const b=g.battle,actor=heroBy(b,b.readyHero);
  if(b.action||b.result||!actor||!ready(actor))return tell(g,'Wait until a living ally has full ATB.');
  const available=validTargets(b,definition);if(!targets.length||targets.some(id=>!available.some(t=>t.id===id)))return tell(g,'Choose a valid target.');
  let participants=[actor];
  if(kind==='link'){const issue=linkIssue(g,definition);if(issue)return tell(g,issue);participants=definition.heroes.map(id=>heroBy(b,id));}
  else if(actor.mp<(definition.mp||0))return tell(g,`${actor.name} needs ${definition.mp} MP.`);
  if(kind==='item'){
    const item=g.s.inventory.find(i=>i.uid===definition.id);if(!item||ITEMS[item.id].slot!=='consumable')return tell(g,'That supply is no longer available.');
    const target=unitBy(b,targets[0]);if(definition.effect==='itemheal'&&target.hp>=target.maxHp)return tell(g,'This ally already has full HP.');if(definition.effect==='itemmp'&&target.mp>=target.maxMp)return tell(g,'This ally already has full MP.');
    g.s.inventory.splice(g.s.inventory.indexOf(item),1);
  }
  // All validation precedes this atomic reservation. Every link participant pays once.
  const costs=participants.map(h=>({id:h.id,atb:100,mp:definition.mp||0}));
  for(const h of participants){h.atb=0;h.mp-=definition.mp||0;delete h.status.guard;}
  const long=kind==='link',windup=g.s.settings.reducedMotion?0.2:long?0.95:definition.effect==='physical'?0.4:0.6;
  b.action={actorId:actor.id,side:'hero',kind,definition,targetIds:targets,participants:participants.map(h=>h.id),costs,elapsed:0,impactAt:windup,total:windup+(long?1.1:0.58),impacted:false};
  b.lastAction={name:definition.name,kind,participants:participants.map(h=>h.id),costs:copy(costs),targetIds:[...targets],impacts:0};
  b.readyHero=null;b.waiting=false;b.view='main';b.pending=null;b.phase='windup';
  log(b,`${participants.map(h=>h.name).join(' + ')} · ${definition.name}`);sync(g);notify(g);return success(definition.name);
}
function prepare(g,definition,kind){const b=g.battle;const targets=validTargets(b,definition);if(!targets.length)return tell(g,'There are no valid targets for this action.');if(['enemies','allies','self'].includes(definition.target))return beginAction(g,definition,targets.map(t=>t.id),kind);b.pending={definition,kind};b.view='target';notify(g);return success('Choose a target.');}
export function battleAction(g,action,payload={}){
  const b=g.battle;if(!b)return tell(g,'There is no battle in progress.');payload=payload?.payload??payload;
  const id=typeof payload==='string'?payload:payload.id??payload.targetId??payload.target;
  if(action==='continue'){
    if(b.result?.win!==true)return tell(g,'The battle has not been won yet.');if(b.dismissed)return success('Already continued.');b.dismissed=true;g.finishBattle?.(true,b.reward);return success('Victory.');
  }
  if(action==='retry'){
    if(b.result?.win!==false)return tell(g,'Retry is available after defeat.');const encounter=b.encounter;g.s=copy(b.snapshot);return startBattle(g,encounter);
  }
  if(action==='retreat'){
    if(b.result?.win!==false)return tell(g,'Return to town is available after defeat.');g.s=copy(b.snapshot);g.s.party={...g.s.party,...g.s.lastTown,interior:null,returnPoint:null};for(const h of g.s.heroes){const t=stats(g.s,h);h.hp=t.maxHp;h.mp=t.maxMp;}b.dismissed=true;g.finishBattle?.(false,null);return success('The party recovered at the last safe town.');
  }
  if(b.result||b.action)return tell(g,'The current action is still resolving.');
  if(action==='back'){b.view='main';b.pending=null;notify(g);return success('Commands.');}
  if(action==='hero'){const h=heroBy(b,id);if(!ready(h||{}))return tell(g,'This ally needs full ATB.');b.readyHero=id;b.waiting=false;b.view='main';b.pending=null;notify(g);return success(`${h.name} selected.`);}
  if(action==='wait'||(action==='command'&&id==='wait')){if(!b.heroes.some(ready))return tell(g,'ATB is still filling.');b.waiting=true;b.readyHero=null;b.view='main';b.pending=null;b.phase='filling';notify(g);return success('Waiting for every living ally to be ready.');}
  if(action==='command'&&id==='resume'){b.waiting=false;chooseReady(b);notify(g);return success('Commands resumed.');}
  chooseReady(b);if(!b.readyHero)return tell(g,'ATB is still filling.');
  if(action==='command'){
    if(id==='attack')return prepare(g,attackDef,'attack');if(id==='defend')return prepare(g,defendDef,'defend');
    if(id==='tech'||id==='skill'){b.view='skills';notify(g);return success('Choose a technique.');}if(id==='link'){b.view='links';notify(g);return success('Choose a bond technique.');}if(id==='item'){b.view='items';notify(g);return success('Choose a supply.');}
  }
  if(action==='select'){
    const actor=g.s.heroes.find(h=>h.id===b.readyHero);
    if(b.view==='skills'){const skill=SKILLS[id];if(!skill||skill.hero!==actor.id||!actor.skills.includes(id))return tell(g,'That technique has not been learned.');return prepare(g,skill,'skill');}
    if(b.view==='links'){const link=LINKS[id];if(!link)return tell(g,'Unknown bond technique.');const issue=linkIssue(g,link);if(issue)return tell(g,issue);return prepare(g,link,'link');}
    if(b.view==='items'){const item=g.s.inventory.find(i=>i.uid===id);if(!item||ITEMS[item.id].slot!=='consumable')return tell(g,'Choose a supply from your pack.');return prepare(g,itemDef(item),'item');}
  }
  if(action==='target'&&b.pending)return beginAction(g,b.pending.definition,[id],b.pending.kind);
  return tell(g,'Choose one of the available commands.');
}
function float(b,unit,text,color='#fff0d2'){b.floats.push({id:unit.id,text:String(text),color,time:1.15,offset:b.floats.filter(f=>f.id===unit.id).length*17});}
function heal(b,unit,amount){if(!alive(unit))return;const before=unit.hp;unit.hp=Math.min(unit.maxHp,unit.hp+Math.round(amount));if(unit.hp>before)float(b,unit,`+${unit.hp-before}`,'#92e1b2');}
function hit(b,target,amount){
  if(!alive(target))return 0;
  if(target.status.immune>0&&target.status.immuneTime>0){target.status.immune--;float(b,target,'IMMUNE','#a7e9ff');return 0;}
  let damage=Math.max(1,Math.round(amount));if(target.status.guard>0)damage=Math.max(1,Math.round(damage*0.4));
  if(target.status.shield>0){const blocked=Math.min(target.status.shield,damage);target.status.shield-=blocked;damage-=blocked;if(!damage)float(b,target,`BLOCK ${blocked}`,'#b6eaff');}
  target.hp=Math.max(0,target.hp-damage);target.hurt=0.35;if(!target.hp)target.deathAge=0;if(damage)float(b,target,damage);return damage;
}
function damage(g,actor,target,power,magic=false){
  const b=g.battle,source=actor.stats||actor,base=magic?source.mag:source.atk;
  const defense=target.stats?.def??target.def;let amount=base*power-defense*(magic?0.32:0.62);amount*=0.94+random(b)*0.12;
  if(actor.side==='hero'&&random(b)<source.crit/100){amount*=1.5;float(b,target,'CRITICAL','#ffd580');}
  return hit(b,target,Math.max(3,amount));
}
function applyImpact(g){
  const b=g.battle,a=b.action,d=a.definition,actor=unitBy(b,a.actorId),targets=a.targetIds.map(id=>unitBy(b,id)).filter(Boolean);a.impacted=true;b.lastAction.impacts++;
  if(a.side==='enemy'){
    for(const target of targets){damage(g,actor,target,d.power,d.magic);if(d.slow&&alive(target))target.status.slow=8;}
    log(b,`${actor.name} used ${d.name}.`);g.battleSound?.(d.magic?'magic':'hit');sync(g);return;
  }
  const st=actor.stats;
  if(['physical','magic','slow','drain'].includes(d.effect)){
    let total=0;for(const target of targets){const hits=d.hits||1;for(let n=0;n<hits&&alive(target);n++)total+=damage(g,actor,target,d.power/hits,d.effect==='magic'||d.effect==='drain');if(d.effect==='slow'&&alive(target))target.status.slow=12;}
    if(d.effect==='drain'){heal(b,actor,total*0.35);const restored=Math.min(12,actor.maxMp-actor.mp);actor.mp+=restored;float(b,actor,`+${restored} MP`,'#9ceaff');}
  }else if(d.effect==='guard'){actor.status.guard=15;actor.mp=Math.min(actor.maxMp,actor.mp+5);float(b,actor,'GUARD','#ffe190');}
  else if(d.effect==='shield'){for(const h of targets){h.status.shield=Math.max(h.status.shield||0,d.power+st.mag);float(b,h,'AEGIS','#a2e7ed');}}
  else if(d.effect==='taunt'){actor.status.taunt=12;actor.status.guard=12;float(b,actor,'BULWARK','#ffe190');}
  else if(d.effect==='immune'){for(const h of targets){h.status.immune=d.power;h.status.immuneTime=15;float(b,h,'TIME WALL','#bfe9ff');}}
  else if(d.effect==='heal'){for(const h of targets)heal(b,h,d.power+st.mag*1.8);}
  else if(d.effect==='secondwind'){heal(b,actor,actor.maxHp*d.power);actor.status.haste=10;}
  else if(d.effect==='revive'){for(const h of targets){if(!alive(h)){h.hp=Math.ceil(h.maxHp*d.power);h.atb=25;float(b,h,'REKINDLED','#aff0bf');}else heal(b,h,50+st.mag);}}
  else if(d.effect==='itemheal'){heal(b,targets[0],d.power);}
  else if(d.effect==='itemmp'){const h=targets[0],n=Math.min(d.power,h.maxMp-h.mp);h.mp+=n;float(b,h,`+${n} MP`,'#a7eaff');}
  else if(d.effect==='itemrevive'){const h=targets[0];h.hp=Math.ceil(h.maxHp*d.power);h.atb=25;float(b,h,'REVIVED','#aff0bf');}
  else if(['linkmagic','linkshield','triple'].includes(d.effect)){
    const participants=a.participants.map(id=>heroBy(b,id));const combined=participants.reduce((sum,h)=>sum+Math.max(h.stats.atk,h.stats.mag),0);const proxy={...actor,stats:{...st,atk:combined,mag:combined}};
    for(const target of targets){damage(g,proxy,target,d.power,d.effect!=='linkshield');if(d.effect==='linkmagic'&&alive(target))target.status.slow=12;}
    if(d.effect==='linkshield')for(const h of b.heroes.filter(alive)){h.status.shield=Math.max(h.status.shield||0,55+st.mag);float(b,h,'SUNRISE','#ffe49b');}
    if(d.effect==='triple'){
      if(!b.loopBroken&&b.enemies.some(e=>e.catalogId==='architect')){b.loopBroken=true;log(b,'The closed loop breaks. The future belongs to everyone.');for(const e of targets)if(e.catalogId==='architect'&&alive(e))hit(b,e,120);}
      for(const h of b.heroes){if(!alive(h)){h.hp=Math.ceil(h.maxHp*0.3);float(b,h,'RETURN','#baf5cf');}else heal(b,h,h.maxHp*0.28);}
    }
  }else if(d.effect==='linkheal'){for(const h of b.heroes){if(!alive(h)){h.hp=Math.ceil(h.maxHp*d.power);h.atb=25;float(b,h,'RETURN','#baf5cf');}else heal(b,h,h.maxHp*d.power);h.status.immune=1;h.status.immuneTime=15;}}
  g.battleSound?.(['physical','slow'].includes(d.effect)?'hit':['heal','revive','secondwind','itemheal','itemrevive','linkheal'].includes(d.effect)?'heal':'magic');sync(g);
}
function enemyPlan(enemy){
  const phase=enemy.catalogId==='architect'?(enemy.hp/enemy.maxHp>0.66?1:enemy.hp/enemy.maxHp>0.33?2:3):1;
  const special=enemy.turns%3===2;
  if(enemy.catalogId==='architect')return special?{name:phase===1?'Clockfall':phase===2?'Borrowed Seconds':'Zero Hour',power:phase===3?1.35:1.05,magic:true,all:true,slow:phase===2,phase}:{name:phase===3?'Fracture':'Closed Circuit',power:phase===3?1.45:1.2,magic:true,phase};
  if(special&&enemy.boss)return {name:{warden:'Flood Memory',emberlord:'Solar Flare',colossus:'Whiteout'}[enemy.catalogId]||'Faultline',power:1.05,magic:true,all:true,slow:enemy.catalogId==='colossus',phase};
  return {name:{rat:'Scavenge',scrapper:'Scrap Hook',hound:'Rending Bite',stalker:'Fen Lash',warden:'Root Bind',golem:'Cinder Fist',emberlord:'Branding Arc',wolf:'Ice Fang',colossus:'Glacial Crush',drone:'Pulse Bolt',wraith:'Lost Second',herald:'Edict',gravbot:'Gravity Bash',mire_hulk:'Marsh Hammer',neon_cultist:'Neon Invocation',sandworm_hatchling:'Burrowing Bite',frost_revenant:'Rimeblade',magma_behemoth:'Magma Charge'}[enemy.catalogId]||'Strike',power:1,magic:['drone','wraith','herald','warden','neon_cultist'].includes(enemy.catalogId),phase};
}
function beginEnemy(g,enemy){
  const b=g.battle,definition=enemyPlan(enemy),living=b.heroes.filter(alive),taunt=living.find(h=>h.status.taunt>0);
  if(!living.length)return;
  if(definition.phase>enemy.bossPhase){enemy.bossPhase=definition.phase;log(b,`The Architect enters phase ${enemy.bossPhase}: ${enemy.bossPhase===2?'The Borrowed Hour':'The Unwritten Edge'}.`);}
  const targets=definition.all?living:[taunt||living[Math.floor(random(b)*living.length)]];
  enemy.atb=0;enemy.turns++;const windup=definition.all?1.15:0.6;
  b.action={actorId:enemy.id,side:'enemy',kind:'enemy',definition,targetIds:targets.map(h=>h.id),participants:[enemy.id],costs:[],elapsed:0,impactAt:windup,total:windup+0.65,impacted:false};
  b.lastAction={name:definition.name,kind:'enemy',participants:[enemy.id],costs:[],targetIds:targets.map(h=>h.id),impacts:0};b.phase='windup';
  log(b,`${enemy.name} prepares ${definition.name}${definition.all?' · ALL ALLIES':''}.`);notify(g);
}
function conclude(g,win){
  const b=g.battle;if(b.result)return;b.action=null;b.readyHero=null;b.waiting=false;b.pending=null;b.view='main';sync(g);
  b.result={win};b.phase=win?'victory':'defeat';
  if(win){
    const first=!(g.s.cleared[b.encounter.id]>0),factor=first?1:0.3,totals={xp:0,coins:0,ore:0,energy:0,renown:first?(b.encounter.boss?5:1):0},items=[];
    for(const enemy of b.enemies){const d=ENEMIES[enemy.catalogId];for(const key of ['xp','coins','ore','energy'])totals[key]+=d[key]||0;if(first&&d.loot)items.push(d.loot);}
    for(const key of ['xp','coins','ore','energy'])totals[key]=Math.max(0,Math.floor((b.encounter.reward?.[key]??totals[key])*factor));
    if(first&&Array.isArray(b.encounter.reward?.items))items.push(...b.encounter.reward.items.filter(id=>ITEMS[id]));
    if(first&&!b.encounter.boss)items.push('potion');if(first&&b.encounter.boss)items.push('ether','phoenix');
    for(const key of ['coins','ore','energy','renown'])g.s.resources[key]+=totals[key];
    const messages=gainXp(g.s,totals.xp);for(const id of items)addItem(g.s,id);
    g.s.cleared[b.encounter.id]=(g.s.cleared[b.encounter.id]||0)+1;
    // A battle victory always leaves the party able to walk safely to an inn.
    for(const h of g.s.heroes){const t=stats(g.s,h);if(h.hp<=0)h.hp=Math.ceil(t.maxHp*0.2);h.mp=Math.min(t.maxMp,h.mp+5);const unit=heroBy(b,h.id);unit.stats=t;unit.maxHp=t.maxHp;unit.maxMp=t.maxMp;unit.hp=h.hp;unit.mp=h.mp;}
    b.reward={...totals,items,itemNames:items.map(id=>ITEMS[id].name),messages,firstClear:first,encounterId:b.encounter.id};g.reward=b.reward;
    log(b,first?'Victory. The road remembers your courage.':'Victory. Repeat encounters offer reduced rewards.');
  }else log(b,'The hour folds. Retry restores your exact pre-battle supplies, HP, MP, and resources.');
  notify(g);
}
export function updateBattle(g,dtSeconds){
  const b=g.battle;if(!b)return;let dt=Math.max(0,Math.min(0.25,Number(dtSeconds)||0))*g.s.settings.speed;b.time+=dt;
  for(const f of b.floats)f.time-=dt;b.floats=b.floats.filter(f=>f.time>0);for(const unit of [...b.heroes,...b.enemies]){unit.hurt=Math.max(0,(unit.hurt||0)-dt);if(!alive(unit))unit.deathAge=(unit.deathAge||0)+dt;}
  if(b.result)return;
  if(b.action){
    const a=b.action;a.elapsed+=dt;if(!a.impacted&&a.elapsed>=a.impactAt)applyImpact(g);
    b.phase=a.elapsed<a.impactAt?'windup':a.elapsed<a.impactAt+0.22?'impact':'recovery';
    if(a.elapsed>=a.total){b.action=null;if(!b.enemies.some(alive))conclude(g,true);else if(!b.heroes.some(alive))conclude(g,false);else{chooseReady(b);notify(g);}}return;
  }
  if(!b.enemies.some(alive)){conclude(g,true);return;}if(!b.heroes.some(alive)){conclude(g,false);return;}
  if(b.waiting&&b.heroes.filter(alive).every(ready)){b.waiting=false;chooseReady(b);notify(g);}
  chooseReady(b);
  // Wait mode pauses both sides only during an actual player decision.
  if(g.s.settings.wait&&b.readyHero&&!b.waiting)return;
  for(const unit of [...b.heroes,...b.enemies]){
    if(!alive(unit)){unit.atb=0;continue;}
    for(const key of ['guard','taunt','slow','haste','immuneTime'])if(unit.status[key]>0)unit.status[key]=Math.max(0,unit.status[key]-dt);
    if(!unit.status.immuneTime)unit.status.immune=0;
    const speed=unit.stats?.spd??unit.spd;const rate=(10+speed*0.78)*(unit.status.slow>0?0.55:1)*(unit.status.haste>0?1.35:1);
    unit.atb=Math.min(100,unit.atb+dt*rate);
  }
  // Player readiness wins ties, allowing a final guard before an enemy turn.
  if(b.waiting&&b.heroes.filter(alive).every(ready))b.waiting=false;
  chooseReady(b);if(g.s.settings.wait&&b.readyHero&&!b.waiting)return;
  const enemy=b.enemies.find(ready);if(enemy)beginEnemy(g,enemy);
}
export function battleView(g){
  const b=g.battle;if(!b)return {readyHero:null,hero:null,phase:'filling',view:'main',commands:[],targets:[],log:[]};
  const actor=heroBy(b,b.readyHero),commands=[];let targets=[];
  if(b.result){commands.push(...(b.result.win?[{id:'continue',label:'Continue',detail:'Return to the journey',disabled:false}]:[{id:'retry',label:'Retry encounter',detail:'Restore the exact pre-battle state',disabled:false},{id:'retreat',label:'Return to town',detail:'Recover fully at the last safe town',disabled:false}]));}
  else if(!b.action&&actor){
    if(b.view==='main')commands.push({id:'attack',label:'Attack',detail:'A focused weapon strike',disabled:false},{id:'tech',label:'Tech',detail:'Learned techniques · MP',disabled:false},{id:'defend',label:'Defend',detail:'60% less damage · recover 5 MP',disabled:false},{id:'item',label:'Item',detail:'Tonics, ether, and wakeflowers',disabled:!g.s.inventory.some(i=>ITEMS[i.id].slot==='consumable')},{id:'link',label:'Link',detail:'Shared techniques · full ATB for every partner',disabled:false},{id:'wait',label:'Wait for allies',detail:'Advance time until the whole party is ready',disabled:false});
    if(b.view==='skills')for(const id of g.s.heroes.find(h=>h.id===actor.id).skills){const d=SKILLS[id];commands.push({id,label:d.name,detail:`${d.mp} MP · ${d.desc}`,disabled:actor.mp<d.mp});}
    if(b.view==='links')for(const d of Object.values(LINKS)){const issue=linkIssue(g,d);commands.push({id:d.id,label:d.name,detail:issue||`${d.mp} MP each · ${d.desc}`,disabled:!!issue});}
    if(b.view==='items'){const grouped=new Map();for(const i of g.s.inventory.filter(i=>ITEMS[i.id].slot==='consumable')){if(!grouped.has(i.id))grouped.set(i.id,{item:i,n:0});grouped.get(i.id).n++;}for(const {item,n}of grouped.values()){const d=ITEMS[item.id];commands.push({id:item.uid,label:`${itemName(item)} ×${n}`,detail:d.desc,disabled:d.effect==='revive'&&!b.heroes.some(h=>!alive(h))});}}
    if(b.view==='target'&&b.pending)targets=validTargets(b,b.pending.definition).map(t=>({id:t.id,label:`${t.name} · ${t.hp}/${t.maxHp} HP${t.side==='hero'?` · ${t.mp}/${t.maxMp} MP`:''}`}));
  }else if(b.waiting&&!b.action)commands.push({id:'resume',label:'Act now',detail:'Stop waiting and use a ready ally',disabled:!b.heroes.some(ready)});
  return {readyHero:b.readyHero,hero:actor||null,phase:b.phase,view:b.view,commands,targets,log:b.log.slice(-4),waiting:b.waiting,action:b.action?.definition.name||null,pending:b.pending?.definition.name||null,reward:b.reward,heroes:b.heroes,enemies:b.enemies};
}

function bar(ctx,x,y,w,fraction,color){ctx.fillStyle='#201b29';ctx.fillRect(x,y,w,5);ctx.fillStyle=color;ctx.fillRect(x,y,Math.max(0,w*clamp(fraction,0,1)),5);}
export function actionFrame(action){
  if(action.elapsed<action.impactAt)return clamp(Math.floor(action.elapsed/action.impactAt*3),0,2);
  if(action.elapsed<action.impactAt+0.22)return 3;
  return 4+clamp(Math.floor((action.elapsed-action.impactAt-0.22)/Math.max(0.01,action.total-action.impactAt-0.22)*2),0,1);
}
export function drawBattle(ctx,g){
  const b=g.battle;if(!b)return;drawBattleBackground(ctx,g);
  ctx.save();ctx.fillStyle='#c7b9c3';ctx.font='11px system-ui';ctx.fillText(b.action?`${b.action.side==='enemy'?'INCOMING  ':''}${b.action.definition.name}`:b.waiting?'HOLDING · Allies are gathering their strength':b.readyHero?`${HEROES[b.readyHero].name} is ready`:'THE HOUR IS MOVING',340,128);
  if(b.loopBroken){ctx.fillStyle='#f7c879';ctx.font='11px system-ui';ctx.fillText('THE LOOP IS OPEN',490,145);}
  const a=b.action,reducedMotion=g.s.settings.reducedMotion,units=[...b.heroes,...b.enemies];
  const poses=new Map(units.map(unit=>[unit.id,battlePose(b,unit,{time:g.time||b.time,reducedMotion})]));
  // Shadows stay on the ground lane while feet lift into a leap or a void glide.
  for(const unit of units){const p=poses.get(unit.id);ctx.fillStyle=`rgba(14,12,26,${alive(unit)?.27:.12})`;ctx.beginPath();ctx.ellipse(p.x,p.groundY+3,(unit.boss?49:unit.side==='hero'?29:36)*(1-clamp(p.lift/200,0,.3)),unit.boss?11:7,0,0,Math.PI*2);ctx.fill();}
  if(a&&!reducedMotion){
    for(const id of a.participants){const unit=unitBy(b,id),p=poses.get(id);if(!p?.traveling||!p.offensive)continue;
      const color=unit.side==='hero'?HEROES[id].color:'#de9a86';ctx.strokeStyle=color;ctx.lineCap='round';
      // A short positional trail follows the same sampled path as the sprite.
      for(let n=3;n>0;n--){const old=battlePose(b,unit,{elapsed:Math.max(0,a.elapsed-n*.026),reducedMotion});ctx.globalAlpha=.12+(3-n)*.06;ctx.lineWidth=unit.id==='vex'?8:3;ctx.beginPath();ctx.moveTo(old.x,old.y-30);ctx.lineTo(p.x,p.y-30);ctx.stroke();}
      ctx.globalAlpha=1;
    }
  }
  // Depth follows the moved ground lane. At contact the attacking body is drawn
  // over its target, so the sword/fist cannot disappear behind the enemy atlas.
  const ordered=[...units].sort((u,v)=>{const p=poses.get(u.id),q=poses.get(v.id);return (p.groundY+(p.phase==='strike'?12:0))-(q.groundY+(q.phase==='strike'?12:0));});
  for(const unit of ordered){
    const p=poses.get(unit.id),{state,artTime}=p;
    if(unit.id===b.readyHero&&!a){ctx.strokeStyle=HEROES[unit.id].color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.groundY+3,43,10,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=HEROES[unit.id].color;ctx.beginPath();ctx.moveTo(p.x,p.y-119);ctx.lineTo(p.x-6,p.y-129);ctx.lineTo(p.x+6,p.y-129);ctx.fill();}
    if(unit.side==='hero'){
      const preview=state==='idle'&&g.kaidaIdlePreview?.heroes.includes(unit.id)?g.kaidaIdlePreview:null;
      drawHero(ctx,unit.id,state,p.x,p.y,1.25,p.facing,preview?.time??artTime,{battleIdle:true,staticIdle:preview?.mode==='static',reducedMotion});
    }
    else {const phase=unit.catalogId==='architect'?(unit.hp/unit.maxHp>.66?1:unit.hp/unit.maxHp>.33?2:3):1;ctx.save();ctx.globalAlpha=alive(unit)?1:state==='death'?1:.35;if(p.facing==='right'){ctx.translate(p.x,p.y);ctx.scale(-1,1);drawEnemy(ctx,unit.catalogId,state,0,0,unit.boss?2.05:1.5,artTime,phase);}else drawEnemy(ctx,unit.catalogId,state,p.x,p.y,unit.boss?2.05:1.5,artTime,phase);ctx.restore();}
    if(unit.status.shield>0&&alive(unit)){ctx.strokeStyle='#8ce5dd90';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-43,43,58,0,0,Math.PI*2);ctx.stroke();}
    if(unit.status.immune>0&&unit.status.immuneTime>0){ctx.strokeStyle='#a4c8ff';ctx.setLineDash([5,4]);ctx.strokeRect(p.x-43,p.y-102,86,110);ctx.setLineDash([]);}
  }
  drawContactEffects(ctx,b,poses,reducedMotion);
  // Enemy health/ATB and selection information belong to stable formation slots.
  for(const unit of units){
    const p=formationPosition(b,unit),pose=poses.get(unit.id);
    if(unit.side==='enemy'&&alive(unit)){
      ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#251c2a';ctx.fillRect(p.x-83,p.y+14,166,34);ctx.fillStyle='#f5ddc4';ctx.fillText(unit.name,p.x,p.y+28);bar(ctx,p.x-65,p.y+35,130,unit.hp/unit.maxHp,'#df9b7b');bar(ctx,p.x-65,p.y+42,130,unit.atb/100,'#9c84c3');
      if(unit.atb>65||a?.actorId===unit.id){const y=Math.max(141,pose.y-bodyGeometry(unit).renderHeight-9);ctx.font='11px system-ui';const intent=a?.actorId===unit.id?a.definition.name:`Next: ${enemyPlan(unit).name}`,width=ctx.measureText(intent).width;ctx.fillStyle='#221e2cd9';ctx.fillRect(pose.x-width/2-6,y-12,width+12,17);ctx.fillStyle='#ffe29b';ctx.fillText(intent,pose.x,y);}
    }
    const statuses=[];if(unit.status.guard>0)statuses.push('GUARD');if(unit.status.slow>0)statuses.push('SLOW');if(unit.status.taunt>0)statuses.push('TAUNT');if(unit.status.shield>0)statuses.push(`SHIELD ${Math.ceil(unit.status.shield)}`);if(statuses.length){ctx.font='10px system-ui';ctx.fillStyle='#c1e7dd';ctx.textAlign='center';ctx.fillText(statuses.join(' · '),p.x,p.y+11);}
  }
  for(const f of b.floats){const unit=unitBy(b,f.id);if(!unit)continue;const p=poses.get(unit.id);ctx.textAlign='center';ctx.globalAlpha=Math.min(1,f.time*2);ctx.font='bold 20px system-ui';ctx.lineWidth=4;ctx.strokeStyle='#251b2f';const y=p.y-bodyGeometry(unit).height*.7-(1.15-f.time)*35-f.offset;ctx.strokeText(f.text,p.x,y);ctx.fillStyle=f.color;ctx.fillText(f.text,p.x,y);ctx.globalAlpha=1;}
  ctx.restore();
}

function drawContactEffects(ctx,b,poses,reducedMotion){
  const a=b.action;if(!a)return;
  const age=a.elapsed-a.impactAt,isOffensive=a.side==='enemy'||['enemy','enemies'].includes(a.definition.target);
  const color=a.kind==='link'?'#f5d990':a.side==='hero'?HEROES[a.actorId]?.color||'#a5dfee':'#eaab9c';
  ctx.save();ctx.lineCap='round';
  // Projected attacks visibly leave the caster and reach their socket at impact.
  for(const id of a.participants){const p=poses.get(id);if(!p?.offensive||!p.targetPoint)continue;
    const ranged=p.contactMode==='projection',voidStrike=id==='vex';
    if(ranged&&age<0&&age>-.17&&!reducedMotion){const u=clamp(1+age/.17,0,1),x=p.tip.x+(p.targetPoint.x-p.tip.x)*u,y=p.tip.y+(p.targetPoint.y-p.tip.y)*u;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    if(age>=0&&age<.22&&(ranged||voidStrike)){
      const origin=voidStrike?{x:p.x+38,y:p.y-44}:p.tip;ctx.globalAlpha=(1-age/.3)*.8;ctx.strokeStyle=color;ctx.lineWidth=voidStrike?5:3;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.quadraticCurveTo((origin.x+p.targetPoint.x)/2,p.targetPoint.y-20,p.targetPoint.x,p.targetPoint.y);ctx.stroke();
    }
    if(age>=0&&age<.22&&!ranged){
      const c=p.targetPoint,flash=1-age/.22;ctx.globalAlpha=flash;ctx.strokeStyle=id==='rune'?'#fff0bc':color;ctx.lineWidth=id==='rune'?5:3;ctx.beginPath();
      if(id==='rune'){ctx.arc(c.x,c.y,8+(1-flash)*14,0,Math.PI*2);}
      else{ctx.moveTo(c.x-15,c.y+19);ctx.lineTo(c.x+13,c.y-19);ctx.moveTo(c.x-10,c.y-14);ctx.lineTo(c.x+10,c.y+14);}
      ctx.stroke();
    }
  }
  if(age>=0&&age<.35){
    const progress=age/.35,contacts=actionContacts(b);ctx.globalAlpha=(1-progress)*.85;
    for(const contact of contacts){const p=poses.get(contact.targetId),unit=unitBy(b,contact.targetId);if(!p||!unit)continue;
      const x=isOffensive?contact.x: p.x,y=isOffensive?contact.y:p.y-44;
      // An area strike chains out from the landing socket to every chosen target.
      if(isOffensive&&contacts.length>1){const lead=poses.get(a.participants[0])?.targetPoint;if(lead){ctx.strokeStyle=color;ctx.lineWidth=a.kind==='link'?3:2;ctx.beginPath();ctx.moveTo(lead.x,lead.y);ctx.quadraticCurveTo((lead.x+x)/2+20,(lead.y+y)/2-24,x,y);ctx.stroke();}}
      ctx.strokeStyle=isOffensive?color:'#a9e2c3';ctx.lineWidth=a.kind==='link'?4:2;ctx.beginPath();ctx.arc(x,y,10+progress*(reducedMotion?18:40),0,Math.PI*2);ctx.stroke();
      if(!reducedMotion)for(let n=0;n<6;n++){const ang=n*Math.PI/3;ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(x+Math.cos(ang)*(15+progress*43)-2,y+Math.sin(ang)*(15+progress*43)-2,4,4);}
    }
  }
  ctx.restore();
}
