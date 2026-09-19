import {reviewURL} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(reviewURL('ui-overhaul'));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),report={errors:[],missing:[],menus:[],anchors:[],scope:'Development fixtures stage scenes; production DOM, controls, camera and rewards are exercised in an isolated browser profile.'};
try{
 const page=await browser.newPage({viewport:{width:1440,height:810}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.missing.push(r.url());});
 await page.routeWebSocket('**/*',socket=>{socket.send(JSON.stringify({type:'connected'}));socket.onMessage(()=>{});});
 await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4321/?test=1');
 await page.waitForFunction(()=>window.__ECHO_READY__,{},{timeout:60000});
 await page.evaluate(()=>document.fonts.ready);
 report.assets=await page.evaluate(()=>__ECHO__.snapshot().assets);
 const shot=async name=>{await page.waitForTimeout(160);await page.screenshot({path:`${out}/${name}.png`});};
 await page.evaluate(()=>{__ECHO__.preset('party');const g=__ECHO__.game;g._reviewUpdate=g.update.bind(g);g.update=()=>{};g.ui.toggleMenu();});
 for(const [width,height]of [[1440,810],[1024,640]]){
  await page.setViewportSize({width,height});
  for(let i=0;i<7;i++){
   await page.keyboard.press(String(i+1));await page.waitForTimeout(150);
   report.menus.push(await page.evaluate(({width,i})=>{const body=document.querySelector('.atlas-body'),root=document.querySelector('#game');return {width,tab:i,actual:__ECHO__.game.ui.tab,bodyWidth:body.clientWidth,bodyScroll:body.scrollWidth,menuFont:getComputedStyle(body).fontFamily,screenWidth:root.clientWidth,documentWidth:document.documentElement.clientWidth,documentScroll:document.documentElement.scrollWidth};},{width,i}));
   if(width===1440)await shot('menu-'+['map','party','inventory','skills','quests','save','settings'][i]);
  }
 }
 assert.ok(report.menus.every(m=>m.actual===m.tab&&m.bodyScroll<=m.bodyWidth+2&&m.documentScroll<=m.documentWidth+2),'Menu horizontal overflow or wrong tab');
 await page.setViewportSize({width:1440,height:810});await page.keyboard.press('Escape');
 async function house(position){return page.evaluate(position=>{__ECHO__.goto('hav_house');const g=__ECHO__.game,o=g.scene.objects.find(o=>o.id==='hav_house_food');Object.assign(g.state,g.safePoint(g.scene,o.x+70,o.y+30));g.updateCamera(true);if(position)Object.assign(g.camera,{x:o.x-position[0],y:o.y-position[1]});g.near=o;g.visualTime=.9;g.ui.render();const game=document.querySelector('#game').getBoundingClientRect(),prompt=document.querySelector('.interaction').getBoundingClientRect();return {position,objectX:game.left+(o.x-g.camera.x)/960*game.width,objectY:game.top+(o.y-g.camera.y)/540*game.height,game:{left:game.left,top:game.top,right:game.right,bottom:game.bottom},prompt:{left:prompt.left,top:prompt.top,right:prompt.right,bottom:prompt.bottom},label:document.querySelector('.interaction').textContent};},position);}
 report.anchors.push(await house(null));await shot('house-pickup-prompt');
 for(const p of [[40,40],[920,40],[920,500],[40,500]])report.anchors.push(await house(p));
 for(const a of report.anchors){assert.ok(a.prompt.left>=a.game.left&&a.prompt.right<=a.game.right&&a.prompt.top>=a.game.top&&a.prompt.bottom<=a.game.bottom,'Object prompt clipped');assert.ok(Math.abs((a.prompt.left+a.prompt.right)/2-a.objectX)<250,'Object prompt detached horizontally');}
 await house(null);
 report.hud=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right}:null;};const g=__ECHO__.game;return {minimap:rect('.minimap-wrap'),location:rect('.location-plaque'),objective:rect('.objective'),resources:rect('.resources'),font:getComputedStyle(document.querySelector('#hud')).fontFamily};});
 assert.ok(report.hud.location.top>=report.hud.minimap.bottom,'Location strip belongs beneath the minimap');
 assert.ok(report.hud.resources.left-report.hud.objective.right>=0&&report.hud.resources.left-report.hud.objective.right<=24,'Objective should sit beside resources');
 await shot('hud-final');
 await page.evaluate(()=>{const g=__ECHO__.game;g.state.settings.minimap=false;g.ui.updateHUD();});await shot('hud-minimap-off');
 assert.equal(await page.locator('#minimap').count(),0);assert.equal(await page.locator('.location-plaque').count(),1);
 await page.evaluate(()=>{const g=__ECHO__.game;g.state.settings.minimap=true;g.update=g._reviewUpdate;g.ui.updateHUD();});
 await page.keyboard.press('f');await page.waitForSelector('.reward');await shot('pickup-reward');
 const reward=page.locator('.reward').first();report.rewardText=await reward.textContent();
 report.rewardStyle=await reward.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderLeftColor,font:getComputedStyle(el).fontFamily,width:el.getBoundingClientRect().width,animation:getComputedStyle(el).animation}));
 await page.waitForTimeout(2750);assert.equal(await page.locator('.reward').count(),0,'Reward should have departed');
 await page.evaluate(()=>{__ECHO__.goto('haventide');__ECHO__.interact('hav_camp');});await shot('rest-selection');
 assert.equal(await page.locator('[data-do="rest"]').count(),1);
 report.rest=await page.locator('.atlas').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
 assert.ok(report.rest.width<=662&&report.rest.height<500&&report.rest.scrollWidth<=report.rest.clientWidth+2,'Rest should remain compact and unclipped');
 assert.equal(await page.locator('[data-do="open-atlas"]').count(),0,'Services must not offer an Atlas shortcut');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.do),'rest','Rest is the default service action');
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('.expedition').count(),0,'Confirming the service must not open the menu');
 assert.match(await page.locator('.notice').innerText(),/crew rests|welcome the crew freely/i);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-do="rest"]').count(),0);
 await page.evaluate(()=>__ECHO__.game.ui.showDialogue([{speaker:'Kaida',text:'One road. One pair of boots.'},{speaker:'Vex',text:'And a few questions worth carrying.'}]));await shot('dialogue');
 report.dialogue=await page.locator('.dialogue').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor,font:getComputedStyle(el.querySelector('.dialogue-text')).fontFamily}));
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await page.evaluate(()=>{__ECHO__.preset('battle');const g=__ECHO__.game;g.update=()=>{};for(let i=0;i<2400&&!g.battle.selectedHero;i++)g._reviewUpdate(1/60);});await shot('battle-crew');
 await page.keyboard.press('Enter');await shot('battle-actions');
 await page.keyboard.press('Enter');await shot('battle-target');
 await page.keyboard.press('Enter');await shot('battle-timing');
 report.battle=await page.evaluate(()=>({mode:__ECHO__.game.battle.mode,stage:document.querySelector('#battle-interface').dataset.stage,font:getComputedStyle(document.querySelector('#battle-interface')).fontFamily}));
 assert.equal(report.battle.stage,'3');
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.missing,[]);
 assert.deepEqual(report.assets.errors,[]);
 report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(out+'/combined-review.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
