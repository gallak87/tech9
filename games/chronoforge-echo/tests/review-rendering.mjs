import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root=new URL('../',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={method:'Actual game canvas and mouse input at desktop and Retina viewports. Declared scene fixtures isolate display/input scaling; no image composites or progression claims.',browser:await browser.version(),errors:[],views:[]};
try {
  for(const spec of [{width:1920,height:1080,dpr:1},{width:1512,height:982,dpr:2}]){
    const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:spec.dpr});
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.routeWebSocket('**/*',s=>{s.send(JSON.stringify({type:'connected'}));s.onMessage(()=>{});});
    await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
    const view={...spec};report.views.push(view);
    view.canvas=await page.locator('#stage canvas').evaluate(c=>({width:c.width,height:c.height,css:getComputedStyle(c).imageRendering}));
    assert.deepEqual(view.canvas,{width:1920,height:1080,css:'auto'});
    await page.evaluate(()=>{__ECHO__.preset('party');__ECHO__.game.resetSession();});
    const target=await page.evaluate(()=>{const g=__ECHO__.game;return{x:g.state.x+72,y:g.state.y,sx:g.state.x+72-g.camera.x,sy:g.state.y-g.camera.y};});
    const box=await page.locator('#stage canvas').boundingBox();
    await page.mouse.click(box.x+target.sx/960*box.width,box.y+target.sy/540*box.height);
    await page.waitForFunction(()=>!__ECHO__.game.movePath.length);
    view.clickEndpoint=await page.evaluate(target=>{const g=__ECHO__.game;return{distance:Math.hypot(g.state.x-target.x,g.state.y-target.y),x:g.state.x,y:g.state.y};},target);
    assert.ok(view.clickEndpoint.distance<5,'Mouse coordinates must stay in logical world units');
    await page.waitForTimeout(100);
    await page.screenshot({path:reviewRoot + `review-rendering-${spec.width}-world.png`});
    await page.evaluate(()=>__ECHO__.goto('hav_house'));
    await page.waitForTimeout(100);
    await page.screenshot({path:reviewRoot + `review-rendering-${spec.width}-house.png`});
    await page.keyboard.press('Escape');await page.keyboard.press('2');
    view.portrait=await page.locator('.portrait-large').first().evaluate(c=>({width:c.width,height:c.height,css:getComputedStyle(c).imageRendering}));
    assert.deepEqual(view.portrait,{width:192,height:192,css:'auto'});
    await page.screenshot({path:reviewRoot + `review-rendering-${spec.width}-party.png`});
    await page.evaluate(()=>__ECHO__.preset('battle'));
    await page.waitForFunction(()=>__ECHO__.snapshot().battle?.selectedHero==='kaida');
    const click=async(x,y)=>{const b=await page.locator('#stage canvas').boundingBox();await page.mouse.click(b.x+x/960*b.width,b.y+y/540*b.height);};
    await click(375,419);assert.equal(await page.evaluate(()=>__ECHO__.snapshot().battle.mode),'target');
    await click(710,286);await click(625,478);
    assert.equal(await page.evaluate(()=>__ECHO__.snapshot().battle.mode),'action');
    await page.waitForFunction(()=>__ECHO__.snapshot().battle.action?.resolved);
    view.battleMouse=await page.evaluate(()=>{const b=__ECHO__.snapshot().battle;return{resolved:b.action.resolved,targetHp:b.enemies[0].hp,targetMaxHp:b.enemies[0].maxHp};});
    assert.ok(view.battleMouse.targetHp<view.battleMouse.targetMaxHp);
    await page.screenshot({path:reviewRoot + `review-rendering-${spec.width}-battle.png`});
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(reviewRoot + 'review-rendering.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
