import {chromium} from './browser.mjs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.on('pageerror',e=>console.log('PAGEERROR',e.stack));
page.on('console',msg=>{if(msg.type()==='error')console.log('CONSOLE',msg.text());});
await page.goto('http://127.0.0.1:4179/?dev=1');
await page.waitForFunction(()=>!!window.__dev,{timeout:30000});
await page.screenshot({path:new URL('../evidence/title.png',import.meta.url).pathname});
console.log(JSON.stringify(await page.evaluate(()=>({mode:window.__dev.snapshot().mode,buttons:[...document.querySelectorAll('button')].map(b=>b.textContent),runtimeError:window.__runtimeError})),null,2));
await page.getByRole('button',{name:'New game',exact:true}).click();
for(let i=0;i<20;i++){if(!await page.getByRole('button',{name:'Continue dialogue',exact:true}).count())break;await page.getByRole('button',{name:'Continue dialogue',exact:true}).click();}
await page.screenshot({path:new URL('../evidence/haventide.png',import.meta.url).pathname});
console.log(JSON.stringify(await page.evaluate(()=>({mode:window.__dev.snapshot().mode,overlay:window.__dev.snapshot().overlay,intro:window.__dev.snapshot().state.flags.intro,runtimeError:window.__runtimeError})),null,2));
await browser.close();
