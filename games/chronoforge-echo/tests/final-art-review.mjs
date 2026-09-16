import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run after campaign-browser.mjs. These are earned saves, never handcrafted
// chapter presets; production persistence restores both exploration and combat.
const base=new URL('../',import.meta.url).pathname;
const captureImages=process.env.REVIEW_SCREENSHOTS!=='0';
const polish=process.env.REVIEW_PASS==='polish';
const revision=process.env.REVIEW_PASS==='revision'||polish;
const archive=JSON.parse(await fs.readFile(base+'evidence/earned-campaign-saves.json','utf8'));
assert.equal(archive.completed,true,'Earned campaign must complete before final art review');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],report={method:'Independent production-rendered review at 1920×1080, using unmodified earned campaign saves via saveState/load. Actual walkTo, nearby interaction, keyboard actions and normal Game.update; no state grants, actor poses or screenshot composites.',startedAt:new Date().toISOString(),captures:[],travel:[],errors};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send(JSON.stringify({type:'connected'}));s.onMessage(()=>{});});
await page.goto('http://127.0.0.1:4321/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ECHO_READY__);
await page.evaluate(async()=>{
 const g=window.__ECHO__.game,W=await import('/src/world.js');
 window.reviewAdvance=g.update.bind(g);g.update=()=>{};
 window.reviewStep=seconds=>{for(let t=0;t<seconds;t+=1/60)window.reviewAdvance(Math.min(1/60,seconds-t));};
 window.reviewWalk=(x,y)=>{
  if(!W.isWalkable(g.scene,x,y))throw Error(`Unwalkable goal ${x},${y}`);
  const from={x:g.state.x,y:g.state.y,scene:g.scene.id};g.walkTo(x,y);let steps=0,replans=0,last=Infinity,stuck=0;
  // Production click paths finish within one diagonal 24px cell of the
  // rounded target; allow that documented arrival tolerance before fine input.
  while(Math.hypot(g.state.x-x,g.state.y-y)>56){
   if(g.mode!=='world'||g.ui.blocked)throw Error(`Unexpected interruption on review walk: ${g.mode}/${g.ui.panel?.type}`);
   window.reviewAdvance(1/60);const distance=Math.hypot(g.state.x-x,g.state.y-y);stuck=Math.abs(distance-last)<.01?stuck+1:0;last=distance;
   if((!g.movePath.length||stuck>90)&&!g.transition){if(replans++>=3)throw Error(`Review path blocked at ${g.state.x},${g.state.y} to ${x},${y}`);g.walkTo(x,y);stuck=0;}
   if(++steps>60000)throw Error('Review walk timeout');
  }
  g.movePath=[];window.reviewStep(.25);return {from,to:{x:g.state.x,y:g.state.y,scene:g.scene.id},steps};
 };
 window.reviewInteract=id=>{
  const o=[...g.scene.objects,...g.scene.portals].find(o=>o.id===id);if(!o)throw Error('Unknown review interaction '+id);
  const p=g.safePoint(g.scene,o.x,o.y+35);window.reviewWalk(p.x,p.y);
  for(let n=0;n<120&&!W.nearby(g.scene,g.state.x,g.state.y,g.state).some(v=>v.id===id);n++){const dx=o.x-g.state.x,dy=o.y-g.state.y;if(Math.abs(dx)>3)g.keys.add(dx>0?'ArrowRight':'ArrowLeft');if(Math.abs(dy)>3)g.keys.add(dy>0?'ArrowDown':'ArrowUp');window.reviewAdvance(1/60);g.keys.clear();}
  if(!W.nearby(g.scene,g.state.x,g.state.y,g.state).some(v=>v.id===id))throw Error('Review interaction out of range '+id);
  g.interact(o);let steps=0;while(g.transition&&steps++<180)window.reviewAdvance(1/60);if(g.transition)throw Error('Review transition timeout');g.ui.render();
 };
});
async function load(id){assert.ok(archive.saves[id],`Missing earned save ${id}`);await page.evaluate(async s=>{const {saveState}=await import('/src/persistence.js');saveState(s,1);window.__ECHO__.game.load(1);},archive.saves[id].state);}
async function capture(id,extra={}){
 await page.evaluate(()=>window.__ECHO__.game.ui.render());await page.waitForTimeout(80);
 const file=captureImages?(polish?'critic-polished-':revision?'critic-revised-':'critic-final-')+id+'.png':null;if(file)await page.screenshot({path:base+'evidence/'+file});
 const sample=await page.evaluate(async()=>{const g=window.__ECHO__.game,{mainObjective}=await import('/src/narrative.js');return {scene:g.scene.id,biome:g.scene.biome,mode:g.mode,position:{x:g.state.x,y:g.state.y},simulationTime:g.state.playTime,objective:mainObjective(g.state),tier:g.state.tier,party:g.state.heroes.map(h=>({id:h.id,level:h.level,hp:h.hp,mp:h.mp})),panel:g.ui.panel?.type,tab:g.ui.menu?g.ui.tab:null,action:g.battle?.action?{name:g.battle.action.command.name,stage:g.battle.action.stage,elapsed:g.battle.action.elapsed,contact:g.battle.action.contact}:null,assetErrors:window.__ECHO__.snapshot().assets.errors};});
 report.captures.push({id,file,...extra,...sample});
}
async function outside(){await page.evaluate(()=>{const g=window.__ECHO__.game;if(g.scene.interior)window.reviewInteract(g.scene.portals[0].id);});}
async function viewLandmark(id){report.travel.push(await page.evaluate(id=>{const g=window.__ECHO__.game,o=g.scene.objects.find(o=>o.id===id);if(!o)throw Error('Missing landmark '+id);const p=g.safePoint(g.scene,o.x+90,o.y+110);return window.reviewWalk(p.x,p.y);},id));}
async function enter(id){await page.evaluate(id=>window.reviewInteract(id),id);}
const regions=[
 ['haventide','arrival-haventide',null,'hav_first'],
 ['emberline','chapter-vex','ember_caravan','ember_signal'],
 ['orbital_reach','chapter-rune','orbital_tether','orbital_guard'],
 ['forest_veil','chapter-forest','forest_greatroot','forest_warden'],
 ['mire_bog','chapter-mire','mire_bell','mire_warden'],
 ['crater_ember','chapter-crater','crater_gate','crater_lord'],
 ['frost_canyon','chapter-frost','frost_shards','frost_colossus'],
 ['last_crown','chapter-crown','crown_hand','void_architect'],
];
try{
 for(const [region,save,landmark,battle]of regions){
  if(revision&&(polish?['haventide','mire_bog','orbital_reach','crater_ember']:['haventide','forest_veil','mire_bog']).includes(region))continue;
  console.log('REVIEW '+region);await load(save);await outside();if(landmark)await viewLandmark(landmark);await capture(region+'-world',{earnedSave:save});
  if(polish)continue;
  if(!revision){await page.keyboard.down('ArrowRight');for(let i=0;i<4;i++){await page.evaluate(()=>window.reviewStep(.18));await capture(region+'-walk-'+i,{earnedSave:save,intervalSeconds:.18});}await page.keyboard.up('ArrowRight');}
  await load('battle-'+battle);await capture(region+'-battle-idle',{earnedSave:'battle-'+battle});
  const action=await page.evaluate(()=>{const g=window.__ECHO__.game;let n=0;while((!g.battle.selectedHero||g.battle.action)&&n++<1800)window.reviewAdvance(1/60);if(n>=1800)throw Error('No ready hero');return {ready:g.battle.selectedHero,mode:g.battle.mode};});
  if(action.mode==='waiting')await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  const timeline=await page.evaluate(()=>{const a=window.__ECHO__.game.battle.action;if(!a||a.side==='enemy')throw Error('Actual player action was not selected');return {contact:a.contact,duration:a.duration};});
  let elapsed=0;for(const [stage,time]of [['windup',.15],['approach',Math.max(.2,timeline.contact-.15)],['contact',timeline.contact+.025],['recovery',timeline.duration-.15]]){if(revision&&stage!=='contact')continue;await page.evaluate(dt=>window.reviewStep(dt),time-elapsed);elapsed=time;await capture(region+'-battle-'+stage,{earnedSave:'battle-'+battle});}
 }
 for(const [region,save]of [['haventide','chapter-haventide'],['emberline','chapter-vex'],['orbital_reach','chapter-rune'],['last_crown','chapter-crown']]){
  if(revision&&!polish&&!['emberline','orbital_reach'].includes(region))continue;
  await load(save);if(await page.evaluate(()=>!window.__ECHO__.game.scene.interior))await enter(region+'_entrance');await capture(region+'-settlement',{earnedSave:save});
  if(polish){await enter(region+'_smith');await page.keyboard.press('Backspace');await capture(region+'-market',{earnedSave:save});continue;}
  if(revision)continue;
  await enter(region+'_smith');await capture(region+'-smith',{earnedSave:save});await page.keyboard.press('Backspace');
  await enter(region+'_board');await capture(region+'-construction',{earnedSave:save});await page.keyboard.press('Backspace');
 }
 for(const [save,door]of [['chapter-haventide','hav_house_door'],['chapter-forest','forest_cave_door'],['chapter-frost','frost_house_door'],['chapter-crown','crown_cave_door']]){await load(save);await outside();await enter(door);await capture(door+'-interior',{earnedSave:save});}
 if(polish){
  await load('chapter-aftermath');await outside();report.travel.push(await page.evaluate(()=>{const s=window.__ECHO__.game.scene.spawn;return window.reviewWalk(s.x,s.y);}));
  report.followerMotion=[];
  for(const direction of ['Up','Down']){
   await page.keyboard.down('Arrow'+direction);await page.evaluate(()=>window.reviewStep(1.2));
   for(let i=0;i<3;i++){await page.evaluate(()=>window.reviewStep(.15));await capture('crew-'+direction.toLowerCase()+'-'+i,{earnedSave:'chapter-aftermath',intervalSeconds:.15});report.followerMotion.push(await page.evaluate(()=>{const g=window.__ECHO__.game;return {position:{x:g.state.x,y:g.state.y,facing:g.state.facing},followers:g.followers.map(f=>({...f})),moving:g.moving};}));}
   await page.keyboard.up('Arrow'+direction);
  }
 }
 if(!revision){await load('chapter-aftermath');await page.keyboard.press('Escape');for(let n=1;n<=7;n++){await page.keyboard.press(String(n));await capture('atlas-tab-'+n,{earnedSave:'chapter-aftermath'});}await page.keyboard.press('Escape');}
 assert.equal(errors.length,0,'Application/browser errors');report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();report.browser=await browser.version();report.captureImages=captureImages;report.revision=revision;report.polish=polish;await fs.writeFile(base+'evidence/'+(polish?'final-art-review-polish.json':revision?'final-art-review-revision.json':captureImages?'final-art-review.json':'final-art-review-preflight.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,captures:report.captures.length,errors}));}
