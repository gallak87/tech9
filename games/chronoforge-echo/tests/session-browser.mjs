import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}});
const report={method:'Party fixture and a real pending travel operation, followed by actual Save/Load/New Expedition controls. Verifies that prior-session transitions, held input and reward notices cannot survive replacement of the saved state.',errors:[],checks:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
await page.routeWebSocket('**/*',s=>{s.send(JSON.stringify({type:'connected'}));s.onMessage(()=>{});});
const action=async id=>page.locator(`[data-do="${id}"]`).click();
const snap=()=>page.evaluate(()=>({region:__ECHO__.game.state.region,heroes:__ECHO__.game.state.heroes.map(h=>h.id),transition:__ECHO__.game.transition,queue:__ECHO__.game.rewardQueue,keys:[...__ECHO__.game.keys],moving:__ECHO__.game.moving}));
async function pendingTravel(){await page.evaluate(()=>{const g=__ECHO__.game;g.travel('emberline');g.rewards([{id:'ore',amount:3,label:'Earlier expedition notice'}]);g.keys.add('ArrowRight');g.moving=true;});}
try{
  await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);await page.evaluate(()=>__ECHO__.preset('party'));
  await page.keyboard.press('Escape');await page.keyboard.press('6');await action('save:1');
  await pendingTravel();await action('load:1');await action('confirm-yes');
  let s=await snap();assert.equal(s.region,'haventide');assert.equal(s.transition,null);assert.deepEqual(s.queue,[]);assert.deepEqual(s.keys,[]);assert.equal(s.moving,false);assert.equal(s.heroes.length,3);await page.waitForTimeout(650);assert.equal((await snap()).region,'haventide');report.checks.push('Load clears an old gateway before it can overwrite the loaded location');
  await page.keyboard.press('Escape');await page.keyboard.press('6');await pendingTravel();await action('restart');await action('confirm-yes');
  s=await snap();assert.equal(s.region,'haventide');assert.equal(s.transition,null);assert.deepEqual(s.queue,[]);assert.deepEqual(s.keys,[]);assert.deepEqual(s.heroes,['kaida']);
  for(let n=0;n<10&&await page.locator('[data-do="dialogue-next"]').count();n++)await page.keyboard.press('Enter');await page.waitForTimeout(650);assert.equal((await snap()).region,'haventide');report.checks.push('New expedition remains at the solo opening after the previous gateway would finish');
  await page.keyboard.press('Escape');await page.keyboard.press('6');assert.equal(await page.locator('[data-do="load:1"]').count(),1);report.checks.push('Manual record remains available after restart');
  await page.screenshot({path:base+'evidence/session-restart-saves.png'});assert.deepEqual(report.errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(base+'evidence/session-browser.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
