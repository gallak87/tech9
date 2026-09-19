import {reviewRoot} from '../scripts/review-output.mjs';
import{chromium}from'playwright';
import fs from'node:fs/promises';
import assert from'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Actual production renderer at 1920×1080. Built-in final preset supplies a deterministic level/skill fixture, then createBattle selects one real catalog enemy in its biome. Exact production Game.update steps, legal battleKey commands, no HP/MP/pose assignments. This is art/choreography verification, not earned progression.',errors:[],battles:[],walk:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
const snap=()=>page.evaluate(()=>window.__ECHO__.snapshot());
async function capture(name){await page.waitForTimeout(34);await page.screenshot({path:reviewRoot + 'critic-'+name+'.png'});const s=await snap();return {name,battle:s.battle,heroes:s.state.heroes};}
try{
 await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(async()=>{window.criticModules=await Promise.all([import('/src/combat.js'),import('/src/content.js')]);const g=window.__ECHO__.game;window.criticAdvance=g.update;g.update=()=>{};});
 const cases=[['mire_warden','forest',true],['magma_behemoth','volcanic',true],['architect_herald','alien',true],['frost_colossus','ice',true],['void_architect','alien',true],['mire_hulk','forest'],['glacier_wolf','ice'],['ember_golem','volcanic'],['frost_revenant','ice'],['wraith_core','alien'],['ember_lord','volcanic']];
 for(const[id,biome,complete]of cases){
  await page.evaluate(({id,biome})=>{const g=window.__ECHO__.game;window.__ECHO__.preset('final');g.battle=window.criticModules[0].createBattle(g.state,{id:'critic_'+id,enemies:[id],biome,boss:true});g.mode='battle';g.ui.render();},{id,biome});
  const trial={id,biome,fixture:(await snap()).state.heroes.map(h=>({id:h.id,level:h.level})),frames:[await capture('boss-'+id+'-idle')]};
  for(let action=0;action<2;action++){
   const found=await page.evaluate(()=>{const g=window.__ECHO__.game;let n=0;while(n++<12000&&!g.battle.action)window.criticAdvance.call(g,.01);return {n,action:g.battle.action?{...g.battle.action,command:g.battle.action.command}:null};});
   assert.ok(found.action);trial.frames.push(await capture('boss-'+id+'-enemy'+action+'-start'));
   let last=found.action.elapsed;for(const[t,label]of [[.17,'windup'],[found.action.contact+.01,'contact'],[found.action.duration-.12,'return'],[found.action.duration+.01,'end']]){if(t>last)await page.evaluate(dt=>window.criticAdvance.call(window.__ECHO__.game,dt),t-last);trial.frames.push(await capture('boss-'+id+'-enemy'+action+'-'+label));last=t;}
  }
  if(complete){
   const seen=new Set();let turns=0;
   while(!(await snap()).battle.result&&turns++<100){
    const action=await page.evaluate(()=>{const g=window.__ECHO__.game,B=window.criticModules[0],C=window.criticModules[1];let n=0;while(!g.battle.action&&!g.battle.selectedHero&&n++<6000)window.criticAdvance.call(g,.02);const b=g.battle;if(!b.action){const key=k=>B.battleKey(b,g.state,k),choose=i=>{let n=0;while(b.cursor!==i&&n++<30)key('ArrowDown');key('Enter');};let available=B.battleView(b,g.state).techs.filter(t=>!t.unavailable).map(t=>C.TECHS[t.id]);let tech=b.heroes.some(h=>h.hp>0&&h.hp/h.maxHp<.55)?available.find(t=>t.effect==='heal'&&t.target==='allAllies')||available.find(t=>t.effect==='heal'):null;if(!tech)tech=available.filter(t=>['damage','drain','slow'].includes(t.effect)).sort((a,z)=>z.power*z.heroes.length-a.power*a.heroes.length)[0];if(b.mode==='waiting')key('Enter');if(tech){choose(1);choose(B.battleView(b,g.state).techs.findIndex(t=>t.id===tech.id));}else choose(0);if(b.mode==='target')key('Enter');}return b.action?{contact:b.action.contact,duration:b.action.duration,elapsed:b.action.elapsed,name:b.action.command.name,side:b.action.actorSide}:null;});
    if(!action)break;
    let last=action.elapsed;for(const t of [action.contact+.012,action.contact+.326,action.duration+.01]){if(t>last)await page.evaluate(dt=>window.criticAdvance.call(window.__ECHO__.game,dt),t-last);last=t;const b=(await snap()).battle;if(!b)break;const e=b.enemies[0],tag=e.visual.pose+'-phase'+e.bossPhase;if(!seen.has(tag)){seen.add(tag);trial.frames.push(await capture('boss-'+id+'-'+tag));}}
   }
   trial.result=(await snap()).battle?.result;trial.turns=turns;assert.equal(trial.result,'victory');
  }
  report.battles.push(trial);console.log('PASS '+id);
 }
 await page.evaluate(()=>{const g=window.__ECHO__.game;g.update=window.criticAdvance;window.__ECHO__.preset('party');});
 for(const[key,label]of [['ArrowRight','right'],['ArrowUp','up'],['ArrowLeft','left'],['ArrowDown','down']]){await page.keyboard.down(key);await page.waitForTimeout(300);report.walk.push(await capture('walk-trio-'+label));await page.keyboard.up(key);}
 report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(reviewRoot + 'boss-art-critic.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,battles:report.battles.length,errors:report.errors}));}
