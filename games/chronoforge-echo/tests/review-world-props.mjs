import {reviewRoot} from '../scripts/review-output.mjs';
import {chromium} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Users/g/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:810},recordVideo:{dir:reviewRoot + 'world-prop-motion',size:{width:1440,height:810}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4321/?test=1');await page.waitForFunction(()=>window.__ECHO_READY__);
await page.evaluate(()=>{const g=__ECHO__.game;g._realUpdate=g.update.bind(g);g.update=()=>{};__ECHO__.preset('opening');});
const rows=[];
async function stage(scene,id,name,time=0){
 const info=await page.evaluate(({scene,id,time})=>{__ECHO__.goto(scene);const g=__ECHO__.game,o=g.scene.objects.find(o=>o.id===id);if(!o)throw Error(id);const p=g.safePoint(g.scene,o.x+95,o.y+80);Object.assign(g.state,p);g.visualTime=time;g.resetFollowers();g.updateCamera(true);g.near=null;g.ui.render();return {object:{id:o.id,x:o.x,y:o.y,type:o.type,item:o.item},player:p,camera:{...g.camera}};},{scene,id,time});
 await page.waitForTimeout(150);await page.screenshot({path:reviewRoot + `polish-${name}.png`});rows.push({name,...info});return info;
}
await stage('haventide','hav_beacon','signal-console');
await stage('haventide','hav_plot_walls','unfinished-foundation');
await stage('hav_house','hav_house_food','supply-bag',.9);
await page.evaluate(()=>__ECHO__.interact('hav_house_food'));const collected=await page.evaluate(()=>!!__ECHO__.game.state.pickups.hav_house_food);if(!collected)throw Error('Pickup did not remain usable');
await stage('hav_cave','hav_cave_supply','salvage-crate',.9);
await stage('frost_canyon','frost_plate_cache','treasure-chest',.9);
await stage('haventide','hav_camp','rest-lantern-0',0);
for(const [i,t]of [[1,.4],[2,.75]]){await page.evaluate(t=>__ECHO__.game.visualTime=t,t);await page.waitForTimeout(100);await page.screenshot({path:reviewRoot + `polish-rest-lantern-${i}.png`});}
await page.evaluate(()=>{const g=__ECHO__.game;g.visualTime=0;g.update=g._realUpdate;});await page.waitForTimeout(4300);
await page.evaluate(()=>{const g=__ECHO__.game;g.update=()=>{};g.state.settings.reducedMotion=true;});
await stage('haventide','hav_camp','rest-lantern-reduced-motion',.75);
const diagnostics=await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(x=>x.name).find(n=>/\/src\/art\.js/.test(n));const A=await import(url);const scene=__ECHO__.game.scene,birds=A.worldBirds(scene,1),camA={x:300,y:950},camB={x:473,y:1027};const cameraDelta=birds.map(b=>({world:{...b},delta:{x:(b.x-camB.x)-(b.x-camA.x),y:(b.y-camB.y)-(b.y-camA.y)}}));return {snapshot:__ECHO__.snapshot(),cameraDelta};});
if(diagnostics.cameraDelta.some(b=>b.delta.x!==-173||b.delta.y!==-77))throw Error('Bird paths depend on camera');
const video=page.video();await context.close();await video.saveAs(reviewRoot + 'world-props-lantern-motion.webm');await browser.close();
await fs.writeFile(reviewRoot + 'world-props-review.json',JSON.stringify({rows,collected,errors,diagnostics},null,2));
if(errors.length||diagnostics.snapshot.errors.length)throw Error('Runtime errors');console.log(JSON.stringify({captures:rows.length+3,collected,errors,metrics:diagnostics.snapshot.artMetrics,video:reviewRoot + 'world-props-lantern-motion.webm'},null,2));
