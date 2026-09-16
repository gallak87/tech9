import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const dir=new URL('./',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
await page.routeWebSocket('**/*',socket=>{socket.send(JSON.stringify({type:'connected'}));socket.onMessage(()=>{});});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:4321/?test=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__ECHO_READY__);
await page.evaluate(()=>window.__ECHO__.preset('settlement'));await page.waitForTimeout(350);
const shots=[];async function capture(id){await page.screenshot({path:dir+id+'.png'});shots.push({id,snapshot:await page.evaluate(()=>window.__ECHO__.snapshot())});}
await capture('critic-final-town-opening');
const approach=await page.evaluate(()=>{const g=window.__ECHO__.game,o=g.scene.objects.find(o=>o.id==='haventide_smith');g.walkTo(o.x,o.y+48);for(let i=0;i<6000&&g.movePath.length;i++)g.update(1/60);return {x:g.state.x,y:g.state.y,object:o,path:g.movePath.length,near:g.near?.id};});
await page.keyboard.down('ArrowUp');await page.waitForTimeout(180);await page.keyboard.up('ArrowUp');await page.waitForTimeout(100);await capture('critic-final-town-smith-field');await page.keyboard.press('f');await page.waitForTimeout(100);await capture('critic-final-town-smith-ui');
await fs.writeFile(dir+'critic-final-town-log.json',JSON.stringify({errors,approach,shots},null,2));await browser.close();console.log(JSON.stringify({errors,approach,shots:shots.map(s=>s.id)}));
