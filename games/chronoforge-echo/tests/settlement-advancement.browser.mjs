import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ALL_SCENES,isWalkable} from '../src/world.js';

// Save setup skips travel; every board and purchase uses the production UI.
const earned=JSON.parse(await fs.readFile(new URL('../evidence/campaign-browser.json',import.meta.url),'utf8')).snapshot.state;
const out=new URL('../evidence/settlement-advancement/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const report={method:'Production build; campaign save staged beside each of the four construction boards at different tiers. Normal Continue/F, pointer and keyboard controls; no dev game hooks.',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const checkpoint=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('chronforge_echo_v1:checkpoint'))?.state??null);
async function openBoard(region,setup){
 const state=structuredClone(earned),object=ALL_SCENES[region].objects.find(o=>o.service==='construction');
 Object.assign(state,{region,x:object.x,y:object.y+35});setup(state);
 assert.ok(isWalkable(ALL_SCENES[region],state.x,state.y));
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(state=>{localStorage.clear();localStorage.setItem('chronforge_echo_v1:1',JSON.stringify({version:1,savedAt:new Date().toISOString(),state}));},state);
 await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4322/');
 await page.waitForFunction(()=>window.__ECHO_READY__);
 assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined');
 await page.keyboard.press('Enter');
 await page.locator('.interaction[data-object="'+object.id+'"]').waitFor();
 await page.keyboard.press('f');await page.locator('[data-tier-status]').waitFor();
 return page;
}
try{
 const cases=[
  ['haventide_town',s=>{s.tier=1;s.buildings.town_center=1;delete s.flags.beacon_restored;},['Town Center to level 2','listening buoy west of Haventide']],
  ['emberline_town',s=>{s.tier=2;s.buildings.town_center=2;s.buildings.research_lab=0;delete s.flags.rune_recruited;s.resources.ore=0;},['Town Center to level 3','Research Lab to level 1','Recruit Rune']],
  ['orbital_reach_town',s=>{s.tier=3;s.buildings.forge=1;s.buildings.walls=1;delete s.flags.forest_seal;},['Forge to level 2','Walls to level 2','Heartwood Relay']],
  ['last_crown_town',()=>{},[]]
 ];
 for(const [region,setup,instructions]of cases){
  const page=await openBoard(region,setup);
  assert.equal(await page.locator('[data-do="open-atlas"]').count(),0);
  if(instructions.length){
   assert.equal(await page.locator('[data-tier-status]').getAttribute('data-tier-status'),'blocked');
   const button=page.locator('[data-do="tier"]');assert.equal(await button.isDisabled(),true);
   for(const text of instructions)assert.ok((await page.locator('#tier-unlock').innerText()).includes(text),text);
   const initial=await checkpoint(page);await button.click({force:true});
   assert.deepEqual(await checkpoint(page),initial,'Disabled click must not purchase or checkpoint');
   assert.equal(await page.locator('.notice').count(),0,'No duplicate notice on blocked click');
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.dataset.do),'tier');}
   if(region==='emberline_town')assert.match(await page.locator('.tier-cost.missing').innerText(),/Need 85 more/);
   if(region==='haventide_town')await page.screenshot({path:new URL('blocked.png',out).pathname});
  }else{
   assert.equal(await page.locator('[data-tier-status]').getAttribute('data-tier-status'),'complete');
   assert.equal(await page.locator('[data-do="tier"]').count(),0);
  }
  await page.keyboard.press('Escape');assert.equal(await page.locator('.atlas').count(),0);
  report.checks.push({region,status:instructions.length?'blocked':'complete',disabledPointerAndKeyboard:!!instructions.length});
  await page.close();
 }
 const page=await openBoard('haventide_town',s=>{s.tier=1;s.buildings.town_center=1;});
 assert.equal(await page.locator('[data-do="tier"]').isDisabled(),true);
 await page.locator('[data-do="build:town_center"]').click();
 assert.equal(await page.locator('[data-tier-status]').getAttribute('data-tier-status'),'ready');
 assert.equal(await page.locator('[data-do="tier"]').isEnabled(),true);
 const before=await checkpoint(page);assert.equal(before.buildings.town_center,2);
 await page.screenshot({path:new URL('ready.png',out).pathname});
 await page.locator('[data-do="tier"]').focus();await page.keyboard.press('Enter');
 const after=await checkpoint(page);assert.equal(after.tier,2);
 for(const [id,cost]of Object.entries({food:35,ore:35,energy:15,renown:12}))assert.equal(after.resources[id],before.resources[id]-cost);
 assert.match(await page.locator('.notice').innerText(),/become Reclaimer/);
 assert.equal(await page.locator('[data-tier-status]').getAttribute('data-tier-status'),'blocked');
 assert.match(await page.locator('#tier-unlock').innerText(),/Town Center to level 3/);
 await page.keyboard.press('Escape');await page.keyboard.press('f');
 assert.match(await page.locator('[data-do="tier"]').innerText(),/Ascendant/);
 assert.equal(await page.locator('[data-do="tier"]').isDisabled(),true);
 report.checks.push({region:'haventide_town',buildRefresh:true,enterAdvances:true,exactCosts:true,reopenRefresh:true});
 await page.close();assert.deepEqual(report.errors,[]);report.result='pass';
}catch(error){report.result='fail';report.failure=String(error);process.exitCode=1;}
finally{await browser.close();await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
