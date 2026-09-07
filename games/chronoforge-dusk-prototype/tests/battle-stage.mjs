// Focused Playwright verification for the isolated combat stage and visible lunge choreography.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const dist=path.resolve(new URL('../dist/',import.meta.url).pathname),prefix='/chronoforge-dusk/';
let server;
if(!process.env.GAME_URL){
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
 server=http.createServer(async(req,res)=>{const route=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(dist,route.slice(prefix.length)||'index.html');if(!route.startsWith(prefix)||!file.startsWith(dist+'/')){res.writeHead(404);res.end();return;}try{const body=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const browser=await chromium.launch({headless:process.env.HEADED!=='1'});
const artifacts=new URL('./artifacts/',import.meta.url);await fs.mkdir(artifacts,{recursive:true});
const report={checks:[],errors:[],motion:[],performance:{}};
const url=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}/chronoforge-dusk/?battle=1&test=1`;
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:process.env.VIDEO==='1'?{dir:artifacts.pathname,size:{width:1440,height:900}}:undefined});
const page=await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`)});
const shot=async(name)=>{await page.screenshot({path:new URL(`${name}.png`,artifacts).pathname});console.log(name);};
async function settled(){await page.waitForFunction(()=>window.__dusk?.game.state.mode==='battle'&&__dusk.world.assetStatus.ready);await page.waitForTimeout(1200);}
async function choose(hero,id,category,target){await page.locator(`.combat-hero[data-id="${hero}"]`).click();await page.locator(`[data-action="category"][data-id="${category}"]`).click();await page.locator(`[data-action="command"][data-id="${id}"]`).click();if(await page.locator('[data-action="execute"]').isVisible()){if(target)await page.locator(`.target-list [data-id="${target}"]`).click();await page.locator('[data-action="execute"]').click();}}
async function ready(){await page.waitForFunction(()=>{const s=__dusk.game.state;return s.mode==='battle'&&s.party.every(h=>h.atb>=100)&&!s.battle.actionDelay},{},{timeout:20000});}
try {
 await page.goto(url);await settled();
 await page.locator('.journal-button').click();await page.locator('.journal-tabs [data-tab="Settings"]').click();await page.locator('[data-setting="quality"]').selectOption(process.env.QUALITY||'medium');await page.locator('[data-action="close"]').click();
 assert.ok(await page.evaluate(()=>__dusk.world.battleScene?.isScene),'A distinct battle scene exists');
 const assets=await page.evaluate(()=>__dusk.world.assetStatus);assert.deepEqual(Object.values(assets.heroes),['loaded','loaded','loaded']);
 report.checks.push('All three sculpted hero GLBs load into a dedicated battle scene');
 await page.waitForTimeout(2800);await shot('stage-idle');
 const p=await page.evaluate(()=>__dusk.world.getBattlePresentation());report.initial=p;
 assert.ok(p.active);assert.equal(p.units.filter(u=>['kaida','vex','rune'].includes(u.id)&&u.visible).length,3);
 const target=await page.evaluate(()=>__dusk.game.state.battle.enemies[0].id);
 await page.evaluate(()=>{window.motionSamples=[];window.keepSampling=true;let start=performance.now();const sample=()=>{motionSamples.push({time:performance.now()-start,...__dusk.world.getBattlePresentation()});if(window.keepSampling)requestAnimationFrame(sample)};requestAnimationFrame(sample);});
 await choose('kaida','attack','Attack',target);
 await page.waitForTimeout(230);await shot('stage-windup');await page.waitForTimeout(130);await shot('stage-impact');await page.waitForTimeout(2800);
 report.motion=await page.evaluate(()=>{window.keepSampling=false;return window.motionSamples;});
 const kaidaSamples=report.motion.map(f=>f.units.find(u=>u.id==='kaida')).filter(Boolean);
 const home=kaidaSamples[0].home;
 const distances=kaidaSamples.map(u=>Math.hypot(u.position.x-home.x,u.position.z-home.z));
 report.maxLunge=Math.max(...distances);assert.ok(report.maxLunge>2.5,`Melee travels toward the target, observed ${report.maxLunge.toFixed(2)}m`);
 assert.ok(distances.at(-1)<.12,'Attacker returns to exact home formation');report.checks.push('Melee lunge covers >2.5m and returns home after impact');
 await ready();await choose('vex','gravity-well','Techniques',target);await page.waitForTimeout(460);await shot('stage-void-impact');await page.waitForTimeout(1500);
 await ready();await choose('kaida','combo-kaida-vex','Combos',target);await page.waitForTimeout(550);await shot('stage-rift-cleave');await page.waitForTimeout(1400);
 await ready();await choose('rune','combo-vex-rune','Combos');await page.waitForTimeout(580);await shot('stage-sanctuary');await page.waitForTimeout(1600);
 await ready();await choose('kaida','combo-kaida-rune','Combos',target);await page.waitForTimeout(550);await shot('stage-sunbreak');await page.waitForTimeout(1400);
 await ready();await choose('kaida','aeon-sunder','Combos');await page.waitForTimeout(720);await shot('stage-aeon-sunder');await page.waitForTimeout(2000);
 report.checks.push('Vex technique, attack/support pair combos, and Aeon Sunder execute through DOM controls');
 report.performance=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let previous=performance.now();let n=0;function sample(now){frames.push(now-previous);previous=now;if(++n<120)requestAnimationFrame(sample);else{const sorted=frames.slice().sort((a,b)=>a-b);resolve({fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),medianMs:sorted[60],p95Ms:sorted[114],calls:__dusk.world.renderer.info.render.calls,triangles:__dusk.world.renderer.info.render.triangles})}}requestAnimationFrame(sample)}));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1800);await shot('stage-mobile');
 const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,units:__dusk.world.getBattlePresentation().units}));assert.ok(layout.scroll<=layout.width);report.mobile=layout;
 report.checks.push('Portrait viewport has no page overflow');
 assert.equal(report.errors.length,0,report.errors.join('\n'));
 console.log(JSON.stringify({checks:report.checks,maxLunge:report.maxLunge,performance:report.performance,errors:report.errors},null,2));
} catch(e){report.errors.push(e.stack);await shot('stage-failure');console.error(e);process.exitCode=1;}
finally{await fs.writeFile(new URL('battle-stage-report.json',artifacts),JSON.stringify(report,null,2));await context.close();await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
