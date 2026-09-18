import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=new URL('../evidence/presentation-polish/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),report={checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
 await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(async()=>{window.art=__ECHO__;window.combat=await import('/src/combat.js');window.originalUpdate=__ECHO__.game.update;__ECHO__.game.update=()=>{};});
 const shot=async name=>{await page.waitForTimeout(40);await page.screenshot({path:new URL(name+'.png',out).pathname});};
 report.scale=await page.evaluate(()=>{
  const cv=document.createElement('canvas');cv.id='art-review';cv.width=1200;cv.height=950;cv.style='position:fixed;inset:0;z-index:999999;width:1200px;height:950px;background:#222';document.body.append(cv);const ctx=cv.getContext('2d');ctx.fillStyle='#222';ctx.fillRect(0,0,1200,950);const rows=[];
  for(const [col,facing]of ['right','left','up','down'].entries())for(let row=0;row<5;row++){
   const time=row?((row-1)+.1)/9:0,options={time,moving:row>0,facing};
   const probe=document.createElement('canvas');probe.width=250;probe.height=160;const pc=probe.getContext('2d');art.drawHero(pc,'kaida',125,140,options);const data=pc.getImageData(0,0,250,160).data;let top=160,bottom=0;
   for(let y=0;y<160;y++)for(let x=0;x<250;x++)if(data[(y*250+x)*4+3]>190){top=Math.min(top,y);bottom=Math.max(bottom,y);}
   rows.push({facing,state:row?'walk'+row:'idle',height:bottom-top+1});
   ctx.fillStyle='#ccc';ctx.font='16px sans-serif';ctx.fillText(`${facing} / ${row?'step '+row:'stopped'}`,col*300+25,row*185+25);ctx.strokeStyle='#555';ctx.beginPath();ctx.moveTo(col*300+10,row*185+177);ctx.lineTo(col*300+290,row*185+177);ctx.stroke();art.drawHero(ctx,'kaida',col*300+150,row*185+177,{...options,scale:1.8});
  }return rows;
 });
 for(const direction of ['right','left','up','down']){const rows=report.scale.filter(r=>r.facing===direction),idle=rows[0].height;assert.ok(rows.every(r=>Math.abs(r.height-idle)<=4),direction+' stays within gait bob of standing height');}
 await page.locator('#art-review').screenshot({path:new URL('kaida-standing-and-four-gait-phases.png',out).pathname});await page.evaluate(()=>document.querySelector('#art-review').remove());
 report.checks.push('All four directions preserve body scale on standing/walk transitions; fixed row scale retains gait bob.');
 await page.evaluate(()=>{__ECHO__.preset('world');__ECHO__.goto('haventide');__ECHO__.game.encounterCooldown=9999;});
 report.movement=[];
 for(const run of [false,true])for(const [key,facing]of [['ArrowRight','right'],['ArrowUp','up'],['ArrowLeft','left'],['ArrowDown','down']]){
  if(run)await page.keyboard.down('Shift');await page.keyboard.down(key);await page.evaluate(()=>{for(let i=0;i<4;i++)originalUpdate.call(__ECHO__.game,.05);});
  const moving=await page.evaluate(()=>({moving:__ECHO__.game.moving,facing:__ECHO__.game.state.facing}));assert.equal(moving.moving,true);assert.equal(moving.facing,facing);
  await page.keyboard.up(key);if(run)await page.keyboard.up('Shift');await page.evaluate(()=>originalUpdate.call(__ECHO__.game,.016));assert.equal(await page.evaluate(()=>__ECHO__.game.moving),false);report.movement.push({run,facing,stopped:true});
 }
 report.checks.push('Actual keyboard walk/stop and Shift-run/stop in right, up, left and down.');
 await page.evaluate(()=>{__ECHO__.goto('emberline_town');const g=__ECHO__.game,o=g.scene.objects.find(o=>o.service==='smith');Object.assign(g.state,g.safePoint(g.scene,o.x-95,o.y+30));g.near=o;g.resetFollowers();g.updateCamera(true);g.ui.updateHUD();});await shot('blacksmith-full-body');
 for(const scene of ['orbital_reach','crater_ember']){await page.evaluate(scene=>{__ECHO__.goto(scene);const g=__ECHO__.game,o=g.scene.objects.find(o=>o.type==='cave');Object.assign(g.state,g.safePoint(g.scene,o.x,o.y+65));g.near=o;g.updateCamera(true);g.ui.updateHUD();},scene);await shot('entrance-'+scene);}
 await page.evaluate(()=>{__ECHO__.preset('battle');const g=__ECHO__.game;for(const h of g.battle.heroes)h.atb=99.999;for(const e of g.battle.enemies)e.atb=0;combat.updateBattle(g.battle,g.state,.001);g.battleUI.render();});
 await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.down('Enter');await page.evaluate(()=>__ECHO__.game.battleUI.render());
 assert.equal(await page.locator('#battle-interface').getAttribute('data-stage'),'3');
 await page.evaluate(()=>{const g=__ECHO__.game,a=g.battle.action;combat.updateBattle(g.battle,g.state,(a.windowStart+a.windowEnd)/2);g.battleUI.render();});
 assert.equal(await page.locator('.cb-timing-track').count(),1);assert.equal(await page.locator('.cb-action-progress').count(),0);assert.ok(await page.locator('#battle-interface').evaluate(el=>el.classList.contains('cb-critical-window')));await shot('defend-critical-window');
 await page.keyboard.down('Enter');assert.equal(await page.evaluate(()=>__ECHO__.game.battle.action.timingAttempted),false);await page.keyboard.up('Enter');await page.keyboard.press('Enter');
 await page.evaluate(()=>{const g=__ECHO__.game;combat.updateBattle(g.battle,g.state,.4);g.battleUI.render();});
 assert.equal(await page.evaluate(()=>__ECHO__.game.battle.heroes[0].criticalGuard),true);assert.match(await page.locator('.cb-timing').innerText(),/75%/);assert.ok(!(await page.locator('#battle-interface').evaluate(el=>el.classList.contains('cb-critical-window'))));await shot('defend-critical-caught');
 await page.evaluate(()=>{const g=__ECHO__.game;combat.updateBattle(g.battle,g.state,1);g.battleUI.render();});assert.equal(await page.locator('#battle-interface').getAttribute('data-stage'),'0');
 report.checks.push('Defend uses Attack timing track, flashes only while fresh attempt is possible, ignores held activation, catches critical guard, returns to crew.');
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();report.browserClosed=true;await fs.writeFile(new URL('results.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
