import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname, folder=base+'evidence/gravbot-refresh/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Explicit party/camera fixture at the actual Emberline gate sentry. Production Game.update schedules and renders the enemy action; only simulation wall time is accelerated. Pose inspection separately draws all six imported poses at native world/battle scales on dark and pale backgrounds.',errors:[],captures:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
async function capture(name){await page.evaluate(()=>__ECHO__.game.ui.render());await page.waitForTimeout(35);await page.screenshot({path:folder+name+'.png'});report.captures.push({file:name+'.png',snapshot:await page.evaluate(()=>({scene:__ECHO__.game.scene.id,battle:__ECHO__.snapshot().battle}))});}
async function step(seconds){await page.evaluate(seconds=>{for(let t=0;t<seconds;t+=1/60)window.gravUpdate.call(__ECHO__.game,Math.min(1/60,seconds-t));},seconds);}
try{
 await page.goto('http://127.0.0.1:4321/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(()=>{__ECHO__.preset('party');__ECHO__.goto('emberline');const g=__ECHO__.game;g.resetSession();window.gravUpdate=g.update;g.update=()=>{};const o=g.scene.objects.find(o=>o.id==='ember_guard');Object.assign(g.state,g.safePoint(g.scene,o.x-100,o.y+40));g.state.facing='right';g.state.flags.battle_taught=true;g.resetFollowers();g.updateCamera(true);g.near=o;g.ui.render();});
 await capture('world-emberline-guard');
 await page.evaluate(()=>__ECHO__.game.interact(__ECHO__.game.scene.objects.find(o=>o.id==='ember_guard')));await step(.55);await capture('battle-idle');
 const found=await page.evaluate(()=>{const g=__ECHO__.game;for(let n=0;n<20000;n++){if(g.battle.action?.participants.includes('enemy_0'))return {n,action:{...g.battle.action}};window.gravUpdate.call(g,.01);}return null;});assert.ok(found);report.enemyAction=found;
 let last=0;for(const t of [.12,.38,.63,.73,.90,1.2]){await step(t-last);await capture('enemy-action-'+String(t).replace('.','_'));last=t;}
 await page.evaluate(async()=>{const Art=await import('/src/art.js');const {ASSET_MANIFEST,loadPixelAtlas}=await import('/src/assets.js');const e=ASSET_MANIFEST.find(e=>e.id==='gravbot');const source=await loadPixelAtlas(e);Art.installEnemySheet('gravbot',source,e.metadata);window.gravMetadata=e.metadata;const canvas=document.createElement('canvas');canvas.id='pose-review';canvas.width=1440;canvas.height=620;Object.assign(canvas.style,{position:'fixed',inset:0,zIndex:99999,width:'1440px',height:'620px'});document.body.append(canvas);const c=canvas.getContext('2d');for(let row=0;row<2;row++){c.fillStyle=row?'#e5dbc7':'#141b22';c.fillRect(0,row*310,1440,310);['idle','anticipate','attack','hurt','down','guard'].forEach((pose,i)=>{Art.drawEnemy(c,'gravbot',i*240+120,row*310+160,{pose,scale:1.45,time:0});Art.drawEnemy(c,'gravbot',i*240+120,row*310+260,{pose,scale:.85,time:0});c.fillStyle=row?'#20262b':'#eadfc9';c.font='14px monospace';c.fillText(pose+' / 1.45 & .85',i*240+16,row*310+294);});}});
 await page.locator('#pose-review').screenshot({path:folder+'six-poses-dark-pale.png'});
 report.metadata=await page.evaluate(()=>window.gravMetadata);report.assets=await page.evaluate(()=>__ECHO__.snapshot().assets);assert.deepEqual(report.assets.errors,[]);assert.deepEqual(report.errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(folder+'results.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,captures:report.captures.length,errors:report.errors}));}
