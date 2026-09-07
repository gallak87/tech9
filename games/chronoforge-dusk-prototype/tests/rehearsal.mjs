// Opens only Playwright's managed browser and leaves the rehearsal for the player.
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:false,args:['--window-size=1440,1000']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));
await page.goto('http://127.0.0.1:5200/?battle=1&test=1');
await page.waitForFunction(()=>window.__dusk?.game.state.mode==='battle');
await page.evaluate(()=>{__dusk.game.state.settings.quality='medium';__dusk.world.setQuality('medium');});
await page.waitForTimeout(2200);
await page.screenshot({path:'tests/artifacts/atb-rehearsal.png'});
console.log('ATB REHEARSAL READY',await page.evaluate(()=>({mode:__dusk.game.state.mode,heroes:__dusk.game.state.party.map(h=>({name:h.name,atb:h.atb,hp:h.hp,mp:h.mp})),combos:__dusk.game.getCombos().map(c=>({name:c.name,available:c.available})),assetStatus:__dusk.world.assetStatus})));
console.log('Visible Playwright browser left open for player input.');
await new Promise(resolve=>browser.on('disconnected',resolve));
