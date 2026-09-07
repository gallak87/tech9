import { chromium } from 'playwright';
import readline from 'node:readline';
const browser=await chromium.launch({headless:false,args:['--window-size=1440,1000']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();globalThis.page=page;globalThis.context=context;globalThis.browser=browser;globalThis.errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message)});
page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE_ERROR',m.text())}});
await page.goto('http://127.0.0.1:5199/?test=1');
console.log('READY: visible Playwright browser on port 5199');
const rl=readline.createInterface({input:process.stdin,terminal:false});
for await(const line of rl){try{const result=await new Function('return (async()=>{'+line+'})()')();console.log('RESULT',JSON.stringify(result));}catch(e){console.log('COMMAND_ERROR',e.stack);}}
await browser.close();
