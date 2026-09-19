import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Production game renderer and actual keyboard controls. Deterministic built-in presets supply party/learned-tech fixtures only. World movement runs in real time. During combat captures, the normal Game.update is called in exact time increments while RAF drawing remains active; no actor HP/MP/readiness, damage, action pose or screenshot pixels are assigned.',environment:{viewport:[1920,1080],browser:await browser.version()},errors:[],world:[],portraits:[],techniques:[],drone:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',socket=>{socket.send(JSON.stringify({type:'connected'}));socket.onMessage(()=>{});});
const snapshot=()=>page.evaluate(()=>window.__ECHO__.snapshot());
const capture=async id=>{await page.waitForTimeout(34);await page.screenshot({path:reviewRoot + ''+id+'.png'});const s=await snapshot();return {id,wallTime:Date.now(),battle:s.battle,heroes:s.state.heroes,position:{region:s.state.region,x:s.state.x,y:s.state.y},followers:await page.evaluate(()=>window.__ECHO__.game.followers)};};
const freeze=()=>page.evaluate(()=>{const g=window.__ECHO__.game;window.criticRealUpdate??=g.update;g.update=()=>{};});
const resume=()=>page.evaluate(()=>{const g=window.__ECHO__.game;if(window.criticRealUpdate){g.update=window.criticRealUpdate;delete window.criticRealUpdate;}});
const step=seconds=>page.evaluate(seconds=>window.criticRealUpdate.call(window.__ECHO__.game,seconds),seconds);
async function startTech(id){
 await page.evaluate(()=>window.__ECHO__.preset('battle-four'));await freeze();
 const preparation=await page.evaluate(id=>{const g=window.__ECHO__.game;let ticks=0;while(ticks++<2000){const b=g.battle,ready=b.heroes.every(h=>h.atb===100),damaged=b.heroes.some(h=>h.hp<h.maxHp);if(ready&&!b.action&&(id!=='shelterlight'||damaged))break;window.criticRealUpdate.call(g,.02);}return {ticks,fixture:'Built-in battle-four party/skills fixture',heroes:g.battle.heroes.map(h=>({id:h.id,hp:h.hp,mp:h.mp,atb:h.atb})),logs:g.battle.logs};},id);
 assert.ok(preparation.ticks<2000);if(id==='shelterlight')await page.keyboard.press('Tab');await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 const techs=(await snapshot()).battle.techs,index=techs.findIndex(t=>t.id===id);assert.ok(index>=0);assert.equal(techs[index].unavailable,'');for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');if(id==='harbor_break')await page.keyboard.press('ArrowDown');
 const target=await capture('critic-party-'+id+'-target');await page.keyboard.press('Enter');const executing=(await snapshot()).battle;assert.equal(executing.action.name,techs[index].name);
 const before=target.battle;for(const h of executing.heroes){const old=before.heroes.find(o=>o.id===h.id),participant=executing.action.participants.includes(h.id);assert.equal(h.mp,old.mp-(participant?techs[index].mp:0));assert.equal(h.atb,participant?0:old.atb);}
 const frames=[];let last=0;for(const time of [0,.16,.35,.6,.81,.94,1.06,1.35,1.72,1.93]){if(time>last)await step(time-last);frames.push(await capture('critic-party-'+id+'-'+String(frames.length).padStart(2,'0')));last=time;}
 const pre=frames[4].battle,contact=frames[5].battle,after=frames.at(-1).battle;assert.equal(pre.action.resolved,false);assert.equal(contact.action.resolved,true);if(id==='shelterlight')assert.ok(contact.heroes.some((h,i)=>h.hp>pre.heroes[i].hp));else assert.ok(contact.enemies.some((e,i)=>e.hp<pre.enemies[i].hp));
 for(const frame of frames)for(const h of frame.battle.heroes)assert.equal(h.mp,frame.heroes.find(v=>v.id===h.id).mp);for(const member of executing.action.participants)assert.equal(after.heroes.find(h=>h.id===member).atb,0);
 report.techniques.push({id,preparation,target,executing,frames,resourceAndContactAssertions:'pass'});await resume();
}
try{
 await page.goto('http://127.0.0.1:4321/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ECHO_READY__);report.assets=(await snapshot()).assets;
 await page.evaluate(()=>window.__ECHO__.preset('party'));report.world.push(await capture('critic-party-world-idle'));
 for(const [key,label]of [['ArrowRight','right'],['ArrowUp','up'],['ArrowLeft','left'],['ArrowDown','down']]){await page.keyboard.down(key);await page.waitForTimeout(180);report.world.push(await capture('critic-party-world-'+label+'-01'));await page.waitForTimeout(100);report.world.push(await capture('critic-party-world-'+label+'-02'));await page.keyboard.up(key);}
 await page.keyboard.press('Escape');await page.keyboard.press('2');report.portraits.push(await capture('critic-party-portraits'));await page.keyboard.press('Escape');
 for(const id of ['prism_cut','harbor_break','shelterlight','concord_dawn']){await startTech(id);console.log('PASS '+id);}
 await page.evaluate(()=>window.__ECHO__.preset('battle-four'));await freeze();const found=await page.evaluate(()=>{const g=window.__ECHO__.game;let n=0;while(n++<10000){if(g.battle.action?.participants.includes('enemy_1'))return {ticks:n,action:g.battle.action.command.name};window.criticRealUpdate.call(g,.01);}return null;});assert.ok(found);report.droneAction=found;
 let last=0;const duration=(await snapshot()).battle.action.duration;for(const time of [0,.15,.35,.55,.72,.9,1.13,duration]){if(time>last)await step(time-last);report.drone.push(await capture('critic-party-drone-'+String(report.drone.length).padStart(2,'0')));last=time;}await resume();report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(reviewRoot + 'party-critic.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,errors:report.errors,techniques:report.techniques.length,images:report.world.length+report.portraits.length+report.techniques.reduce((n,t)=>n+t.frames.length+1,0)+report.drone.length}));}
