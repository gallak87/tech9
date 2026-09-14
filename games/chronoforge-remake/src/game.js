import * as State from './state.js';
import {ITEMS,BUILDINGS} from './data.js';
import {REGIONS,TOWNS,INTERIORS,OBJECTS,regionAt,getObjects,walkable,findPath,enterDoor,exitInterior} from './world.js';
import {drawWorld} from './render.js';
import {startBattle,updateBattle,drawBattle,battleAction,battleView} from './battle.js';
import {renderUI,handleUIKey} from './ui.js';
import {loadArt} from './art.js';
import {createGameDisplay} from './display.js';
import {unlockAudio,setAudio,sound,tickAudio} from './audio.js';
import {say,prologue,objective,journalEntries,beforeEncounter,afterVictory,npcStory,signStory,openChest,touchAnchor,anchorCount} from './story.js';

const canvas=document.getElementById('canvas'),display=createGameDisplay(canvas),ctx=display.ctx;
const clone=x=>JSON.parse(JSON.stringify(x));
const g={s:State.createState(),mode:'title',overlay:null,ui:{tab:0,hero:0},time:0,keys:new Set(),camera:{x:0,y:640},path:[],moving:false,running:false,facing:'down',battle:null,nearby:null,trail:[],encounterGrace:0,dirty:true,battleSound:sound,
 toast(text){this.toastMsg=text;this.toastUntil=this.time+4;const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');this.dirty=true;},
 refresh(){this.storyObjective=objective(this.s);this.dirty=true;},
 journalEntries(){return journalEntries(this.s);},
 save(slot='auto'){if(this.kaidaIdlePreview)return {ok:false,message:'Preview battles are not saved.'};const r=State.save(this.s,slot);if(!r.ok||slot!=='auto')this.toast(r.message);return r;},
 openMenu(tab=this.ui.tab){if(!['world','battle'].includes(this.mode)||this.overlay==='dialogue')return;this.overlay='menu';this.ui.tab=tab;this.keys.clear();this.path=[];sound('ui');this.refresh();},
 startBattle(encounter){beforeEncounter(this,encounter,()=>{this.overlay=null;this.keys.clear();this.path=[];this.interactPending=null;startBattle(this,encounter);this.refresh();});},
 finishBattle(win,reward){if(this.kaidaIdlePreview){this.clearKaidaIdlePreview({restore:true});this.refresh();return;}const enc=this.battle?.encounter;this.battle=null;this.mode='world';this.overlay=null;this.path=[];this.encounterGrace=3;this.trail=[];this.refresh();if(win&&enc){sound('victory');afterVictory(this,enc);}else{this.toast('The crew recovered. Your supplies and progress are intact.');this.save();}},
 interact(id){interact(id);},
 act(action,payload={}){act(action,payload);},
};

function resetTransient(){g.clearKaidaIdlePreview?.();g.overlay=null;g.dialogue=null;g.battle=null;g.path=[];g.keys.clear();g.trail=[];g.nearby=null;g.interactPending=null;g.encounterGrace=2;g.moving=false;g.facing='down';g.ui.item=null;g.camera=null;g.devPaused=false;}
function ensurePosition(){
 if(g.s.party.interior&&!INTERIORS[g.s.party.interior])g.s.party={...g.s.lastTown,interior:null,returnPoint:null};
 if(!walkable(g.s,g.s.party.x,g.s.party.y)){
  const p=g.s.party;let found=false;for(let rad=16;rad<=160&&!found;rad+=16)for(const [dx,dy]of [[0,rad],[rad,0],[0,-rad],[-rad,0],[rad,rad]])if(walkable(g.s,p.x+dx,p.y+dy)){p.x+=dx;p.y+=dy;found=true;break;}
  if(!found)g.s.party={x:400,y:960,interior:null,returnPoint:null};
 }
}
function resume(slot){const s=State.load(slot);if(!s){g.toast('That save is missing or damaged. Your current journey is unchanged.');return;}g.s=s;resetTransient();g.mode='world';ensurePosition();setAudio(g.s.settings.sound);g.refresh();g.toast('Your journey continues.');}
function advanceDialogue(){
 const d=g.dialogue;if(!d)return;
 if(d.index<d.lines.length-1){d.index++;sound('ui');g.refresh();return;}
 if(d.choices?.length)return;
 const done=d.onDone;g.overlay=null;g.dialogue=null;done?.();g.keys.clear();g.refresh();
}
function transaction(fn){const r=fn();g.toast(r.message);sound(r.ok?'build':'error');if(r.ok)g.save();g.refresh();return r;}
function act(action,p={}){
 // Preview combat is opt-in. Keep its return session even while fighting.
 if(g.kaidaIdlePreview&&!['setting','menu','close'].includes(action)&&
   !(g.kaidaIdlePreview.playing&&['battle','retry','retreat','rewardContinue'].includes(action)))return;
 unlockAudio();
 if(g.mode==='battle'&&['save','load','deleteSave','fastTravel','equip','unequip','learn','useItem','sell'].includes(action)){g.toast('Battle paused. Finish the encounter before changing the party or saving.');return;}
 if(action==='newGame'){g.s=State.createState();resetTransient();g.mode='world';g.refresh();prologue(g);return;}
 if(action==='continue'||action==='load'){resume(p.slot||'auto');return;}
 if(action==='dialogueNext'){advanceDialogue();return;}
 if(action==='dialogueChoice'){
  const d=g.dialogue,c=d?.index===d?.lines.length-1?d.choices?.find(c=>c.id===p.id):null;if(!c||c.disabled)return;
  const old=d;if(c.onChoose?.()===false)return;
  if(g.dialogue===old){g.dialogue=null;g.overlay=null;old.onDone?.();}g.refresh();return;
 }
 if(action==='endingContinue'){g.mode='world';g.overlay=null;g.dialogue=null;g.refresh();return;}
 if(action==='save'&&g.mode==='ending'){g.save(p.slot||'1');g.refresh();return;}
 if(action==='battle'){const r=battleAction(g,p.action,p);g.refresh();return r;}
 if(action==='retry'||action==='retreat'||action==='rewardContinue'){return act('battle',{action:action==='rewardContinue'?'continue':action});}
 if(action==='close'){
  if(g.overlay==='dialogue')return;
  g.overlay=null;g.keys.clear();g.ui.deleteSlot=null;g.refresh();return;
 }
 if(action==='menu'){g.openMenu(p.tab);return;}
 if(action==='interact'){g.interact(p.id);return;}
 if(action==='setting'){
  if(p.key==='speed'&&[.75,1,1.25,1.5,2].includes(Number(p.value)))g.s.settings.speed=Number(p.value);
  else if(['wait','sound','reducedMotion'].includes(p.key))g.s.settings[p.key]=!!p.value;
  setAudio(g.s.settings.sound);if(g.mode==='world')g.save();g.refresh();return;
 }
 if(g.mode!=='world')return;
 const operations={equip:()=>State.equip(g.s,p.heroId,p.uid),unequip:()=>State.unequip(g.s,p.heroId,p.slot),learn:()=>State.learn(g.s,p.heroId,p.skillId),useItem:()=>State.useItem(g.s,p.uid,p.heroId),sell:()=>State.sell(g.s,p.uid),
  buy:()=>g.overlay==='shop'&&ITEMS[p.itemId]?.tier<=(g.shop?.tier||1)?State.buy(g.s,p.itemId):{ok:false,message:'This shop does not carry that item.'},
  upgradeItem:()=>g.overlay==='forge'?State.upgradeItem(g.s,p.uid):{ok:false,message:'Visit a smith to improve your equipment.'},
  build:()=>State.build(g.s,Number(p.plot),p.type),upgradeBuilding:()=>State.upgradeBuilding(g.s,Number(p.plot)),collect:()=>State.collect(g.s),rest:()=>State.rest(g.s,!!p.free),
 };
 if(operations[action])return transaction(operations[action]);
 if(action==='save'){g.save(p.slot||'1');g.refresh();return;}
 if(action==='deleteSave'){transaction(()=>State.removeSave(p.slot));return;}
 if(action==='fastTravel'){
  const town=TOWNS.find(t=>t.region===p.regionId);if(!town||(town.region!=='haventide'&&!g.s.flags['visited_'+town.region])){g.toast('Visit this town before using its road marker.');return;}
  resetTransient();g.s.party={x:town.x,y:town.y,interior:null,returnPoint:null};g.s.lastTown={x:town.x,y:town.y};ensurePosition();g.save();g.toast(`Arrived in ${town.name}.`);g.refresh();
 }
}
function interact(id){
 if(g.mode!=='world'||g.overlay)return;
 const objects=getObjects(g.s),o=objects.find(o=>o.id===id)||g.nearby;if(!o)return;
 if(Math.hypot(o.x-g.s.party.x,o.y-g.s.party.y)>65){g.path=findPath(g.s,g.s.party,{x:o.x,y:o.y});g.interactPending=o.id;return;}
 g.keys.clear();g.path=[];g.interactPending=null;
 if(o.type==='door'){
  const missing=o.requires?.filter(flag=>!g.s.flags[flag]);
  if(missing?.length){say(g,[{speaker:o.name,text:'Three anchor memories and Iona’s living signal are needed to open this door. '+objective(g.s)}]);return;}
  if(o.interior==='crown_spire'&&!g.s.cleared.crown_gate){say(g,[{speaker:'The sealed spire',text:'The Herald maintains the lock. Defeat it in the south of Last Crown.'}]);return;}
  if(enterDoor(g.s,o)){g.camera=null;g.trail=[];g.encounterGrace=2;g.nearby=null;g.save();g.refresh();sound('ui');}return;
 }
 if(o.type==='npc'){
  if(o.service==='shop'||o.service==='smith'){g.overlay=o.service==='smith'?'forge':'shop';g.shop={name:o.service==='smith'?`${o.name}’s Smithy`:`${o.name}’s Supplies`,tier:o.tier||1};g.ui.shopTab='buy';g.refresh();return;}
  if(o.service==='inn'){
   const free=o.region==='haventide',cost=20+Math.max(...g.s.heroes.map(h=>h.level))*3;
   say(g,[{speaker:o.name,text:free?'Your room is ready. No charge for the crew that brought us home. Rest restores everyone’s HP and MP, including fallen companions.':`A warm meal and a room: 6 food, or ${cost} coins if your food has run low. Rest restores the whole crew.`}],null,[{id:'rest',label:free?'Rest · free':`Rest · 6 food / ${cost} coins`,detail:'Restore all HP and MP.',onChoose:()=>{transaction(()=>State.rest(g.s,free));sound('heal');return true;}},{id:'leave',label:'Back to the road',onChoose:()=>true}]);return;
  }
  npcStory(g,o);return;
 }
 if(o.type==='hall'||o.type==='plot'){g.overlay='settlement';g.settlementPlot=o.type==='hall'?-1:o.plot;g.refresh();return;}
 if(o.type==='chest'){openChest(g,o);return;}
 if(o.type==='anchor'){touchAnchor(g,o);return;}
 if(o.type==='encounter'){
  if(g.s.flags.victory&&o.id==='architect'){g.toast('The Architect’s loop is broken. The Chronoforge belongs to everyone now.');return;}
  g.startBattle(o);return;
 }
 if(o.type==='sign')signStory(g,o);
}
function updateWorld(dt){
 g.encounterGrace=Math.max(0,g.encounterGrace-dt);
 const p=g.s.party;let dx=0,dy=0;
 if(g.keys.has('w')||g.keys.has('arrowup'))dy--;
 if(g.keys.has('s')||g.keys.has('arrowdown'))dy++;
 if(g.keys.has('a')||g.keys.has('arrowleft'))dx--;
 if(g.keys.has('d')||g.keys.has('arrowright'))dx++;
 if(dx||dy){g.path=[];g.interactPending=null;}
 else if(g.path.length){const node=g.path[0],length=Math.hypot(node.x-p.x,node.y-p.y);if(length<5){g.path.shift();}else{dx=(node.x-p.x)/length;dy=(node.y-p.y)/length;}}
 g.running=g.keys.has('shift')||!!g.path.length;
 g.moving=!!(dx||dy);
 if(g.moving){
  const old={x:p.x,y:p.y};const len=Math.hypot(dx,dy),speed=g.running?180:105;dx=dx/len*speed*dt;dy=dy/len*speed*dt;
  if(walkable(g.s,p.x+dx,p.y))p.x+=dx;
  if(walkable(g.s,p.x,p.y+dy))p.y+=dy;
  const travel=Math.hypot(p.x-old.x,p.y-old.y);g.moving=travel>.05;
  if(!g.moving&&g.path.length)g.path=[];
  if(Math.abs(dx)>Math.abs(dy))g.facing=dx<0?'left':'right';else g.facing=dy<0?'up':'down';
  if(travel>0){g.trail.unshift({x:p.x,y:p.y,facing:g.facing});if(g.trail.length>90)g.trail.pop();}
 }
 const region=p.interior?REGIONS.find(r=>r.id===INTERIORS[p.interior]?.region):regionAt(p.x,p.y);
 if(region&&!g.s.discovered.includes(region.id)){g.s.discovered.push(region.id);g.toast(`${region.name} discovered.`);g.save();}
 if(!p.interior&&region?.town&&Math.hypot(p.x-region.town.x,p.y-region.town.y)<210){g.s.lastTown={x:region.town.x,y:region.town.y};g.s.flags['visited_'+region.id]=true;}
 const objects=getObjects(g.s);
 g.nearby=objects.filter(o=>!(o.type==='chest'&&g.s.chests.includes(o.id))).map(o=>({o,d:Math.hypot(o.x-p.x,o.y-p.y)})).filter(v=>v.d<62).sort((a,b)=>a.d-b.d)[0]?.o||null;
 if(g.interactPending){const target=objects.find(o=>o.id===g.interactPending);if(target&&Math.hypot(target.x-p.x,target.y-p.y)<50){interact(target.id);return;}if(!g.path.length)g.interactPending=null;}
 // Enter rooms deliberately; visible uncleared encounters trigger on contact.
 if(g.encounterGrace<=0){const enc=objects.find(o=>o.type==='encounter'&&!g.s.cleared[o.id]&&Math.hypot(o.x-p.x,o.y-p.y)<26);if(enc){g.startBattle(enc);return;}}
 if(p.interior&&p.y>423){const door=objects.find(o=>o.exit);if(door&&Math.abs(p.x-door.x)<44){enterDoor(g.s,door);g.camera=null;g.trail=[];g.save();}}
}
function onKey(e){
 const key=e.key.toLowerCase();
 if(['tab',' ','arrowup','arrowdown','arrowleft','arrowright','enter','escape'].includes(key))e.preventDefault();
 unlockAudio();
 if(e.repeat&&g.overlay&&key!=='arrowdown'&&key!=='arrowup')return;
 if(g.mode==='title'){if(key==='enter'||key===' '){if(document.activeElement?.closest('.title-actions'))document.activeElement.click();else act(State.saveMeta('auto')?'continue':'newGame');}else if(['arrowup','arrowdown','w','s'].includes(key)){const buttons=[...document.querySelectorAll('.title-actions button')];const n=buttons.indexOf(document.activeElement);buttons[(n+1)%buttons.length]?.focus();}return;}
 if(g.overlay==='dialogue'){
  if(key===' '||key==='enter'){const d=g.dialogue;if(d.index===d.lines.length-1&&d.choices?.length){if(document.activeElement?.matches('[data-action="dialogueChoice"]'))document.activeElement.click();else document.querySelector('[data-action="dialogueChoice"]:not(:disabled)')?.focus();}else advanceDialogue();}
  else if(key==='arrowleft'||key==='arrowright'||key==='arrowdown'||key==='arrowup'){const buttons=[...document.querySelectorAll('[data-action="dialogueChoice"]:not(:disabled)')];if(buttons.length){const index=buttons.indexOf(document.activeElement),d=key==='arrowleft'||key==='arrowup'?-1:1;buttons[(index+d+buttons.length)%buttons.length]?.focus();}}return;
 }
 if(g.mode==='ending'){if(key==='enter'||key===' ')act('endingContinue');return;}
 if(g.overlay){if(key==='escape'||key==='tab'){act('close');return;}handleUIKey(g,e.key);return;}
 if(g.mode==='battle'){
  if(key==='escape'||key==='tab'){g.openMenu();return;}
  if(key==='b'){act('battle',{action:'back'});return;}
  handleUIKey(g,e.key);return;
 }
 if(key==='escape'||key==='tab'){g.openMenu();return;}
 if(/^[1-7]$/.test(key)){g.openMenu(Number(key)-1);return;}
 if(key==='c'||key===' '||key==='enter'){if(g.nearby)interact(g.nearby.id);else g.toast('Walk near a person, door, cache, or landmark to interact.');return;}
 g.keys.add(key);
}
window.addEventListener('keydown',onKey);window.addEventListener('keyup',e=>g.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>g.keys.clear());
canvas.addEventListener('click',e=>{
 if(g.mode!=='world'||g.overlay)return;unlockAudio();const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*960/rect.width+(g.camera?.x||0),y=(e.clientY-rect.top)*600/rect.height+(g.camera?.y||0);
 const target=getObjects(g.s).filter(o=>Math.hypot(o.x-x,o.y-y)<38).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
 g.path=findPath(g.s,g.s.party,target||{x,y});g.interactPending=target?.id||null;g.keys.clear();
 if(target&&Math.hypot(target.x-g.s.party.x,target.y-g.s.party.y)<60)interact(target.id);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){g.keys.clear();if(g.mode==='world'&&!g.overlay)g.save();}});
window.addEventListener('beforeunload',()=>{if(g.mode==='world'&&!g.overlay)g.save();});

function snapshot(){
 return {mode:g.mode,overlay:g.overlay,paused:!!g.devPaused,kaidaIdlePreview:g.kaidaIdlePreview?clone(g.kaidaIdlePreview):null,state:clone(g.s),position:clone(g.s.party),region:g.s.party.interior?INTERIORS[g.s.party.interior]?.region:regionAt(g.s.party.x,g.s.party.y)?.id,objective:g.storyObjective,
 nearby:g.nearby?{id:g.nearby.id,type:g.nearby.type,name:g.nearby.name}:null,dialogue:g.dialogue?{index:g.dialogue.index,total:g.dialogue.lines.length,speaker:g.dialogue.lines[g.dialogue.index]?.speaker,text:g.dialogue.lines[g.dialogue.index]?.text,choices:g.dialogue.choices?.map(c=>({id:c.id,label:c.label}))}:null,
 battle:g.battle?{phase:g.battle.phase,view:g.battle.view,readyHero:g.battle.readyHero,encounter:g.battle.encounter.id,heroes:clone(g.battle.heroes),enemies:clone(g.battle.enemies),result:clone(g.battle.result||null),lastAction:clone(g.battle.lastAction||null),log:[...g.battle.log],action:g.battle.action?{kind:g.battle.action.kind,side:g.battle.action.side,id:g.battle.action.definition.id,actorId:g.battle.action.actorId,effect:g.battle.action.definition.effect,elapsed:g.battle.action.elapsed,impactAt:g.battle.action.impactAt,total:g.battle.action.total,participants:[...g.battle.action.participants],targetIds:[...g.battle.action.targetIds]}:null}:null,
 camera:g.camera,ending:g.ending||null};
}
window.render_game_to_text=()=>JSON.stringify(snapshot());
window.__chronoforge=Object.freeze({snapshot});

let last=performance.now(),hudTimer=0,autoTimer=0;
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;if(!g.devPaused)g.time+=dt;
 // Idle inspection keeps its own presentation clock. Start battle releases
 // the normal simulation clock while retaining the disposable preview state.
 if(g.kaidaIdlePreview&&g.mode==='battle'&&!g.overlay&&!document.hidden)g.kaidaIdlePreview.time+=dt;
 try{
  if(!g.devPaused&&!g.overlay&&(g.mode==='world'||g.mode==='battle')){
   if(g.mode==='world')updateWorld(dt);else updateBattle(g,dt);
   if(g.mode==='world'||!g.battle?.result){g.s.elapsed+=dt;State.tickSettlement(g.s,dt);}
   if(!g.kaidaIdlePreview){autoTimer+=dt;if(autoTimer>25&&g.mode==='world'){autoTimer=0;g.save();}}
  }
  if(display.beginFrame())g.dirty=true;
  if(g.mode==='battle')drawBattle(ctx,g);else drawWorld(ctx,g);
  hudTimer+=dt;if(g.dirty||hudTimer>.12){g.storyObjective=objective(g.s);renderUI(g);g.dirty=false;hudTimer=0;}
  if(g.toastUntil<g.time)document.getElementById('toast').classList.remove('show');
  tickAudio(g.mode,g.s.party.interior?INTERIORS[g.s.party.interior]?.region:regionAt(g.s.party.x,g.s.party.y)?.id);
 }catch(error){console.error(error);document.getElementById('toast').textContent='Something interrupted this moment. Your last save is safe.';document.getElementById('toast').classList.add('show');window.__runtimeError=error.message;return;}
 requestAnimationFrame(frame);
}
try{
 await loadArt();
 if(new URLSearchParams(location.search).get('dev')==='1'){const {installDev}=await import('./dev.js');installDev(g,{snapshot,resetTransient,ensurePosition});}
 renderUI(g);requestAnimationFrame(frame);
}catch(e){console.error(e);document.getElementById('overlay').innerHTML='<div style="padding:48px;color:#eedcba">The art could not be loaded. Refresh this page to try again.</div>';}
