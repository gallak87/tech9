import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Fresh browser context, actual RAF intervals with production drawing at 1920×1080. Fixtures select scenes/party only. Each interval sample follows 300ms settling; transition measurement includes two animation frames after the real scene change.',environment:{cpu:os.cpus()[0]?.model,platform:os.platform(),arch:os.arch(),browser:await browser.version(),viewport:[1920,1080],logicalView:[960,540]},errors:[],samples:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send(JSON.stringify({type:'connected'}));s.onMessage(()=>{});});
try{
  const start=Date.now();await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__,{timeout:20000});report.coldReadyMs=Date.now()-start;
  report.environment.backingSurface=await page.locator('#stage canvas').evaluate(c=>[c.width,c.height]);
  for(const id of (process.env.SCENES?.split(',')||['haventide','emberline','forest_veil','mire_bog','crater_ember','orbital_reach','frost_canyon','last_crown','haventide_town','hav_house','frost_cave','battle-four','final'])){
    const prep=await page.evaluate(async id=>{const t=performance.now();if(id==='battle-four'||id==='final')window.__ECHO__.preset(id);else{window.__ECHO__.preset('party');window.__ECHO__.goto(id);}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;},id);
    await page.waitForTimeout(300);await page.evaluate(()=>{window.__ECHO__.game.frameTimes.length=0;});
    await page.waitForTimeout(1400);
    const s=await page.evaluate(()=>window.__ECHO__.snapshot()),a=s.frameTimes.filter(t=>t>0).sort((x,y)=>x-y),p95=a[Math.floor(a.length*.95)],mean=a.reduce((n,x)=>n+x,0)/a.length;
    report.samples.push({scene:id,frames:a.length,meanMs:mean,p95Ms:p95,maxMs:a.at(-1),meanFps:1000/mean,transitionTwoFrameMs:prep,meetsFrameBudget:p95<=20,meetsTransitionBudget:prep<250,art:s.artMetrics});
  }
  report.assets=await page.evaluate(()=>window.__ECHO__.snapshot().assets);
  report.allFrameBudgetsPass=report.samples.every(s=>s.meetsFrameBudget);report.allTransitionBudgetsPass=report.samples.every(s=>s.meetsTransitionBudget);
  assert.equal(report.errors.length,0);assert.ok(report.allFrameBudgetsPass,'One or more p95 frame budgets missed');assert.ok(report.allTransitionBudgetsPass,'One or more transitions exceeded250ms');
  report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(reviewRoot + ''+(process.env.PERF_REPORT||'performance')+'.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,coldReadyMs:report.coldReadyMs,errors:report.errors,samples:report.samples.map(s=>({scene:s.scene,frames:s.frames,p95:s.p95Ms,transitionMs:s.transitionTwoFrameMs}))}));}
