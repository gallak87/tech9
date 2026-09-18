import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createState} from '../src/progression.js';
import {ALL_SCENES,isWalkable,nearby} from '../src/world.js';
import {npcIdentity} from '../src/npc-identities.js';

// Production game, staged saves, ordinary F/Enter/Escape interactions. The static
// registry test covers all identities; this check covers the actual dialogue/shop paths.
const output=new URL('../evidence/npc-identities/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const report={method:'Local production build; staged adjacent saves and normal keyboard interactions.',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(String(error)));
 await page.goto(process.env.ECHO_NPC_URL||'http://127.0.0.1:4334/');
 const stage=async id=>{
  const scene=Object.values(ALL_SCENES).find(s=>s.objects.some(o=>o.id===id)),object=scene.objects.find(o=>o.id===id),state=createState();
  state.region=scene.id;state.tier=4;state.flags.mara_arc_complete=true;
  for(const town of ['haventide','emberline','orbital_reach','last_crown'])state.flags[town+'_liberated']=true;
  state.settings.music=0;state.settings.sfx=0;
  const spot=[[0,48],[40,20],[-45,20],[55,0]].map(([dx,dy])=>({x:object.x+dx,y:object.y+dy})).find(p=>isWalkable(scene,p.x,p.y)&&nearby(scene,p.x,p.y,state)[0]?.id===id);
  assert.ok(spot,`Walkable approach for ${id}`);Object.assign(state,spot);
  await page.evaluate(s=>{localStorage.clear();localStorage.setItem('chronforge_echo_v1:checkpoint',JSON.stringify({version:1,savedAt:new Date().toISOString(),state:s}));},state);
  await page.reload();await page.waitForFunction(()=>window.__ECHO_READY__);
  assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined');
  await page.keyboard.press('Enter');await page.locator(`[data-object="${id}"]`).waitFor();
  return object;
 };
 for(const id of ['orbital_reach_resident','haventide_smith','emberline_smith','orbital_reach_smith','last_crown_smith','hav_house_keeper','ember_house_keeper','tavi_lantern']){
  const object=await stage(id),expected=npcIdentity(object);
  if(id==='orbital_reach_resident')await page.screenshot({path:new URL('daro-world.png',output).pathname});
  await page.keyboard.press('f');
  const portrait=page.locator(object.service?'.merchant-portrait':'.dialogue-portrait');
  await portrait.waitFor();assert.equal(await portrait.getAttribute('data-portrait'),expected);
  const name=await page.locator(object.service?'.merchant-heading h2':'.dialogue-name').textContent();
  assert.equal(name,object.name);
  if(object.service==='rest')assert.equal(await page.locator('.merchant-heading p').textContent(),object.dialogue);
  if(['orbital_reach_resident','orbital_reach_smith','hav_house_keeper'].includes(id))await page.screenshot({path:new URL(id+'.png',output).pathname});
  if(id==='haventide_smith'){
   await page.locator('[data-do="story:smith_calibration"]').click();
   assert.equal(await page.locator('.dialogue-name').textContent(),'Bran');
   assert.equal(await page.locator('.dialogue-portrait').getAttribute('data-portrait'),expected);
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('.dialogue-portrait').getAttribute('data-portrait'),expected);
  }
  report.checks.push({object:id,portrait:expected,name,service:object.service||'dialogue'});
  await page.keyboard.press('Escape');
 }
 await stage('hav_camp');await page.keyboard.press('f');
 await page.locator('.merchant-heading').waitFor();
 assert.equal(await page.locator('.merchant-portrait').count(),0,'An unattended camp has no invented resident portrait');
 report.checks.push({object:'hav_camp',portrait:null,service:'rest'});
 assert.equal(report.errors.length,0);
 await fs.writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
