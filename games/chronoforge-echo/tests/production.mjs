import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const reportName=process.env.PRODUCTION_REPORT||'production';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Static Vite production build on port4322. No test hooks or fixture access; title, opening and all tabs use real keyboard input.',errors:[],httpErrors:[],screens:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
try{
  const t=Date.now();await page.goto('http://127.0.0.1:4322/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__,{timeout:20000});report.coldReadyMs=Date.now()-t;
  assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined','Production must not expose fixture hooks even with query string');
  report.canvas=await page.locator('#stage canvas').evaluate(c=>({width:c.width,height:c.height,imageRendering:getComputedStyle(c).imageRendering}));
  assert.deepEqual(report.canvas,{width:1920,height:1080,imageRendering:'auto'});
  await page.screenshot({path:reviewRoot + `${reportName}-title.png`});report.screens.push(`${reportName}-title.png`);
  await page.keyboard.press('Enter');
  for(let i=0;i<12;i++){const hasDialogue=await page.locator('.dialogue-box').count();if(!hasDialogue)break;await page.keyboard.press('Enter');}
  if(await page.locator('[data-do="dialogue-next"]').count())for(let i=0;i<8&&await page.locator('[data-do="dialogue-next"]').count();i++)await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const tabs=['Map','Party','Inventory','Skills','Quests','Save','Settings'];
  for(let i=0;i<7;i++){await page.keyboard.press(String(i+1));assert.ok((await page.locator('.tabs .active').innerText()).includes(tabs[i]));}
  await page.screenshot({path:reviewRoot + `${reportName}-settings.png`});report.screens.push(`${reportName}-settings.png`);
  await page.keyboard.press('Escape');await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
  await page.screenshot({path:reviewRoot + `${reportName}-opening.png`});report.screens.push(`${reportName}-opening.png`);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.result='pass';report.browser=await browser.version();
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;await page.screenshot({path:reviewRoot + `${reportName}-failure.png`}).catch(()=>{});}
finally{await fs.writeFile(reviewRoot + `${reportName}.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
