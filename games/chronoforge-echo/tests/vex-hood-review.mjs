import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=new URL('../evidence/vex-hood-v2/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
 await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(()=>{const g=__ECHO__.game;g.update=()=>{};__ECHO__.preset('solo');__ECHO__.goto('emberline_town');const o=g.scene.objects.find(o=>o.id==='vex');Object.assign(g.state,g.safePoint(g.scene,o.x+65,o.y));g.state.facing='left';g.near=o;g.resetFollowers();g.updateCamera(true);g.ui.render();});
 await page.waitForTimeout(60);await page.screenshot({path:new URL('npc-beside-kaida.png',out).pathname});
 await page.screenshot({path:new URL('vex-beside-kaida-detail.png',out).pathname,clip:{x:485,y:340,width:255,height:220}});
 await page.keyboard.press('f');await page.waitForTimeout(60);await page.screenshot({path:new URL('dialogue-portrait.png',out).pathname});await page.keyboard.press('Escape');
 report.sizes=await page.evaluate(()=>{
  const cv=document.createElement('canvas');cv.id='hood-review';cv.width=1000;cv.height=740;cv.style='position:fixed;inset:0;z-index:999999;width:1000px;height:740px';document.body.append(cv);const c=cv.getContext('2d');c.fillStyle='#292827';c.fillRect(0,0,1000,740);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';let sizes=[];
  for(const [col,facing] of ['right','down','up'].entries()){
   for(let row=0;row<5;row++){
    const moving=row>0,time=moving?(row-1+.1)/9:0,opt={facing,moving,time};
    const probe=document.createElement('canvas');probe.width=220;probe.height=140;const p=probe.getContext('2d');__ECHO__.drawHero(p,'vex',110,120,opt);const rgba=p.getImageData(0,0,220,140).data;let top=140,bottom=0;for(let y=0;y<140;y++)for(let x=0;x<220;x++)if(rgba[(y*220+x)*4+3]>190){top=Math.min(top,y);bottom=Math.max(bottom,y);}sizes.push({facing,phase:row,height:bottom-top+1});
    c.fillStyle='#dedad4';c.font='12px sans-serif';c.fillText(`${facing} / ${row?'step '+row:'idle'}`,col*330+24,row*145+18);__ECHO__.drawHero(c,'vex',col*330+200,row*145+136,{...opt,scale:1.35});if(!row)__ECHO__.drawHero(c,'kaida',col*330+90,row*145+136,{facing,scale:1.35});
   }
  }return sizes;
 });
 await page.locator('#hood-review').screenshot({path:new URL('standing-and-gait.png',out).pathname});
 for(const facing of ['right','down','up']){const rows=report.sizes.filter(r=>r.facing===facing);assert.ok(rows.every(r=>Math.abs(r.height-rows[0].height)<=4),JSON.stringify(rows));}
 await page.evaluate(()=>{const cv=document.querySelector('#hood-review'),c=cv.getContext('2d');c.fillStyle='#d7ccba';c.fillRect(0,0,1000,740);for(const [i,pose]of ['idle','anticipate','attack','cast','hurt','guard','down','victory','front','back'].entries()){const x=i%5*200+100,y=Math.floor(i/5)*340+270;__ECHO__.drawHero(c,'vex',x,y,{pose,scale:1.65,facing:pose==='front'?'down':pose==='back'?'up':'right'});c.fillStyle='#222';c.font='16px sans-serif';c.fillText(pose,x-40,y+35);}});
 await page.locator('#hood-review').screenshot({path:new URL('combat-pose-crops.png',out).pathname});
 report.assets=await page.evaluate(()=>__ECHO__.snapshot().assets);assert.deepEqual(report.assets.errors,[]);assert.deepEqual(report.errors,[]);report.result='pass';
} catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await browser.close();await fs.writeFile(new URL('results.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
