import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname,pass=process.env.ALPHA_PASS||'after';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:2300,height:1300}}),errors=[];
const report={method:'Diagnostic rendering of unchanged source atlases through the production loadPixelAtlas mask on alternating dark teal/plum fields. These are import diagnostics, not gameplay screenshots.',pass,cases:[],errors};
page.on('pageerror',e=>errors.push(String(e)));await page.routeWebSocket('**/*',s=>{s.send('{"type":"connected"}');s.onMessage(()=>{});});
try{
 await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
 for(const id of (process.env.ALPHA_IDS?.split(',')||['kaida_showcase','kaida_walk','haventide_civilians','vex','rune','vex_walk','rune_walk','drone_sentinel','mutant_hound','world_interactions'])){
  const info=await page.evaluate(async id=>{const A=await import('/src/assets.js'),entry=A.ASSET_MANIFEST.find(e=>e.id===id);if(!entry)return null;const image=await A.loadPixelAtlas(entry);let cv=document.querySelector('#alpha-review');if(!cv){cv=document.createElement('canvas');cv.id='alpha-review';cv.style.cssText='position:fixed;left:0;top:0;z-index:9999';document.body.append(cv);}cv.width=image.width;cv.height=image.height+36;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#14262c';c.fillRect(0,0,cv.width,cv.height);for(let y=0;y<entry.rows;y++)for(let x=0;x<entry.columns;x++){c.fillStyle=(x+y)%2?'#542442':'#143b40';c.fillRect(x*image.width/entry.columns,36+y*image.height/entry.rows,image.width/entry.columns,image.height/entry.rows);}c.drawImage(image,0,36);c.fillStyle='#eee6d4';c.font='18px monospace';c.fillText(id+' • production import alpha diagnostic',12,25);return {id,width:cv.width,height:cv.height,source:entry.url,key:entry.key,seeds:entry.backgroundSeeds?.length||0};},id);
  if(!info)continue;
  const checks=await page.evaluate(async id=>{
    const {ASSET_MANIFEST,loadPixelAtlas}=await import('/src/assets.js'),e=ASSET_MANIFEST.find(e=>e.id===id),cv=await loadPixelAtlas(e),c=cv.getContext('2d'),out=c.getImageData(0,0,cv.width,cv.height).data;
    const original=new Image();original.src='/'+e.url;await original.decode();const source=document.createElement('canvas');source.width=cv.width;source.height=cv.height;source.getContext('2d').drawImage(original,0,0);const raw=source.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    const retained={kaida_showcase:[[149,289],[509,291],[896,277],[524,465],[1166,43],[1025,682],[2099,619],[1220,125]],kaida_walk:[[193,292],[544,295],[904,295],[1294,292],[1259,618]],haventide_civilians:[[487,173],[975,173],[1612,401],[1622,419]],vex:[[203,85],[553,86],[1660,425]],vex_walk:[[589,83],[969,70],[946,438]],rune:[[235,187]],rune_walk:[],haventide_interior:[[1509,668],[1519,641],[1501,577]]}[id]||[];
    const at=(pixels,p)=>Array.from(pixels.slice((p[1]*cv.width+p[0])*4,(p[1]*cv.width+p[0])*4+4));
    const holes=(e.backgroundSeeds||[]).map(point=>({point,alpha:at(out,point)[3],original:at(raw,point)}));
    const bright=retained.map(point=>({point,after:at(out,point),original:at(raw,point)}));
    let changedOpaque=0;if(!e.key)for(let i=0;i<out.length;i++)if(out[i]!==raw[i])changedOpaque++;
    return {holes,bright,unchangedTrueAlpha:!e.key?changedOpaque===0:null};
  },id);
  if(pass!=='before'){for(const h of checks.holes)assert.equal(h.alpha,0,id+' measured background '+h.point);for(const h of checks.bright)assert.deepEqual(h.after,h.original,id+' bright detail '+h.point);if(checks.unchangedTrueAlpha!==null)assert.equal(checks.unchangedTrueAlpha,true,id+' existing alpha unchanged');}
  info.checks=checks;await page.locator('#alpha-review').screenshot({path:base+`evidence/alpha-${pass}-${id}.png`});report.cases.push(info);
 }
 report.result=errors.length?'fail':'pass';
}catch(e){report.result='fail';report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(base+`evidence/alpha-atlas-${pass}.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
