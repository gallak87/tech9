import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).pathname;
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const report = {method:'Explicit enemy/party fixture followed by production ATB simulation. All samples use the normal battle renderer. The contact sheet is separately labelled pose import inspection.',errors:[],samples:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.routeWebSocket('**/*',s=>{s.send(JSON.stringify({type:'connected'}));s.onMessage(()=>{});});
try {
  await page.goto('http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(()=>window.__ECHO_READY__);
  report.assets=await page.evaluate(()=>__ECHO__.snapshot().assets);
  const ids=['mire_hulk','glacier_wolf','ember_golem','frost_revenant','wraith_core','ember_lord'];
  await page.evaluate(async ids=>{
    const Art=await import('/src/art.js');const {loadAssets}=await import('/src/assets.js');await loadAssets(Art);
    const cv=document.createElement('canvas');cv.width=1440;cv.height=1080;cv.id='inspection';
    Object.assign(cv.style,{position:'fixed',inset:0,zIndex:99999,width:'1440px',height:'1080px'});document.body.append(cv);
    const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#203b40';c.fillRect(0,0,1440,1080);
    const poses=['idle','anticipate','attack','hurt','down','guard'];
    ids.forEach((id,row)=>poses.forEach((pose,col)=>{const x=col*240+120,y=row*180+153;Art.drawEnemy(c,id,x,y,{pose,time:0,scale:1});c.fillStyle='#e8e1c7';c.font='12px monospace';c.fillText(id+' / '+pose,col*240+6,y+20);}));
  },ids);
  await page.locator('#inspection').screenshot({path:base+'evidence/mid-enemy-pose-inspection.png'});
  await page.evaluate(()=>document.querySelector('#inspection').remove());
  for(const id of process.argv.includes('--poses-only') ? [] : ids){
    await page.evaluate(async id=>{
      const {createBattle}=await import('/src/combat.js');__ECHO__.preset('party');const g=__ECHO__.game;
      g.state.flags.battle_taught=true;g.battle=createBattle(g.state,{id:'art_'+id,biome:id==='mire_hulk'?'forest':id.includes('ember')?'volcanic':id==='wraith_core'?'alien':'snow',enemies:[id],boss:id==='ember_lord'});g.mode='battle';g.ui.render();
      window.artUpdate??=g.update;g.update=()=>{};
    },id);
    await page.waitForTimeout(40);await page.screenshot({path:base+'evidence/mid-'+id+'-idle.png'});
    const action=await page.evaluate(()=>{const g=__ECHO__.game;let ticks=0;while(ticks++<8000){if(g.battle.action?.side==='enemy'||g.battle.action?.participants.some(i=>i.startsWith('enemy_')))return {ticks,name:g.battle.action.command.name,duration:g.battle.action.duration};window.artUpdate.call(g,.01);}return null;});
    assert.ok(action,'Enemy must naturally schedule an action: '+id);
    const frames=[];let last=0;
    for(const t of [0,.18,.42,.65,.78,.92,1.10,1.35]){
      if(t>last)await page.evaluate(dt=>window.artUpdate.call(__ECHO__.game,dt),t-last);
      await page.waitForTimeout(35);const file='mid-'+id+'-'+frames.length+'.png';await page.screenshot({path:base+'evidence/'+file});
      frames.push({t,file,battle:await page.evaluate(()=>__ECHO__.snapshot().battle)});last=t;
    }
    report.samples.push({id,action,frames});
  }
  report.result='pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}
finally{await fs.writeFile(base+'evidence/mid-art'+(process.argv.includes('--poses-only')?'-poses':'')+'.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({result:report.result,error:report.failure,errors:report.errors,samples:report.samples.length}));}
