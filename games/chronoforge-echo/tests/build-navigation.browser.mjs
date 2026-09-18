import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// The dev fixture opens the real settlement panel; all navigation uses keyboard events.
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.ECHO_URL||'http://127.0.0.1:4321/?test=1');
 await page.waitForFunction(()=>window.__ECHO_READY__,{},{timeout:60000});
 await page.evaluate(()=>{__ECHO__.preset('settlement');__ECHO__.interact('haventide_board');});
 const expectFocus=async action=>assert.equal(await page.evaluate(()=>document.activeElement?.dataset.do),action);
 const press=async(key,action)=>{await page.keyboard.press(key);await expectFocus(action);};
 await page.locator('[data-do="build:town_center"]').focus();
 await press('ArrowDown','build:mine');
 await press('ArrowDown','build:barracks');
 await press('ArrowDown','build:research_lab');
 await press('ArrowDown','build:research_lab');
 assert.ok(await page.locator('[data-do="build:research_lab"]').evaluate(el=>{const r=el.getBoundingClientRect(),body=el.closest('.atlas-body').getBoundingClientRect();return r.top>=body.top-1&&r.bottom<=body.bottom+1;}),'Focused row should scroll into view');
 await press('ArrowRight','build:walls');
 await press('ArrowRight','build:walls');
 await press('ArrowUp','build:forge');
 await press('ArrowUp','build:energy_extractor');
 await press('ArrowUp','build:farm');
 await press('ArrowLeft','build:town_center');
 await press('ArrowUp','close');
 await press('ArrowDown','build:town_center');
 await press('Tab','build:farm');
 await press('Tab','build:mine');
 await page.evaluate(()=>{const g=__ECHO__.game;g.state.buildings.mine=4;g.ui.render();});
 await page.locator('[data-do="build:town_center"]').focus();
 await press('ArrowDown','build:barracks');
 await press('ArrowUp','build:town_center');
 assert.deepEqual(errors,[]);
 console.log('PASS: settlement columns, row boundaries, disabled entries, sequential Tab, header return, and scrolling.');
}finally{await browser.close();}
