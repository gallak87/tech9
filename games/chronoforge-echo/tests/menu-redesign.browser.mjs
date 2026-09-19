import {reviewURL} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=reviewURL('menu-redesign/');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={checks:[],errors:[],missing:[]};
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.missing.push(r.url());});
 await page.routeWebSocket('**/*',socket=>{socket.send(JSON.stringify({type:'connected'}));socket.onMessage(()=>{});});
 await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__,{timeout:60000});
 await page.evaluate(()=>{__ECHO__.preset('party');__ECHO__.game.ui.toggleMenu();});
 const tabs=['map','party','inventory','skills','quests','save','settings'];
 for(const width of [1920,1024,720]){
  await page.setViewportSize({width,height:Math.round(width*9/16)});
  for(let i=0;i<7;i++){
   await page.keyboard.press(String(i+1));await page.waitForTimeout(50);
   const check=await page.locator('.expedition').evaluate((el,{width,tab})=>({width,tab,font:getComputedStyle(el).fontFamily,overflow:el.scrollWidth>el.clientWidth+2,bodyOverflow:el.querySelector('.atlas-body').scrollWidth>el.querySelector('.atlas-body').clientWidth+2,broken:[...el.querySelectorAll('img')].filter(i=>!i.naturalWidth).length,visible:el.getBoundingClientRect().height>0}),{width,tab:tabs[i]});
   await page.screenshot({path:new URL(`${width}-${tabs[i]}.png`,out).pathname});if(check.bodyOverflow)console.log(await page.locator('.atlas-body').evaluate(el=>[...el.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().width&&x.scrollWidth>x.clientWidth+2).map(x=>({cls:x.className,sw:x.scrollWidth,cw:x.clientWidth}))));report.checks.push(check);assert.ok(!check.overflow&&!check.bodyOverflow&&!check.broken,JSON.stringify(check));
   await page.screenshot({path:new URL(`${width}-${tabs[i]}.png`,out).pathname});
  }
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.evaluate(()=>{const g=__ECHO__.game;g.state.inventory.glacial_claw=1;g.state.heroes[0].hp=10;g.state.heroes[0].skillPoints=5;g.state.heroes[0].skills=['rift_cleave','salt_mend'];g.ui.hero=0;});
 const click=async action=>page.locator(`[data-do="${action}"]`).click();
 const state=()=>page.evaluate(()=>__ECHO__.snapshot().state);
 await page.keyboard.press('3');await click('item:glacial_claw');assert.match(await page.locator('[data-pack-item="glacial_claw"] .exp-pack-stats').getAttribute('aria-label'),/Compared with Iron Blade/);await click('equip:glacial_claw');assert.equal((await state()).heroes[0].equip.weapon,'glacial_claw');await click('unequip:weapon');assert.equal((await state()).inventory.glacial_claw,1);await click('item:field_tonic');await click('use:field_tonic');assert.equal((await state()).heroes[0].hp,90);
 await page.keyboard.press('4');await click('learn:chrono_strike');assert.ok((await state()).heroes[0].skills.includes('chrono_strike'));assert.equal((await state()).heroes[0].skillPoints,4);await click('hero:1');assert.equal(await page.locator('.exp-crew-choice[aria-pressed="true"] span').innerText(),'Vex');
 await page.keyboard.press('6');await click('save:1');await page.evaluate(()=>__ECHO__.game.state.heroes[0].hp=12);await click('load:1');await page.keyboard.press('Escape');assert.equal((await state()).heroes[0].hp,12);await click('load:1');await click('confirm-yes');assert.equal((await state()).heroes[0].hp,90);
 await page.keyboard.press('Escape');await page.keyboard.press('7');const old=(await state()).settings.minimap;await click('setting:minimap');assert.equal((await state()).settings.minimap,!old);await click('setting:minimap');await page.locator('[data-setting="music"]').focus();await page.keyboard.press('ArrowRight');assert.ok((await state()).settings.music>.4);await click('rebind:up');await page.keyboard.press('i');assert.equal((await state()).settings.keys.up,'i');
 await page.keyboard.press('1');const before=await page.evaluate(()=>({x:__ECHO__.game.ui.map.panX,z:__ECHO__.game.ui.map.zoom}));await page.keyboard.press('ArrowRight');await page.keyboard.press('+');assert.ok(await page.evaluate(b=>__ECHO__.game.ui.map.panX<b.x&&__ECHO__.game.ui.map.zoom>b.z,before));await page.keyboard.press('r');assert.equal(await page.evaluate(()=>__ECHO__.game.ui.map.panX),0);
 await page.evaluate(()=>{const g=__ECHO__.game;g.state.flags.haventide_liberated=true;g.ui.render();});await click('travel:haventide');await page.waitForTimeout(700);assert.equal((await state()).region,'haventide_town');
 await page.evaluate(()=>{const g=__ECHO__.game;g.ui.showVendor({id:'review-rest',name:'Wayfarer’s rest',service:'rest'});});await page.screenshot({path:new URL('rest.png',out).pathname});assert.equal(await page.locator('[data-do="open-atlas"]').count(),0);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.do),'rest');await page.keyboard.press('Enter');assert.equal(await page.locator('.expedition').count(),0);assert.match(await page.locator('.notice').innerText(),/crew rests|welcome the crew freely/i);await page.keyboard.press('Escape');assert.equal(await page.locator('.atlas').count(),0);
 await page.evaluate(()=>{const g=__ECHO__.game;g.ui.showDialogue([{speaker:'Kaida',text:'The salt road is quiet again. Let’s see who still keeps a lamp in the window.'}]);});await page.screenshot({path:new URL('dialogue.png',out).pathname});await page.keyboard.press('Enter');
 report.interactions=['equip','unequip','consume','learn','hero selection','save','load cancellation','load confirmation','settings toggle','keyboard volume','rebind','map pan/zoom/recenter','hub travel','layered Escape','dialogue'];
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);console.log(JSON.stringify(report,null,2));
}finally{await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser.close();}
