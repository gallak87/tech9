import {reviewURL} from '../scripts/review-output.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {createState,recruit,build,stats} from '../src/progression.js';
import {ALL_SCENES,isWalkable} from '../src/world.js';
import {mainObjective} from '../src/narrative.js';
import {TIERS} from '../src/content.js';
import {SAVE_PREFIX,SAVE_GAME,MAX_SAVE_BYTES} from '../src/persistence.js';

// Production browser regression. Only the initial localStorage fixtures are staged;
// transfer, confirmation, navigation, download and load use normal game controls.
// Two local origins model separate hosted/local storage without contacting a deployment.
const output=reviewURL('save-transfer/');
await fs.mkdir(output,{recursive:true});
const originA=new URL(process.env.ECHO_SAVE_URL||'http://127.0.0.1:4336/');
const originB=new URL(process.env.ECHO_SAVE_OTHER_URL||originA.href);
if(!process.env.ECHO_SAVE_OTHER_URL)originB.hostname=originA.hostname==='localhost'?'127.0.0.1':'localhost';
assert.notEqual(originA.origin,originB.origin,'Portability requires genuinely separate storage origins');
const report={method:'Production game; two local origins, real downloads/file uploads, ordinary menu controls.',origins:[originA.origin,originB.origin],checks:[],errors:[]};
const clone=o=>JSON.parse(JSON.stringify(o));
const record=(state,savedAt)=>({game:SAVE_GAME,version:1,savedAt,state});
const rich=createState();rich.tier=3;rich.heroes[0].level=12;
Object.assign(rich.flags,{haventide_liberated:true,emberline_liberated:true,beacon_restored:true});rich.cleared.hav_guard=true;
rich.resources={food:1200,ore:2400,energy:800,renown:240};
assert.equal(recruit(rich,'vex').ok,true);assert.equal(recruit(rich,'rune').ok,true);
for(const id of ['farm','forge','research_lab'])assert.equal(build(rich,id).ok,true);
rich.heroes[1].level=10;rich.heroes[2].level=9;
rich.heroes.forEach((h,i)=>{const s=stats(h,rich);h.hp=s.maxHp-20-i*7;h.mp=s.maxMp-3-i;});
rich.region='emberline_town';Object.assign(rich,ALL_SCENES[rich.region].spawn);assert.ok(isWalkable(ALL_SCENES[rich.region],rich.x,rich.y));
rich.playTime=7325.5;rich.inventory.field_tonic=17;rich.inventory.ether_cell=9;
rich.quests.portability={stage:2,claimed:false};rich.pickups.ember_food=true;
rich.visited={haventide:true,emberline:true,emberline_town:true};rich.fog.haventide={};
for(let y=0;y<15;y++)for(let x=0;x<20;x++)rich.fog.haventide[`${x},${y}`]=1;
rich.settings={...rich.settings,music:0,sfx:0,timingAssist:true,reducedMotion:true,keys:{up:'i'}};
const earlier=createState();earlier.heroes[0].level=7;earlier.heroes[0].hp=99;earlier.heroes[0].mp=20;earlier.playTime=145;earlier.campaignComplete=true;
earlier.settings.music=0;earlier.settings.sfx=0;
const destination=createState();destination.heroes[0].level=2;destination.resources.ore=457;destination.settings.music=0;destination.settings.sfx=0;
const occupied=clone(destination);occupied.heroes[0].level=4;occupied.playTime=333;
const sourceRecord=record(rich,'2026-09-17T20:00:00.000Z'),manualRecord=record(earlier,'2026-09-16T12:30:00.000Z');
const slots=['checkpoint','1','2','3'];
const sourceRows={checkpoint:JSON.stringify(sourceRecord),1:JSON.stringify(manualRecord),2:'{broken record'};
const destRows={checkpoint:JSON.stringify(record(destination,'2026-09-17T21:00:00.000Z')),1:JSON.stringify(record(occupied,'2026-09-15T10:00:00.000Z'))};
const row=(page,slot)=>page.locator(`[data-save-slot="${slot}"]`);
const button=(page,action)=>page.locator(`[data-do="${action}"]`);
const snapshot=page=>page.evaluate(prefix=>Object.fromEntries(['checkpoint','1','2','3'].map(slot=>[slot,localStorage.getItem(prefix+':'+slot)])),SAVE_PREFIX);
const stored=async(page,slot)=>JSON.parse((await snapshot(page))[slot]);
const active=page=>page.evaluate(()=>document.activeElement?.dataset.do||null);
const onlyTargetChanged=(before,after,target)=>{for(const slot of slots)if(slot!==String(target))assert.equal(after[slot],before[slot],`Unrelated slot ${slot} changed`);assert.notEqual(after[target],before[target],`Target ${target} did not change`);};
const waitNotice=(page,text)=>page.waitForFunction(text=>document.querySelector('.notice')?.textContent.includes(text),text);
const mark=(name,details={})=>{report.checks.push({name,...details});console.log('PASS '+name);};
let stage='boot',browser,pageA,pageB;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||'chrome'});
 const boot=async(origin,rows)=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addInitScript(({prefix,rows})=>{if(localStorage.getItem('save-transfer-fixture'))return;localStorage.clear();for(const [slot,raw]of Object.entries(rows))localStorage.setItem(prefix+':'+slot,raw);localStorage.setItem('save-transfer-fixture','1');},{prefix:SAVE_PREFIX,rows});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({origin:origin.origin,error:String(e)}));
  page.on('console',m=>{if(m.type()==='error')report.errors.push({origin:origin.origin,error:m.text()});});
  page.on('response',r=>{if(new URL(r.url()).origin===origin.origin&&r.status()>=400)report.errors.push({origin:origin.origin,error:`${r.status()} ${new URL(r.url()).pathname}`});});
  await page.goto(origin.href);await page.waitForFunction(()=>window.__ECHO_READY__);
  assert.equal(await page.evaluate(()=>typeof window.__ECHO__),'undefined','Must exercise production without dev game hooks');
  await button(page,'continue').click();await page.locator('.hero-compact').first().waitFor();
  await page.keyboard.press('Escape');await page.keyboard.press('6');await row(page,'checkpoint').waitFor();return page;
 };
 const upload=async(page,slot,file)=>{const previous=await page.locator('.expedition').elementHandle(),chooser=page.waitForEvent('filechooser');await button(page,'import-save:'+slot).click();await(await chooser).setFiles(file);await page.waitForFunction(node=>!node.isConnected,previous);await previous.dispose();};
 const download=async(page,slot,name)=>{
  const pending=page.waitForEvent('download');await button(page,'export-save:'+slot).click();const result=await pending;
  assert.match(result.suggestedFilename(),/chronforge-echo-.*\.json$/);assert.equal(await result.failure(),null);
  const path=new URL(name,output).pathname;await result.saveAs(path);const text=await fs.readFile(path,'utf8');return {path,text,record:JSON.parse(text)};
 };
 const confirm=async page=>{await button(page,'confirm-yes').focus();await page.keyboard.press('Enter');};
 const savedMetadata=async(page,slot,state)=>{
  const r=row(page,slot);assert.equal(await r.getAttribute('data-save-state'),'saved');
  const summary=(await r.locator('.exp-save-meta').innerText()).replace(/\s+/g,' ');
  assert.ok(summary.includes(ALL_SCENES[state.region].name),summary);assert.ok(summary.includes(TIERS[state.tier-1]),summary);assert.match(summary,/Explored \d+(\.\d+)?%/);
  assert.equal(await r.locator('.exp-save-objective').innerText(),mainObjective(state));
  const heroes=r.locator('.exp-save-party li');assert.equal(await heroes.count(),state.heroes.length);
  for(let i=0;i<state.heroes.length;i++){const h=state.heroes[i],st=stats(h,state),text=(await heroes.nth(i).innerText()).replace(/\s+/g,' ');assert.ok(text.includes(`${h.name} LV ${h.level}`),text);assert.ok(text.includes(`HP ${h.hp.toLocaleString()} / ${st.maxHp.toLocaleString()}`),text);assert.ok(text.includes(`MP ${h.mp.toLocaleString()} / ${st.maxMp.toLocaleString()}`),text);}
 };
 stage='source saved metadata and controls';pageA=await boot(originA,sourceRows);
 assert.equal(await pageA.locator('[data-save-slot]').count(),4);
 await savedMetadata(pageA,'checkpoint',rich);await savedMetadata(pageA,'1',earlier);
 assert.match(await row(pageA,'checkpoint').innerText(),/2h 2m/);assert.match(await row(pageA,'1').innerText(),/Campaign complete/);
 assert.equal(await button(pageA,'save:checkpoint').count(),0);
 for(const slot of ['2','3']){assert.equal(await button(pageA,'export-save:'+slot).isDisabled(),true);assert.equal(await button(pageA,'load:'+slot).isDisabled(),true);assert.equal(await button(pageA,'import-save:'+slot).isEnabled(),true);}
 assert.equal(await row(pageA,'2').getAttribute('data-save-state'),'corrupt');assert.equal(await row(pageA,'3').getAttribute('data-save-state'),'empty');
 await pageA.screenshot({path:new URL('desktop.png',output).pathname,fullPage:true});
 mark(stage,{autosaveParty:rich.heroes.map(h=>h.name),manualParty:earlier.heroes.map(h=>h.name)});
 stage='actual saved-file downloads are read-only';const beforeExport=await snapshot(pageA);
 const portable=await download(pageA,'checkpoint','autosave-export.json'),manual=await download(pageA,'1','manual-export.json');
 assert.equal(portable.record.game,SAVE_GAME);assert.deepEqual(portable.record.state,rich);assert.equal(portable.record.savedAt,sourceRecord.savedAt);assert.deepEqual(manual.record.state,earlier);assert.deepEqual(await snapshot(pageA),beforeExport);
 mark(stage,{bytes:Buffer.byteLength(portable.text)});await pageA.context().close();pageA=null;
 stage='cross-origin empty-slot import';pageB=await boot(originB,destRows);const beforeImport=await snapshot(pageB);
 await upload(pageB,'3',portable.path);await button(pageB,'confirm-no').waitFor();assert.equal(await active(pageB),'confirm-no');assert.equal(await pageB.locator('[data-load-after-import]').isChecked(),false);assert.deepEqual(await snapshot(pageB),beforeImport,'Even an empty row waits for confirmation');await confirm(pageB);await waitNotice(pageB,'Imported into Field record 03');
 const afterImport=await snapshot(pageB);onlyTargetChanged(beforeImport,afterImport,'3');assert.deepEqual((await stored(pageB,'3')).state,rich);assert.equal((await stored(pageB,'3')).savedAt,sourceRecord.savedAt);assert.equal(await pageB.locator('.modal').count(),0);
 await savedMetadata(pageB,'3',rich);assert.equal(await active(pageB),'load:3');
 await pageB.keyboard.press('2');assert.equal(await pageB.locator('.exp-crew-choice').count(),1);assert.match(await pageB.locator('.exp-crew-choice').innerText(),/Kaida.*LV 2/s);await pageB.keyboard.press('6');
 mark(stage,{savedStatePreserved:true,liveExpeditionUnchanged:true});
 stage='occupied-slot import cancellation';const beforeOverwrite=await snapshot(pageB);
 await upload(pageB,'1',manual.path);await button(pageB,'confirm-no').waitFor();assert.equal(await active(pageB),'confirm-no');assert.equal(await pageB.locator('[data-load-after-import]').isChecked(),false);assert.deepEqual(await snapshot(pageB),beforeOverwrite);
 assert.match(await pageB.locator('.modal h2').innerText(),/Replace Field record 01/);
 await pageB.keyboard.press('Enter');await row(pageB,'1').waitFor();assert.deepEqual(await snapshot(pageB),beforeOverwrite);assert.equal(await active(pageB),'import-save:1');
 await upload(pageB,'1',manual.path);await button(pageB,'confirm-no').waitFor();await pageB.keyboard.press('Escape');await row(pageB,'1').waitFor();assert.deepEqual(await snapshot(pageB),beforeOverwrite);assert.equal(await active(pageB),'import-save:1');
 mark(stage);
 stage='occupied-slot import explicit confirmation';await upload(pageB,'1',manual.path);await button(pageB,'confirm-yes').waitFor();await confirm(pageB);await waitNotice(pageB,'Imported into Field record 01');
 onlyTargetChanged(beforeOverwrite,await snapshot(pageB),'1');assert.deepEqual((await stored(pageB,'1')).state,earlier);assert.deepEqual((await stored(pageB,'3')).state,rich);mark(stage);
 stage='invalid file rejection without slot mutation';
 const foreign={...portable.record,game:'another-game'},newer={...portable.record,version:999},nested=clone(portable.record);nested.state.resources.ore=-1;
 const invalid=[['empty',''],['malformed','{not json'],['foreign',JSON.stringify(foreign)],['newer',JSON.stringify(newer)],['invalid-state',JSON.stringify(nested)],['oversize',' '.repeat(MAX_SAVE_BYTES+1)]];
 for(const [name,text]of invalid){
  const before=await snapshot(pageB);await upload(pageB,'2',{name:name+'.json',mimeType:'application/json',buffer:Buffer.from(text)});await waitNotice(pageB,'Could not import:');
  assert.deepEqual(await snapshot(pageB),before,name+' mutated saves');assert.equal(await row(pageB,'2').getAttribute('data-save-state'),'empty');assert.equal(await pageB.locator('.modal').count(),0);assert.equal(await active(pageB),'import-save:2');
  report.checks.push({name:'reject '+name,message:await pageB.locator('.notice').innerText()});
 }
 const beforeBadOccupied=await snapshot(pageB);await upload(pageB,'1',{name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await waitNotice(pageB,'Could not import:');assert.deepEqual(await snapshot(pageB),beforeBadOccupied);mark(stage,{cases:invalid.map(([name])=>name),alsoProtectsOccupied:true});
 stage='leaving Save cancels delayed file reads';
 for(const route of ['another page','close menu']){
  const before=await snapshot(pageB);
  await pageB.evaluate(()=>{window.__saveOriginalFileText=File.prototype.text;window.__saveFileTextOwn=Object.hasOwn(File.prototype,'text');File.prototype.text=function(){return new Promise((resolve,reject)=>{window.__releaseSaveRead=async()=>{try{resolve(await window.__saveOriginalFileText.call(this));}catch(error){reject(error);}};});};});
  try{
   const chooser=pageB.waitForEvent('filechooser');await button(pageB,'import-save:2').click();await(await chooser).setFiles(portable.path);await pageB.waitForFunction(()=>typeof window.__releaseSaveRead==='function');
   if(route==='another page'){await pageB.keyboard.press('5');await pageB.keyboard.press('6');}else{await pageB.keyboard.press('Escape');await pageB.keyboard.press('Escape');await pageB.keyboard.press('6');}
   await row(pageB,'2').waitFor();await pageB.evaluate(async()=>{await window.__releaseSaveRead();await new Promise(resolve=>setTimeout(resolve,50));});
   assert.deepEqual(await snapshot(pageB),before,route+' allowed a stale import');assert.equal(await row(pageB,'2').getAttribute('data-save-state'),'empty');assert.equal(await pageB.locator('.modal').count(),0);
  }finally{await pageB.evaluate(()=>{if(window.__saveFileTextOwn)File.prototype.text=window.__saveOriginalFileText;else delete File.prototype.text;delete window.__saveOriginalFileText;delete window.__saveFileTextOwn;delete window.__releaseSaveRead;});}
 }
 mark(stage,{routes:['another page','close menu']});
 stage='manual-save storage failure is not reported as success';const beforeQuota=await snapshot(pageB);
 await pageB.evaluate(prefix=>{window.__saveTransferSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===prefix+':2')throw new DOMException('Simulated full storage','QuotaExceededError');return window.__saveTransferSetItem.call(this,key,value);};},SAVE_PREFIX);
 try{await button(pageB,'save:2').click();await waitNotice(pageB,'Could not save:');assert.doesNotMatch(await pageB.locator('.notice').innerText(),/Expedition recorded/);assert.deepEqual(await snapshot(pageB),beforeQuota);}finally{await pageB.evaluate(()=>{Storage.prototype.setItem=window.__saveTransferSetItem;delete window.__saveTransferSetItem;});}
 mark(stage);
 stage='normal manual save and erase preserve other rows';await button(pageB,'save:2').click();await waitNotice(pageB,'Expedition recorded');const withManual=await snapshot(pageB);onlyTargetChanged(beforeQuota,withManual,'2');assert.equal((await stored(pageB,'2')).state.region,destination.region);assert.equal((await stored(pageB,'2')).state.heroes.length,1);
 await button(pageB,'delete:2').click();await button(pageB,'confirm-no').waitFor();await pageB.keyboard.press('Escape');assert.deepEqual(await snapshot(pageB),withManual);
 await button(pageB,'delete:2').click();await button(pageB,'confirm-yes').waitFor();await confirm(pageB);await waitNotice(pageB,'Record erased');onlyTargetChanged(withManual,await snapshot(pageB),'2');assert.equal((await snapshot(pageB))['2'],null);mark(stage);
 stage='keyboard rows and empty-slot action skipping';await button(pageB,'import-save:checkpoint').focus();
 for(const slot of ['1','2','3']){await pageB.keyboard.press('ArrowDown');assert.equal(await active(pageB),'import-save:'+slot);}
 for(const slot of ['2','1','checkpoint']){await pageB.keyboard.press('ArrowUp');assert.equal(await active(pageB),'import-save:'+slot);}
 await button(pageB,'import-save:2').focus();await pageB.keyboard.press('ArrowLeft');assert.equal(await active(pageB),'save:2');await pageB.keyboard.press('ArrowRight');assert.equal(await active(pageB),'import-save:2');await pageB.keyboard.press('ArrowRight');assert.equal(await active(pageB),'import-save:2','Must skip disabled Load/Export');await pageB.keyboard.press('Tab');assert.equal(await active(pageB),'save:3');mark(stage);
 stage='narrow layout and keyboard reachability';await pageB.setViewportSize({width:760,height:900});
 await button(pageB,'import-save:checkpoint').focus();await pageB.keyboard.press('ArrowDown');assert.equal(await active(pageB),'import-save:1');
 for(const slot of slots){await button(pageB,'import-save:'+slot).scrollIntoViewIfNeeded();const bounds=await row(pageB,slot).boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=761,`${slot} overflowed narrow viewport`);}
 await row(pageB,'checkpoint').scrollIntoViewIfNeeded();await pageB.screenshot({path:new URL('narrow.png',output).pathname,fullPage:true});mark(stage);
 stage='imported record loads as the live expedition';await pageB.setViewportSize({width:1440,height:1000});await button(pageB,'load:3').click();await button(pageB,'confirm-yes').waitFor();await confirm(pageB);await pageB.waitForFunction(name=>document.querySelector('.location-plaque h3')?.textContent===name,ALL_SCENES[rich.region].name);
 assert.equal(await pageB.locator('.location-plaque h3').innerText(),ALL_SCENES[rich.region].name);assert.equal(await pageB.locator('.hero-compact').count(),3);assert.deepEqual(await pageB.locator('.hero-compact strong').allTextContents(),rich.heroes.map(h=>h.name));
 await pageB.keyboard.press('Escape');await pageB.keyboard.press('2');assert.equal(await pageB.locator('.exp-crew-choice').count(),3);assert.match(await pageB.locator('.exp-crew-choice').first().innerText(),/LV 12/);await pageB.keyboard.press('6');
 const roundtrip=await download(pageB,'3','cross-origin-roundtrip.json');assert.deepEqual(roundtrip.record,portable.record);mark(stage,{exactRoundtrip:true,region:rich.region,party:rich.heroes.map(h=>h.name)});
 stage='import checkbox mouse and keyboard toggles with checked cancellation';const beforeAuto=await snapshot(pageB);
 await upload(pageB,'checkpoint',manual.path);await button(pageB,'confirm-no').waitFor();assert.match(await pageB.locator('.modal').innerText(),/Future automatic checkpoints/);
 const checkbox=pageB.locator('[data-load-after-import]');assert.equal(await checkbox.getAttribute('type'),'checkbox');assert.equal(await checkbox.isChecked(),false);assert.equal(await active(pageB),'confirm-no');
 assert.equal(await pageB.getByLabel('After import, load immediately',{exact:true}).count(),1);
 await checkbox.click();assert.equal(await checkbox.isChecked(),true,'Mouse checks native checkbox');
 await pageB.keyboard.press('Space');assert.equal(await checkbox.isChecked(),false,'Space toggles off without confirming');
 await pageB.keyboard.press('Enter');assert.equal(await checkbox.isChecked(),true,'Enter toggles on without confirming');assert.deepEqual(await snapshot(pageB),beforeAuto);
 await pageB.screenshot({path:new URL('import-confirm.png',output).pathname,fullPage:true});
 await pageB.keyboard.press('Escape');await row(pageB,'checkpoint').waitFor();assert.deepEqual(await snapshot(pageB),beforeAuto);assert.equal(await active(pageB),'import-save:checkpoint');
 await pageB.keyboard.press('2');assert.equal(await pageB.locator('.exp-crew-choice').count(),3,'Checked cancellation leaves current expedition open');await pageB.keyboard.press('6');mark(stage);
 stage='checked occupied autosave import immediately loads without second prompt';
 await upload(pageB,'checkpoint',manual.path);await button(pageB,'confirm-no').waitFor();assert.equal(await checkbox.isChecked(),false,'Checkbox resets for each import');await checkbox.click();await confirm(pageB);
 await pageB.waitForFunction(({name,count})=>!document.querySelector('.expedition')&&!document.querySelector('.modal')&&document.querySelector('.location-plaque h3')?.textContent===name&&document.querySelectorAll('.hero-compact').length===count,{name:ALL_SCENES[earlier.region].name,count:1});
 onlyTargetChanged(beforeAuto,await snapshot(pageB),'checkpoint');assert.deepEqual((await stored(pageB,'checkpoint')).state,earlier);assert.match(await pageB.locator('.hero-compact').innerText(),/Kaida.*LV 7/s);mark(stage,{region:earlier.region,party:['Kaida']});
 stage='checked empty manual import immediately loads without second prompt';
 await pageB.keyboard.press('Escape');await pageB.keyboard.press('6');const beforeImmediate=await snapshot(pageB);assert.equal(beforeImmediate['2'],null);
 await upload(pageB,'2',portable.path);await button(pageB,'confirm-no').waitFor();assert.equal(await checkbox.isChecked(),false);assert.deepEqual(await snapshot(pageB),beforeImmediate);
 await checkbox.focus();await pageB.keyboard.press('Space');assert.equal(await checkbox.isChecked(),true);await confirm(pageB);
 await pageB.waitForFunction(({name,count})=>!document.querySelector('.expedition')&&!document.querySelector('.modal')&&document.querySelector('.location-plaque h3')?.textContent===name&&document.querySelectorAll('.hero-compact').length===count,{name:ALL_SCENES[rich.region].name,count:3});
 onlyTargetChanged(beforeImmediate,await snapshot(pageB),'2');assert.deepEqual((await stored(pageB,'2')).state,rich);assert.deepEqual(await pageB.locator('.hero-compact strong').allTextContents(),rich.heroes.map(h=>h.name));
 await pageB.screenshot({path:new URL('immediate-load.png',output).pathname,fullPage:true});mark(stage,{region:rich.region,party:rich.heroes.map(h=>h.name)});
 assert.deepEqual(report.errors,[]);report.result='passed';
 console.log(JSON.stringify(report,null,2));
}catch(error){report.result='failed';report.failedStage=stage;report.failure=String(error);const page=pageB||pageA;try{await page?.screenshot({path:new URL('failure.png',output).pathname,fullPage:true});}catch{}throw error;
}finally{await fs.writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');await browser?.close();}
