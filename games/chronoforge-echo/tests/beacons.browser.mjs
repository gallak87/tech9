import {reviewURL} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createState} from '../src/progression.js';
import {BEACONS} from '../src/beacons.js';
import {ALL_SCENES,isWalkable} from '../src/world.js';

// One focused production check. Saves stage each beacon before its prerequisite;
// F, Escape, Continue and reload exercise the actual game's UI and persistence.
const out=reviewURL('beacons/');
await fs.mkdir(out,{recursive:true});
const report={method:'Production build, staged saves beside Haventide/Frost beacons; normal interaction and reload. The gate-cleared state is staged, not earned in combat.',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 for(const [id,definition] of Object.entries(BEACONS)){
  const scene=Object.values(ALL_SCENES).find(s=>s.objects.some(o=>o.id===id)),o=scene.objects.find(o=>o.id===id),s=createState();
  Object.assign(s,{region:scene.id,x:o.x+40,y:o.y+20});s.settings.music=0;s.settings.sfx=0;
  assert.ok(isWalkable(scene,s.x,s.y),'Adjacent interaction spot remains walkable');
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(process.env.ECHO_BEACON_URL||'http://127.0.0.1:4334/');
  await page.evaluate(state=>{localStorage.clear();localStorage.setItem('chronforge_echo_v1:checkpoint',JSON.stringify({version:1,savedAt:new Date().toISOString(),state}));},s);
  const resume=async()=>{await page.reload();await page.waitForFunction(()=>window.__ECHO_READY__);assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined');await page.keyboard.press('Enter');await page.locator(`[data-object="${id}"]`).waitFor();};
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('chronforge_echo_v1:checkpoint')).state);
  await resume();
  assert.equal(await page.locator('.beacon-hint').count(),0,'Uninspected beacon has no spoiler hint');
  assert.equal(await page.locator(`[data-object="${id}"]`).textContent(),`F ${definition.name}`);
  await page.keyboard.press('f');await page.locator('.dialogue').waitFor();await page.keyboard.press('Escape');
  await page.locator('.beacon-hint').waitFor();
  assert.equal(await page.locator('.beacon-hint').textContent(),definition.instruction);
  assert.ok((await saved()).flags[id+'_inspected']);
  await resume();assert.equal(await page.locator('.beacon-hint').textContent(),definition.instruction,'Inspection hint survives reload');
  await page.screenshot({path:new URL(id+'-dark.png',out).pathname});
  await page.evaluate(gate=>{const p=JSON.parse(localStorage.getItem('chronforge_echo_v1:checkpoint'));p.state.cleared[gate]=true;localStorage.setItem('chronforge_echo_v1:checkpoint',JSON.stringify(p));},definition.gate);
  await resume();assert.match(await page.locator('.beacon-hint').textContent(),/Path clear/);
  await page.keyboard.press('f');await page.locator('.dialogue').waitFor();
  for(let n=0;n<8&&await page.locator('.dialogue').count();n++)await page.keyboard.press('Enter');
  assert.ok((await saved()).flags[definition.restoredFlag],'Restore commits only after actual F interaction');
  await resume();assert.equal(await page.locator('.beacon-hint').textContent(),definition.restoredHint);
  await page.screenshot({path:new URL(id+'-lit.png',out).pathname});
  report.checks.push({id,dark:true,firstInspectionHint:definition.instruction,readyHint:true,restored:true,saveReload:true});
  await context.close();
 }
 assert.equal(report.errors.length,0);
 await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
