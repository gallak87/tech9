import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const base=new URL('../',import.meta.url).pathname,state=JSON.parse(await fs.readFile(base+'evidence/earned-campaign-saves.json','utf8')).saves['chapter-aftermath'].state;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],report={method:'Actual keyboard input after loading the unmodified earned aftermath save through production persistence.',tabs:[],errors};
page.on('pageerror',e=>errors.push(String(e)));await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
await page.evaluate(async state=>{const {saveState}=await import('/src/persistence.js');saveState(state,1);window.__ECHO__.game.load(1);},state);await page.keyboard.press('Escape');
const sample=()=>page.evaluate(()=>{const b=document.querySelector('.atlas-body');return {top:b.scrollTop,height:b.clientHeight,total:b.scrollHeight,focus:document.activeElement?.outerHTML.slice(0,180)};});
for(const tab of ['2','5']){await page.keyboard.press(tab);const samples=[{key:'initial',...await sample()}];for(const key of ['PageDown','End',...Array(12).fill('ArrowDown')]){await page.keyboard.press(key);await page.waitForTimeout(50);samples.push({key,...await sample()});}report.tabs.push({tab,samples});await page.screenshot({path:base+'evidence/critic-keyboard-scroll-tab-'+tab+'.png'});}
await fs.writeFile(base+'evidence/ui-scroll-critic.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
