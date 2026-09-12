// Targeted world scenarios: fixtures position the crew; movement and doors
// are exercised by real keyboard/mouse input through the shipping controller.
import {chromium} from './browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {OBJECTS,INTERIORS,walkable,findPath} from '../src/world.js';
const evidence=new URL('../evidence/',import.meta.url).pathname;
await mkdir(evidence,{recursive:true});
const report={suite:'Targeted world, rooms and biome rendering',checks:[],screenshots:[],errors:[]};
const check=(name,details)=>report.checks.push({name,passed:true,...details});
const state={party:{x:400,y:960,interior:null},settlement:{plots:Array(7).fill(null)}};
for(const o of OBJECTS){assert(walkable(state,o.x,o.y),`${o.id} must be walkable`);assert(findPath(state,{x:400,y:960},o).length,`${o.id} must be reachable`);}
for(const room of Object.values(INTERIORS)){state.party.interior=room.id;for(const o of room.objects){assert(walkable(state,o.x,o.y),`${o.id} must be walkable`);assert(findPath(state,{x:360,y:390},o).length,`${o.id} must be reachable`);}}
check('Every authored interaction is collision-free and path-reachable',{exterior:OBJECTS.length,interior:Object.values(INTERIORS).reduce((n,r)=>n+r.objects.length,0)});
state.party.interior=null;state.settlement.plots=['farm','mine','extractor','forge','barracks','archive','walls'].map(type=>({type,tier:3}));
for(const o of OBJECTS.filter(o=>o.type==='plot')){assert(walkable(state,o.x,o.y));assert(!walkable(state,o.x,o.y-25));assert(findPath(state,{x:400,y:960},o).length);}
check('All seven completed settlement buildings collide; entrances remain reachable');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:820}});
page.on('pageerror',error=>report.errors.push(error.stack));
const snap=()=>page.evaluate(()=>window.__dev.snapshot());
const fixture=(x,y,interior=null)=>page.evaluate(([x,y,interior])=>window.__dev.teleport(x,y,interior),[x,y,interior]);
async function screenshot(name){await page.waitForTimeout(100);await page.screenshot({path:evidence+name+'.png'});report.screenshots.push(name+'.png');}
try{
  await page.goto(process.env.CHRONOFORGE_URL||'http://127.0.0.1:4179/?dev=1');
  await page.waitForFunction(()=>!!window.__dev,{timeout:30000});
  await page.evaluate(()=>window.__dev.checkpoint('finale'));
  const biomes=[['haventide',400,960],['emberline',1200,960],['orbital',2000,960],['crown',2800,960],['forest',410,1630],['mire',1200,1600],['crater',1200,305],['frost',2000,305]];
  for(const [id,x,y]of biomes){await fixture(x,y);await screenshot('world-'+id);assert.equal((await snap()).region,id);}
  check('Eight distinct connected biomes render without runtime errors');
  const seams=[['Haventide ↔ Emberline',780,960,'d','a','emberline','haventide'],['Emberline ↔ Orbital',1580,960,'d','a','orbital','emberline'],['Orbital ↔ Crown',2380,960,'d','a','crown','orbital'],['Crater ↔ Frost',1580,320,'d','a','frost','crater'],['Forest ↔ Mire',780,1600,'d','a','mire','forest'],['Haventide ↔ Forest',400,1260,'s','w','forest','haventide'],['Emberline ↔ Mire',1200,1260,'s','w','mire','emberline'],['Crater ↔ Emberline',1200,620,'s','w','emberline','crater'],['Frost ↔ Orbital',2000,620,'s','w','orbital','frost']];
  for(const [name,x,y,key,back,next,previous]of seams){
    await fixture(x,y);await page.waitForTimeout(50);await page.keyboard.down(key);await page.waitForTimeout(430);await page.keyboard.up(key);assert.equal((await snap()).region,next,name+' forward');assert.equal((await snap()).mode,'world');
    await page.keyboard.down(back);await page.waitForTimeout(480);await page.keyboard.up(back);assert.equal((await snap()).region,previous,name+' return');check('Continuous keyboard seam: '+name);
  }
  for(const o of OBJECTS.filter(o=>o.type==='door')){
    await page.evaluate(id=>window.__dev.near(id),o.id);await page.waitForTimeout(60);await page.keyboard.press('c');await page.waitForTimeout(100);assert.equal((await snap()).position.interior,o.interior,o.id+' enters correct room');
    if(o.region==='haventide'||o.service==='spire')await screenshot('room-'+o.interior);
    await page.keyboard.down('s');await page.waitForTimeout(480);await page.keyboard.up('s');assert.equal((await snap()).position.interior,null,o.id+' exits by walking through doorway');check('Door round trip: '+o.interior);
  }
  await fixture(360,390,'haventide_archive');await page.waitForTimeout(100);
  const before=await snap(),canvas=await page.locator('#canvas').boundingBox(),target={x:365,y:186};
  await page.mouse.click(canvas.x+(target.x-before.camera.x)*canvas.width/960,canvas.y+(target.y-before.camera.y)*canvas.height/600);
  const samples=[];
  for(let i=0;i<65;i++){await page.waitForTimeout(100);const ss=await snap();samples.push(ss.position);if(ss.overlay==='dialogue')break;}
  assert.equal((await snap()).overlay,'dialogue','Clicking archive keeper should walk around table and interact');assert(samples.some(p=>p.x<235||p.x>482),'Archive click path routes around central table');
  check('Click-to-walk navigates archive furniture and reaches the keeper',{sampledPositions:samples.length});
  await page.evaluate(()=>window.__dev.checkpoint('finale'));await fixture(400,960);await screenshot('world-settlement-built');
  assert.deepEqual(report.errors,[],'No browser runtime errors');
}catch(error){report.errors.push(error.stack);process.exitCode=1;}finally{await browser.close();await writeFile(evidence+'world-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.checks.length,screenshots:report.screenshots.length,errors:report.errors}));}
