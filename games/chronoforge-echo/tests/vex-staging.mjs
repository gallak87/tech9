import {reviewURL} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const folder=reviewURL('vex-refresh/').pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
try{
 await page.goto('http://127.0.0.1:4321/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(()=>{__ECHO__.preset('party');__ECHO__.goto('emberline');const g=__ECHO__.game;g.resetSession();window.stagingUpdate=g.update;g.update=()=>{};Object.assign(g.state,g.safePoint(g.scene,2150,1450));g.state.facing='right';g.near=null;g.resetFollowers();g.updateCamera(true);g.ui.render();});
 await page.waitForTimeout(40);await page.screenshot({path:folder+'crew-idle.png'});
 await page.keyboard.down('ArrowRight');await page.evaluate(()=>{for(let i=0;i<38;i++)window.stagingUpdate.call(__ECHO__.game,1/60);});await page.waitForTimeout(40);await page.screenshot({path:folder+'crew-clear-ground-walking.png'});await page.keyboard.up('ArrowRight');
 await page.keyboard.press('Escape');await page.keyboard.press('2');await page.locator('[data-do="hero:1"]').click();assert.equal(await page.evaluate(()=>__ECHO__.game.ui.hero),1);await page.waitForTimeout(40);await page.screenshot({path:folder+'party-portrait.png'});
 const state=await page.evaluate(()=>({position:{x:__ECHO__.game.state.x,y:__ECHO__.game.state.y},followers:__ECHO__.game.followers,selectedHero:__ECHO__.game.state.heroes[__ECHO__.game.ui.hero].id,assets:__ECHO__.snapshot().assets}));assert.equal(state.selectedHero,'vex');assert.deepEqual(errors,[]);await fs.writeFile(folder+'staging.json',JSON.stringify({result:'pass',method:'Camera/party fixtures on the open southern Emberline road, no earned progression claim. Actual keyboard walk and Party selection; previous roof/stale-near fixture superseded.',...state,errors},null,2));console.log('Vex staging PASS');
}finally{await browser.close();}
