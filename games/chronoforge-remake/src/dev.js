// Explicit development opt-in only: imported exclusively with ?dev=1.
// These helpers INITIALIZE documented scenarios. Gameplay actions still run
// through the same combat, progression, collision, save and narrative systems.
import * as State from './state.js';
import {ITEMS,SKILLS,HEROES,ENEMIES} from './data.js';
import {REGIONS,OBJECTS,INTERIORS,getObjects,walkable,findPath} from './world.js';
import {startBattle,updateBattle,battleAction,battlePose} from './battle.js';
import {setAudio} from './audio.js';
import {PREVIEW_ENCOUNTERS,previewEncounter,createBattlePreviewState} from './battle-preview.js';

const allObjects=()=>[...OBJECTS,...Object.values(INTERIORS).flatMap(room=>room.objects.map(o=>({...o,inRoom:room.id})))];
export function installDev(g,api){
 let idleControls=null,idleReturn=null;
 const idleMode=mode=>{if(!['animated','static'].includes(mode))throw new Error('Idle mode must be animated or static');return mode;};
 function clearIdlePreview({restore=false}={}){
  const active=!!g.kaidaIdlePreview,previous=idleReturn;
  delete g.kaidaIdlePreview;idleControls?.remove();idleControls=null;idleReturn=null;
  if(active){g.devPaused=false;g.keys.clear();}
  if(restore&&previous){
   Object.assign(g,previous);g.keys.clear();
   const toast=document.getElementById('toast');if(toast){toast.textContent=g.toastMsg||'';toast.classList.toggle('show',(g.toastUntil||0)>g.time);}
  }
  if(active)setAudio(g.s.settings.sound);
  return active;
 }
 // The normal game's action/reset paths can dismiss this optional review too.
 g.clearKaidaIdlePreview=clearIdlePreview;
 function updateIdleControls(){
  if(!idleControls)return;
  const preview=g.kaidaIdlePreview;
  idleControls.querySelector('[data-idle-title]').textContent=`Battle preview · ${preview.playing?'Battle active':'Combat paused'}`;
  const index=PREVIEW_ENCOUNTERS.findIndex(encounter=>encounter.id===preview.encounterId),encounter=PREVIEW_ENCOUNTERS[index];
  idleControls.querySelector('[data-encounter]').value=encounter.id;
  idleControls.querySelector('[data-encounter-details]').textContent=`${index+1} / ${PREVIEW_ENCOUNTERS.length} · Party Lv ${g.s.heroes[0].level} · ${encounter.enemies.map(id=>ENEMIES[id].name).join(' + ')}`;
  idleControls.querySelector('[data-phase-label]').style.display=encounter.enemies.includes('architect')?'block':'none';
  idleControls.querySelector('[data-phase]').value=String(preview.phase);
  const combat=idleControls.querySelector('[data-idle-combat]');
  combat.textContent=preview.playing?'Pause battle':preview.started?'Resume battle':'Start battle';
  combat.setAttribute('aria-pressed',String(preview.playing));
  for(const button of idleControls.querySelectorAll('[data-idle-mode]')){
   const selected=button.dataset.idleMode===g.kaidaIdlePreview?.mode;
   button.setAttribute('aria-pressed',String(selected));button.style.background=selected?'#554163':'#292431';button.style.borderColor=selected?'#edcc86':'#71647d';
  }
 }
 function showIdleControls(){
  idleControls=document.createElement('section');idleControls.id='kaida-idle-review';idleControls.setAttribute('role','group');idleControls.setAttribute('aria-label','Battle scene review');
  idleControls.style.cssText='padding:12px;border:1px solid #b49e78;border-radius:8px;background:#211c29f5;color:#f6ead4;font:13px system-ui;box-shadow:0 3px 20px #0006;width:min(960px,calc(100vw - 20px));flex-shrink:0;box-sizing:border-box';
  // Reserve a rail below the stage so the picker never covers a sprite or command.
  const layout=document.createElement('style');layout.textContent='body:has(#kaida-idle-review){display:flex;flex-direction:column;justify-content:center;gap:10px;padding:10px;overflow:auto}body:has(#kaida-idle-review) #game{width:clamp(320px,calc((100dvh - 220px)*1.6),1440px);max-width:calc(100vw - 20px);flex-shrink:0}';idleControls.append(layout);
  const title=document.createElement('div');title.dataset.idleTitle='';title.style.cssText='font-weight:600;margin-bottom:9px';idleControls.append(title);
  const controlStyle='padding:7px 9px;border:1px solid #71647d;border-radius:4px;background:#292431;color:#f6ead4;font:inherit;cursor:pointer';
  const nav=document.createElement('div');nav.style.cssText='display:flex;gap:7px;align-items:center';
  const previous=document.createElement('button');previous.type='button';previous.dataset.previousBattle='';previous.textContent='←';previous.setAttribute('aria-label','Previous battle');previous.title='Previous battle';previous.style.cssText=controlStyle;previous.addEventListener('click',()=>{dev.cyclePreviewBattle(-1);idleControls.querySelector('[data-previous-battle]').focus();});nav.append(previous);
  const select=document.createElement('select');select.dataset.encounter='';select.setAttribute('aria-label','Battle encounter');select.style.cssText=controlStyle+';flex:1;min-width:0;width:0';
  PREVIEW_ENCOUNTERS.forEach((encounter,index)=>{const option=document.createElement('option');option.value=encounter.id;option.textContent=`${index+1}. ${encounter.name} · ${REGIONS.find(r=>r.id===encounter.region)?.name||encounter.region}${encounter.boss?' · Boss':''}`;select.append(option);});
  select.addEventListener('change',()=>{dev.previewBattle(select.value);idleControls.querySelector('[data-encounter]').focus();});nav.append(select);
  const next=document.createElement('button');next.type='button';next.dataset.nextBattle='';next.textContent='→';next.setAttribute('aria-label','Next battle');next.title='Next battle';next.style.cssText=controlStyle;next.addEventListener('click',()=>{dev.cyclePreviewBattle(1);idleControls.querySelector('[data-next-battle]').focus();});nav.append(next);idleControls.append(nav);
  const details=document.createElement('div');details.dataset.encounterDetails='';details.style.cssText='margin:8px 0;color:#c4b8c9;font-size:12px';idleControls.append(details);
  const phaseLabel=document.createElement('label');phaseLabel.dataset.phaseLabel='';phaseLabel.textContent='Start phase ';phaseLabel.style.cssText='display:block;margin:8px 0';
  const phase=document.createElement('select');phase.dataset.phase='';phase.setAttribute('aria-label','Architect starting phase');phase.style.cssText=controlStyle;
  for(const value of [1,2,3]){const option=document.createElement('option');option.value=String(value);option.textContent=`Phase ${value}`;phase.append(option);}
  phase.addEventListener('change',()=>{dev.previewBattle(g.kaidaIdlePreview.encounterId,{phase:Number(phase.value)});idleControls.querySelector('[data-phase]').focus();});phaseLabel.append(phase);idleControls.append(phaseLabel);
  const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
  for(const mode of ['animated','static']){
   const button=document.createElement('button');button.type='button';button.textContent=mode==='animated'?'Animated':'Static';button.dataset.idleMode=mode;
   button.style.cssText='padding:7px 11px;border:1px solid #71647d;border-radius:4px;color:#f6ead4;font:inherit;cursor:pointer';button.addEventListener('click',()=>dev.kaidaIdleMode(mode));buttons.append(button);
  }
  const combat=document.createElement('button');combat.type='button';combat.dataset.idleCombat='';combat.style.cssText='padding:7px 11px;border:1px solid #edcc86;border-radius:4px;background:#554163;color:#f6ead4;font:inherit;cursor:pointer';combat.addEventListener('click',()=>dev.playIdleBattle(!g.kaidaIdlePreview.playing));buttons.append(combat);
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset battle';reset.style.cssText=controlStyle;reset.addEventListener('click',()=>dev.previewBattle(g.kaidaIdlePreview.encounterId,{phase:g.kaidaIdlePreview.phase}));buttons.append(reset);
  const exit=document.createElement('button');exit.type='button';exit.textContent='Exit review';exit.style.cssText='padding:7px 11px;border:1px solid #71647d;border-radius:4px;background:#292431;color:#f6ead4;font:inherit;cursor:pointer';exit.addEventListener('click',()=>dev.exitKaidaIdle());buttons.append(exit);
  idleControls.append(buttons);
  // Native button keyboard behavior remains available without sending game keys.
  for(const event of ['keydown','keyup','click'])idleControls.addEventListener(event,e=>e.stopPropagation());
  document.body.append(idleControls);updateIdleControls();
 }
 function levelTo(s,level){while(s.heroes[0].level<level)State.gainXp(s,State.nextXp(s.heroes[0].level)-s.heroes[0].xp);}
 function setState(s){const clean=State.validateState(s);if(!clean)throw new Error('Invalid checkpoint state');clearIdlePreview();g.s=clean;api.resetTransient();g.mode='world';api.ensurePosition();g.refresh();}
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
  clearIdlePreview();
  const p=g.s.party;if(obj.inRoom){p.interior=obj.inRoom;const door=OBJECTS.find(o=>o.interior===obj.inRoom);p.returnPoint={x:door?.x||400,y:(door?.y||925)+35};}else{p.interior=null;p.returnPoint=null;}
  p.x=obj.x;p.y=obj.y+(obj.exit?-Math.abs(distance):distance);g.camera=null;g.path=[];g.trail=[];g.encounterGrace=60;api.ensurePosition();g.nearby=obj;g.refresh();return api.snapshot();
 }
 const dev={
  checkpoints:['fresh','settlement','midgame','links','anchors','finale','defeat'],checkpoint,
  kaidaIdle(mode='animated',heroes=['kaida'],encounterId='road_scrappers',phase=1){
   idleMode(mode);
   const encounter=previewEncounter(encounterId);
   if(![1,2,3].includes(phase)||phase!==1&&!encounter.enemies.includes('architect'))throw new Error('Unsupported preview phase');
   const state=createBattlePreviewState(encounter);
   const previous=idleReturn||{s:g.s,mode:g.mode,overlay:g.overlay,dialogue:g.dialogue,battle:g.battle,devPaused:g.devPaused,devCheckpoint:g.devCheckpoint,time:g.time,ui:structuredClone(g.ui),camera:g.camera,path:g.path,trail:g.trail,nearby:g.nearby,interactPending:g.interactPending,encounterGrace:g.encounterGrace,moving:g.moving,facing:g.facing,reward:g.reward,toastMsg:g.toastMsg,toastUntil:g.toastUntil};
   clearIdlePreview();api.resetTransient();g.s=state;g.reward=null;g.toastMsg='';g.toastUntil=0;
   document.getElementById('toast')?.classList.remove('show');
   startBattle(g,encounter,{startingPhase:phase});
   for(const unit of [...g.battle.heroes,...g.battle.enemies])unit.atb=0;
   g.battle.readyHero=null;g.battle.phase='filling';g.devPaused=true;g.devCheckpoint=heroes.length>1?'party-idle':'kaida-idle';g.kaidaIdlePreview={mode,time:0,heroes,encounterId,phase,enemies:heroes.length>1,playing:false,started:false};idleReturn=previous;
   setAudio(false);showIdleControls();g.refresh();return api.snapshot();
  },
  partyIdle(mode='animated'){return dev.kaidaIdle(mode,['kaida','vex','rune']);},
  previewEncounters:PREVIEW_ENCOUNTERS.map(({id,name,region,enemies,boss})=>({id,name,region,enemies:[...enemies],boss:!!boss})),
  previewBattle(id='road_scrappers',{phase=1}={}){return dev.kaidaIdle(g.kaidaIdlePreview?.mode||'animated',g.kaidaIdlePreview?.heroes||['kaida','vex','rune'],id,phase);},
  cyclePreviewBattle(direction=1){
   if(!Number.isInteger(direction))throw new Error('Battle step must be an integer');
   const index=PREVIEW_ENCOUNTERS.findIndex(encounter=>encounter.id===g.kaidaIdlePreview?.encounterId),count=PREVIEW_ENCOUNTERS.length;
   return dev.previewBattle(PREVIEW_ENCOUNTERS[((Math.max(0,index)+direction)%count+count)%count].id);
  },
  playIdleBattle(playing=true){
   if(!g.kaidaIdlePreview||g.mode!=='battle')throw new Error('No preview battle is active');
   g.kaidaIdlePreview.playing=!!playing;g.kaidaIdlePreview.started ||= !!playing;g.devPaused=!playing;
   g.overlay=null;g.keys.clear();updateIdleControls();g.refresh();return api.snapshot();
  },
  kaidaIdleMode(mode){idleMode(mode);if(!g.kaidaIdlePreview)throw new Error('No Kaida idle review is active');g.kaidaIdlePreview.mode=mode;updateIdleControls();g.refresh();return api.snapshot();},
  exitKaidaIdle(){clearIdlePreview({restore:true});g.refresh();return api.snapshot();},
  loadState:raw=>{setState(raw);return api.snapshot();},
  near,
  teleport(x,y,interior=null){clearIdlePreview();g.s.party={x,y,interior,returnPoint:null};g.path=[];g.camera=null;g.trail=[];g.encounterGrace=60;api.ensurePosition();g.refresh();return api.snapshot();},
  startBattle(id,{ready=false,story=false}={}){const o=allObjects().find(o=>o.type==='encounter'&&o.id===id);if(!o)throw new Error('Unknown encounter: '+id);clearIdlePreview();g.overlay=null;g.path=[];if(story)g.startBattle(o);else startBattle(g,o);if(ready&&g.battle){for(const h of g.battle.heroes)h.atb=100;updateBattle(g,.001);}g.refresh();return api.snapshot();},
  ready(ids=['kaida','vex','rune']){if(!g.battle)throw new Error('No battle');clearIdlePreview();for(const h of g.battle.heroes)if(ids.includes(h.id))h.atb=100;g.battle.waiting=false;updateBattle(g,.001);g.refresh();return api.snapshot();},
  hero(id,values){const h=g.battle?.heroes.find(h=>h.id===id)||g.s.heroes.find(h=>h.id===id);if(!h)throw new Error('Unknown hero');clearIdlePreview();for(const key of ['hp','mp','atb'])if(Number.isFinite(values[key]))h[key]=Math.max(0,values[key]);g.refresh();return api.snapshot();},
  enemy(id,values){const e=g.battle?.enemies.find(e=>e.id===id||e.catalogId===id);if(!e)throw new Error('Unknown enemy');clearIdlePreview();for(const key of ['hp','atb'])if(Number.isFinite(values[key]))e[key]=Math.max(0,values[key]);g.refresh();return api.snapshot();},
  advance(seconds=1){if(!Number.isFinite(seconds)||seconds<0||seconds>300)throw new Error('Advance between 0 and 300 seconds');clearIdlePreview();for(let t=0;t<seconds;t+=1/60){const dt=Math.min(1/60,seconds-t);if(g.mode==='battle'&&!g.overlay)updateBattle(g,dt);State.tickSettlement(g.s,dt);g.s.elapsed+=dt;g.time+=dt;}g.refresh();return api.snapshot();},
  interaction(id){clearIdlePreview();g.interact(id);return api.snapshot();},
  objects:()=>allObjects().map(o=>({id:o.id,type:o.type,x:o.x,y:o.y,region:o.region,inRoom:o.inRoom,requires:o.requires})),
  collision:(x,y)=>walkable(g.s,x,y),path:(x,y)=>findPath(g.s,g.s.party,{x,y}),
  snapshot:api.snapshot,
  pause(){g.devPaused=true;g.refresh();return api.snapshot();},
  resume(){clearIdlePreview();g.devPaused=false;g.refresh();return api.snapshot();},
  battleAction(action,payload={}){clearIdlePreview();const result=battleAction(g,action,payload);g.refresh();return {result,snapshot:api.snapshot()};},
  poses(){return g.battle?[...g.battle.heroes,...g.battle.enemies].map(unit=>({id:unit.id,...battlePose(g.battle,unit,{time:g.time,reducedMotion:g.s.settings.reducedMotion})})):[];},
 };
 Object.defineProperty(window,'__dev',{value:Object.freeze(dev)});
 const query=new URLSearchParams(location.search);if(query.get('dev')==='1'){
  if(['kaida-idle','party-idle','battles'].includes(query.get('preview'))){
   const id=PREVIEW_ENCOUNTERS.some(encounter=>encounter.id===query.get('encounter'))?query.get('encounter'):'road_scrappers';
   const requestedPhase=Number(query.get('phase'));
   const phase=id==='architect'&&[1,2,3].includes(requestedPhase)?requestedPhase:1;
   dev.kaidaIdle('animated',query.get('preview')==='kaida-idle'?['kaida']:['kaida','vex','rune'],id,phase);
  }
 }
 console.info('Chronoforge development checkpoints enabled. window.__dev.checkpoints lists scenario fixtures.');
}
