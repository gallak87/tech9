import {reviewRoot} from '../scripts/review-output.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const earned=JSON.parse(await fs.readFile(reviewRoot + 'earned-campaign-saves.json','utf8')).saves['battle-void_architect'];
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report={method:'Unmodified earned level38 battle-void_architect state loaded through production persistence. Actual keyboard chooses a basic attack; exact production updates sample contact. Canvas text measurements observe production fillText calls without changing their content, font or coordinates.',errors:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
try{
 await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
 await page.evaluate(async state=>{const g=__ECHO__.game,{saveState}=await import('/src/persistence.js');saveState(state,1);g.load(1);window.hudAdvance=g.update.bind(g);g.update=()=>{};},earned.state);
 report.party=(await page.evaluate(()=>__ECHO__.snapshot())).battle.heroes;assert.equal(report.party.find(h=>h.id==='rune').maxHp,1132);
 await page.waitForTimeout(40);await page.screenshot({path:reviewRoot + 'hp-hud-earned-crown-idle.png'});
 const mode=await page.evaluate(()=>{const g=__ECHO__.game;let n=0;while((!g.battle.selectedHero||g.battle.action)&&n++<1800)window.hudAdvance(1/60);if(n>=1800)throw Error('No ready hero');return g.battle.mode;});
 if(mode==='waiting')await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await page.evaluate(()=>{const a=__ECHO__.game.battle.action;window.hudAdvance(a.contact+.025-a.elapsed);});
 report.text=await page.evaluate(()=>{
  const g=__ECHO__.game,c=new OffscreenCanvas(960,540).getContext('2d'),original=c.fillText,draws=[];
  c.fillText=function(value,x,y,...rest){const width=this.measureText(String(value)).width,align=this.textAlign;draws.push({value:String(value),x,y,width,font:this.font,left:align==='right'?x-width:align==='center'?x-width/2:x,right:align==='right'?x:align==='center'?x+width/2:x+width});return original.call(this,value,x,y,...rest);};
  try{g.draw(c);}finally{c.fillText=original;}return draws.filter(t=>t.y>=330&&t.y<=400);
 });
 const hp=report.text.find(t=>t.value==='1132/1132'),label=report.text.find(t=>t.value==='HP'&&t.y===hp.y),mp=report.text.find(t=>t.value==='MP 214'&&t.y===hp.y);
 assert.ok(hp&&label&&mp);assert.ok(hp.left-label.right>=5,'HP label and four-digit values have a visible gutter');assert.ok(mp.left-hp.right>=5,'HP and MP fields have a visible gutter');assert.equal(hp.font,'9px monospace');
 report.gutters={labelToValue:hp.left-label.right,hpToMp:mp.left-hp.right};
 report.contact=await page.evaluate(()=>__ECHO__.snapshot().battle);assert.equal(report.contact.action.resolved,true);
 await page.waitForTimeout(40);await page.screenshot({path:reviewRoot + 'hp-hud-earned-crown-contact.png'});assert.deepEqual(report.errors,[]);report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(reviewRoot + 'hp-hud-earned-crown.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,failure:report.failure,errors:report.errors,gutters:report.gutters}));}
