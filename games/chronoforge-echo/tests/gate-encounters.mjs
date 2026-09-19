import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const report={method:'Scene/approach position fixtures, followed by actual keyboard movement and gate controls. Haventide victory uses legal keyboard attacks with accelerated normal Game.update, no HP/reward/clear grants. Screenshots are actual rendering.',checks:[],errors:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
const shot=async name=>{const file=`gate-${name}.png`;await page.screenshot({path:reviewRoot + ''+file});return file;};
const status=()=>page.evaluate(()=>{const g=window.__ECHO__.game;return {mode:g.mode,panel:g.ui.panel?.type,menu:g.ui.menu,near:g.near?.id,encounter:g.battle?.encounter.id};});
async function approachDoor(){
  await page.evaluate(()=>{const g=window.__ECHO__.game,t=g.scene.objects.find(o=>o.type==='town');g.walkTo(t.x+26,t.y+15);});
  await page.waitForFunction(()=>!window.__ECHO__.game.movePath.length);
  await page.waitForTimeout(180);
}
async function closeDialogue(){
  for(let n=0;n<12&&await page.locator('[data-do="dialogue-next"]').count();n++)await page.keyboard.press('Enter');
}
try{
  await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4323/?test=1');
  await page.waitForFunction(()=>window.__ECHO_READY__);
  for(const region of ['haventide','emberline','orbital_reach','last_crown']){
    const gate=await page.evaluate(async region=>{
      window.__ECHO__.preset('world');window.__ECHO__.goto(region);const g=window.__ECHO__.game;g.resetSession();g.encounterCooldown=0;
      const t=g.scene.objects.find(o=>o.type==='town'),guard=g.scene.objects.find(o=>o.id===t.guard);
      const {isWalkable}=await import('/src/world.js');
      Object.assign(g.state,{x:guard.x,y:guard.y+90});g.updateCamera(true);g.resetFollowers();g.ui.render();
      return {region,door:t.id,guard:guard.id,enemies:guard.enemies,distance:Math.hypot(t.x-guard.x,t.y-guard.y),walkable:isWalkable(g.scene,guard.x,guard.y),x:guard.x,y:guard.y};
    },region);
    assert.ok(gate.distance<110&&gate.walkable,'Sentry must occupy a nearby walkable gate approach');
    await page.keyboard.down('ArrowUp');await page.waitForTimeout(790);await page.keyboard.up('ArrowUp');
    assert.equal((await status()).mode,'world','Approaching a gate must not spring a battle');
    assert.equal((await status()).panel,undefined);
    const passed=await page.evaluate(gate=>window.__ECHO__.game.state.y<gate.y,gate);assert.ok(passed,'Keyboard path must actually pass the guard');
    gate.approach=await shot(region+'-approach');
    await approachDoor();assert.equal((await status()).near,gate.door);
    assert.match(await page.locator('.interaction').innerText(),/entrance blocked/);
    await page.keyboard.press('f');
    assert.equal((await status()).mode,'world');assert.equal((await status()).panel,'confirm');
    const expected=await page.evaluate(async id=>(await import('/src/content.js')).ENEMIES[id].name,gate.enemies[0]);
    assert.equal(await page.locator('[data-do="confirm-yes"]').innerText(),'Confront '+expected);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.do),'confirm-no');
    gate.choice=await shot(region+'-choice');
    await page.keyboard.press('Escape');assert.equal((await status()).panel,undefined);assert.equal((await status()).menu,false);
    await page.waitForTimeout(1200);assert.equal((await status()).mode,'world');
    await page.keyboard.press('f');await page.keyboard.press('Enter');
    assert.equal((await status()).panel,undefined,'Default choice steps back');
    await page.keyboard.press('f');
    if(region==='haventide'){
      await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
    }else await page.locator('[data-do="confirm-yes"]').click();
    assert.match(await page.locator('.dialogue-text').innerText(),new RegExp(expected));
    if(region==='haventide')assert.doesNotMatch(await page.locator('.dialogue-text').innerText(),/rust scrapper/i);
    await closeDialogue();assert.equal((await status()).encounter,gate.guard);
    assert.deepEqual(await page.evaluate(()=>window.__ECHO__.game.battle.encounter.enemies),gate.enemies);
    gate.battle=await shot(region+'-battle');
    if(region==='haventide'){
      for(let action=0;action<12;action++){
        const ready=await page.evaluate(()=>{const g=window.__ECHO__.game;for(let i=0;i<3600;i++){if(g.ui.blocked||g.mode!=='battle'||g.battle.result||g.battle.selectedHero)return !!g.battle?.selectedHero;g.update(1/60);}throw Error('No battle progress');});
        if(!ready)break;
        await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
        await page.evaluate(()=>{const g=window.__ECHO__.game;for(let i=0;i<600&&g.battle?.mode==='action';i++)g.update(1/60);});
      }
      await page.evaluate(()=>{const g=window.__ECHO__.game;for(let i=0;i<180&&g.mode==='battle';i++)g.update(1/60);});
      await closeDialogue();
      const victory=await page.evaluate(()=>({clear:window.__ECHO__.game.state.cleared.hav_guard,liberated:window.__ECHO__.game.state.flags.haventide_liberated,roadCrabClear:!!window.__ECHO__.game.state.cleared.hav_first}));
      assert.ok(victory.clear&&victory.liberated);assert.equal(victory.roadCrabClear,false);
      await approachDoor();assert.match(await page.locator('.interaction').innerText(),/Enter Haventide/);
      gate.open=await shot('haventide-liberated');await page.keyboard.press('f');
      await page.waitForFunction(()=>window.__ECHO__.game.scene.id==='haventide_town'&&!window.__ECHO__.game.transition);
      gate.entered=await shot('haventide-inside');gate.victory=victory;
    }
    report.checks.push({...gate,pass:true});
  }
  // Ordinary wilderness encounters retain their original contact trigger.
  await page.evaluate(()=>{window.__ECHO__.preset('world');const g=window.__ECHO__.game;g.resetSession();g.encounterCooldown=0;g.state.flags.battle_taught=true;const o=g.scene.objects.find(o=>o.id==='hav_first');Object.assign(g.state,{x:o.x,y:o.y+60});g.updateCamera(true);});
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(360);await page.keyboard.up('ArrowUp');
  assert.equal((await status()).encounter,'hav_first');
  report.ordinaryPatrolStillTriggers=true;
  assert.deepEqual(report.errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await fs.writeFile(reviewRoot + 'gate-encounters.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
