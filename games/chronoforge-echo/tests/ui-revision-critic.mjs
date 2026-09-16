import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname,state=JSON.parse(await fs.readFile(base+'evidence/earned-campaign-saves.json','utf8')).saves['chapter-aftermath'].state;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],report={method:'Actual keyboard input after loading the unmodified earned aftermath save through production persistence. Shop reached by production walkTo and nearby interaction. No state grants.',tabs:[],errors};
page.on('pageerror',e=>errors.push(String(e)));await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
try{
 await page.evaluate(async state=>{const {saveState}=await import('/src/persistence.js');saveState(state,1);const g=window.__ECHO__.game;g.load(1);window.criticStep=g.update.bind(g);g.update=()=>{};},state);await page.keyboard.press('Escape');
 const sample=()=>page.evaluate(()=>{const b=document.querySelector('.atlas-body');return {top:b.scrollTop,height:b.clientHeight,total:b.scrollHeight,focus:document.activeElement?.dataset.do};});
 for(const tab of ['2','5']){
  await page.keyboard.press(tab);const samples=[{key:'initial',...await sample()}];
  if(tab==='2')report.party=await page.evaluate(()=>{const b=document.querySelector('.atlas-body').getBoundingClientRect(),r=document.querySelector('.party-panel:last-child .equipment-line').getBoundingClientRect();return {runeBottom:r.bottom,viewportBottom:b.bottom,visible:r.bottom<=b.bottom};});
  for(const key of ['PageDown','Home','End','Home','ArrowDown','ArrowUp']){await page.keyboard.press(key);await page.waitForTimeout(30);samples.push({key,...await sample()});}
  report.tabs.push({tab,samples});
  if(tab==='5'){assert.ok(samples[1].top>0,'Quests PageDown scrolls');assert.ok(samples[3].top>samples[1].top,'Quests End reaches later quests');assert.ok(samples[5].top>0,'Quests ArrowDown scrolls');assert.equal(samples[6].top,0,'Quests ArrowUp returns');await page.keyboard.press('End');}
  await page.screenshot({path:base+'evidence/critic-revised-keyboard-tab-'+tab+'.png'});
 }
 assert.equal(report.party.visible,true,'Rune equipment visible without scrolling');
 await page.keyboard.press('6');report.saveText=await page.locator('.save-slot').first().innerText();assert.match(report.saveText,/Haventide/);assert.doesNotMatch(report.saveText,/haventide_town/);await page.screenshot({path:base+'evidence/critic-ui-save-display.png'});await page.keyboard.press('Escape');
 report.travel=await page.evaluate(async()=>{
  const g=window.__ECHO__.game,W=await import('/src/world.js'),o=g.scene.objects.find(o=>o.id==='haventide_smith');if(!o)throw Error('Earned aftermath must be in Haventide');const from={x:g.state.x,y:g.state.y};g.walkTo(o.x,o.y+48);let n=0;while(g.movePath.length&&n++<30000)window.criticStep(1/60);if(n>=30000)throw Error('Smith route timeout');
  for(let i=0;i<160&&!W.nearby(g.scene,g.state.x,g.state.y,g.state).some(x=>x.id===o.id);i++){const dx=o.x-g.state.x,dy=o.y-g.state.y;if(Math.abs(dx)>3)g.keys.add(dx>0?'ArrowRight':'ArrowLeft');if(Math.abs(dy)>3)g.keys.add(dy>0?'ArrowDown':'ArrowUp');window.criticStep(1/60);g.keys.clear();}
  if(!W.nearby(g.scene,g.state.x,g.state.y,g.state).some(x=>x.id===o.id))throw Error('Smith not within interaction distance');g.interact(o);return {from,to:{x:g.state.x,y:g.state.y},scene:g.scene.id,steps:n};
 });
 report.vendor=[];
 for(let i=0;i<3;i++){
  await page.locator(`[data-do="hero:${i}"]`).focus();await page.keyboard.press('Enter');
  const comparison=await page.evaluate(async i=>{const {ITEMS}=await import('/src/content.js'),g=window.__ECHO__.game,h=g.state.heroes[i];const rows=[...document.querySelectorAll('[data-do^="buy:"]')].map(b=>{const id=b.dataset.do.slice(4),it=ITEMS[id],old=ITEMS[h.equip[it.slot]];return {id,text:b.innerText,expectedLostStrength:old?.stats.str&&!it.stats.str? -old.stats.str:null};});return {hero:h.name,selected:g.ui.hero,rows};},i);
  assert.equal(comparison.selected,i);assert.ok(comparison.rows.some(r=>r.text.includes('vs '+comparison.hero+':')));for(const r of comparison.rows.filter(r=>r.expectedLostStrength))assert.ok(r.text.includes('Strength '+r.expectedLostStrength),`Lost Strength visible for ${comparison.hero}/${r.id}`);
  report.vendor.push(comparison);
 }
 assert.ok(report.vendor.some(v=>v.rows.some(r=>r.expectedLostStrength)),'At least one actual lost-strength comparison covered');
 await page.locator('[data-do="hero:0"]').focus();await page.keyboard.press('Enter');await page.keyboard.press('Home');await page.screenshot({path:base+'evidence/critic-ui-vendor-top.png'});const initial=await sample();await page.keyboard.press('End');const end=await sample();assert.ok(end.top>initial.top,'Service End scrolls');report.vendorScroll={initial,end};await page.screenshot({path:base+'evidence/critic-ui-vendor-comparisons.png'});
 assert.deepEqual(errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(base+'evidence/ui-revision-critic.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,failure:report.failure,party:report.party,tabs:report.tabs,saveText:report.saveText,heroes:report.vendor?.map(v=>({hero:v.hero,lossRows:v.rows.filter(r=>r.expectedLostStrength).length})),errors}));await browser.close();}
