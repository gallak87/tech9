import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from './browser.mjs';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4179/?dev=1');await page.waitForFunction(()=>!!window.__dev);
const animation=await page.evaluate(async()=>{
 const {drawHero}=await import('./src/art.js');const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const records=[];
 for(const id of ['kaida','vex','rune'])for(const state of ['idle','walk','run','attack','cast','hurt']){
  const hashes=[];for(let frame=0;frame<6;frame++){ctx.clearRect(0,0,128,128);const fps=state==='idle'?4:state==='run'?13:state==='attack'?10:8;drawHero(ctx,id,state,64,116,1.4,'right',(frame+.1)/fps);const px=ctx.getImageData(0,0,128,128).data;let hash=2166136261;for(const n of px)hash=Math.imul(hash^n,16777619);hashes.push(hash>>>0);}
  records.push({id,state,distinctFrames:new Set(hashes).size});
 }return records;
});
assert(animation.every(r=>r.distinctFrames>=4),JSON.stringify(animation));
await page.evaluate(()=>window.__dev.checkpoint('links'));await page.keyboard.press('3');await page.waitForTimeout(150);
const icons=await page.evaluate(()=>[...document.querySelectorAll('[data-item-icon]')].map(c=>({id:c.dataset.itemIcon,painted:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0)})));
assert(icons.length>10&&icons.every(c=>c.painted));await page.screenshot({path:new URL('../evidence/equipment-final.png',import.meta.url).pathname});
await page.keyboard.press('Escape');await page.evaluate(()=>{window.__dev.checkpoint('finale');window.__dev.startBattle('architect',{ready:true});});await page.waitForTimeout(100);
await page.getByRole('button',{name:'Link',exact:true}).click();await page.getByRole('button',{name:'The Unwritten Hour',exact:true}).click();await page.evaluate(()=>window.__dev.advance(.42));await page.waitForTimeout(40);await page.screenshot({path:new URL('../evidence/triple-impact.png',import.meta.url).pathname});
await page.evaluate(()=>{window.__dev.checkpoint('finale');window.__dev.teleport(400,960);});await page.waitForTimeout(150);await page.screenshot({path:new URL('../evidence/settlement-final.png',import.meta.url).pathname});
assert.deepEqual(errors,[]);await writeFile(new URL('../evidence/art-report.json',import.meta.url),JSON.stringify({animation,itemIcons:icons.length,errors,method:'Rendered real hero atlas frames through production drawHero, checked distinct pixel frames; inspected final runtime item artwork and coordinated impact.'},null,2));
await browser.close();console.log(`PASS: ${animation.length} actor/state animations; ${icons.length} runtime equipment icons.`);
