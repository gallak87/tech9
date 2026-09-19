import {reviewURL} from '../scripts/review-output.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createState,recruit} from '../src/progression.js';
import {ALL_SCENES,isWalkable,nearby} from '../src/world.js';
import {ITEMS} from '../src/content.js';

// One local production shop pass: a staged, stocked party then real keyboard input.
const state=createState();recruit(state,'vex');recruit(state,'rune');
state.region='emberline_town';state.tier=4;state.heroes.forEach(h=>h.level=20);
state.flags.emberline_liberated=true;state.flags.mara_trade_route=true;
state.buildings.forge=1;state.resources.ore=1000;
state.inventory=Object.fromEntries(Object.keys(ITEMS).map(id=>[id,2]));
state.settings.music=0;state.settings.sfx=0;
const scene=ALL_SCENES[state.region],vendor=scene.objects.find(o=>o.id==='emberline_artificer');
const spot=[[0,48],[40,20],[-45,20],[55,0]].map(([dx,dy])=>({x:vendor.x+dx,y:vendor.y+dy})).find(p=>isWalkable(scene,p.x,p.y)&&nearby(scene,p.x,p.y,state)[0]?.id===vendor.id);
assert.ok(spot);Object.assign(state,spot);
const output=reviewURL('vendor-grid/');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.ECHO_VENDOR_URL||'http://127.0.0.1:4336/');
 await page.evaluate(s=>{localStorage.clear();localStorage.setItem('chronforge_echo_v1:checkpoint',JSON.stringify({version:1,savedAt:new Date().toISOString(),state:s}));},state);
 await page.reload();await page.waitForFunction(()=>window.__ECHO_READY__);
 assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined');
 await page.keyboard.press('Enter');await page.locator(`[data-object="${vendor.id}"]`).waitFor();await page.keyboard.press('f');
 await page.locator('[data-shop-navigation]').waitFor();
 assert.equal(await page.locator('[data-atlas]').count(),0,'No menu shortcut remains behind the vendor');
 const focus=()=>page.evaluate(()=>document.activeElement?.dataset.do),key=k=>page.keyboard.press(k);
 const expect=async(k,id)=>{await key(k);assert.equal(await focus(),id);};
 await page.locator('[data-do="trade-mode"]').focus();
 await expect('ArrowRight','qty:down');await expect('ArrowRight','qty:up');
 await key('ArrowDown');assert.ok(await page.locator('.shop-heroes :focus').count(),'Down enters the next visual row instead of walking toolbar controls');
 await expect('ArrowUp','qty:up');
 await page.locator('[data-do="hero:0"]').focus();await expect('ArrowRight','hero:1');await key('Enter');
 assert.equal(await page.locator('.shop-heroes [aria-pressed="true"]').textContent(),'Vex');
 assert.match(await page.locator('[data-do="buy:iron_blade"] .shop-comparison').textContent(),/vs Vex/);
 await key('ArrowDown');assert.equal(await focus(),'buy:iron_blade');
 const weapons=await page.locator('[data-shop-type="weapon"] .shop-card').evaluateAll(cards=>cards.map(c=>c.dataset.do));
 assert.ok(weapons.length>6);
 await expect('ArrowRight',weapons[1]);await expect('ArrowRight',weapons[2]);await expect('ArrowRight',weapons[2]);
 await expect('ArrowDown',weapons[5]);await expect('ArrowUp',weapons[2]);
 await expect('ArrowLeft',weapons[1]);await expect('ArrowDown',weapons[4]);
 const sections=new Set(['weapon']);
 for(let n=0;n<35&&await focus()!=='close';n++){
  await key('ArrowDown');const type=await page.evaluate(()=>document.activeElement?.closest('[data-shop-type]')?.dataset.shopType);if(type)sections.add(type);
 }
 assert.deepEqual([...sections],['weapon','armor','accessory'],'Down reaches every stock section');assert.equal(await focus(),'close');
 await key('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-shop-type]').dataset.shopType),'accessory');
 await page.locator('[data-do="qty:up"]').click();await page.locator('[data-do="qty:up"]').click();
 const iron=page.locator('[data-do="buy:iron_blade"]');
 assert.equal(await iron.locator('.shop-card-action strong').textContent(),'62 ore','Discount total rounds after multiplying the quantity');
 await iron.focus();await key('Enter');await page.locator('.purchase-confirm').waitFor();
 assert.equal(await page.locator('.purchase-cost strong').textContent(),'62 ore');await key('Escape');
 assert.equal(await focus(),'buy:iron_blade');assert.equal(await iron.locator('.shop-owned').textContent(),'Own 2');
 await key('Enter');await page.locator('.purchase-confirm').waitFor();await key('Enter');
 assert.equal(await iron.locator('.shop-owned').textContent(),'Own 5');assert.equal(await page.locator('.shop-balance').textContent(),'938 ore available');
 await page.locator('[data-do="hero:0"]').click();await page.locator('.atlas-body').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:new URL('shop.png',output).pathname});
 await page.locator('[data-do="trade-mode"]').click();
 assert.deepEqual(await page.locator('[data-shop-type]').evaluateAll(s=>s.map(el=>el.dataset.shopType)),['weapon','armor','accessory','consumable']);
 assert.equal(await page.locator('[data-do="sell:mara_compass"]').isDisabled(),true);
 await page.locator('[data-do="sell:iron_blade"]').focus();const saleSections=new Set(['weapon']);
 for(let n=0;n<35&&await focus()!=='close';n++){
  await key('ArrowDown');const type=await page.evaluate(()=>document.activeElement?.closest('[data-shop-type]')?.dataset.shopType);if(type)saleSections.add(type);
 }
 assert.deepEqual([...saleSections],['weapon','armor','accessory','consumable']);
 await page.locator('[data-do="trade-mode"]').focus();await expect('Tab','qty:down');
 await page.setViewportSize({width:900,height:720});await page.locator('.atlas-body').evaluate(el=>el.scrollTop=0);
 assert.equal(await page.locator('.shop-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 const sells=await page.locator('[data-shop-type="weapon"] .shop-card').evaluateAll(cards=>cards.map(c=>c.dataset.do));
 await page.locator(`[data-do="${sells[0]}"]`).focus();await expect('ArrowRight',sells[1]);await expect('ArrowDown',sells[3]);
 await page.locator('.atlas-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:new URL('shop-narrow.png',output).pathname});
 assert.deepEqual(errors,[]);
 const report={method:'Production save + normal F/arrow/Enter/Escape/Tab input',checks:['Toolbar and hero rows','Three-column item navigation and row boundaries','All stock and sale type sections','Selected hero comparisons','Quantity 3 discounted purchase: 62 ore, cancel then confirm','Keepsakes disabled','Sequential Tab','Two-column responsive navigation'],errors};
 await fs.writeFile(new URL('navigation-report.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
