// Targeted image-generated sprite coverage and runtime checks.
// A short-lived local server and browser are always closed, even on failure.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile, writeFile, mkdir, stat, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser.mjs';
import {ENEMIES, ITEMS} from '../src/data.js';
import {OBJECTS, INTERIORS} from '../src/world.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'evidence');
const manifestFile=path.join(root,'assets/sprites/manifest.json');
const npcs=[...OBJECTS,...Object.values(INTERIORS).flatMap(r=>r.objects||[])].filter(o=>o.type==='npc');
const excludedNPCs=new Set(['mayor','worker']);
const expected={enemies:Object.keys(ENEMIES),items:Object.keys(ITEMS),npcs:[...new Set(npcs.filter(o=>!excludedNPCs.has(o.id)).map(o=>o.id))]};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};

async function serve(){
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}

function pngSize(bytes,file){
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],`${file}: valid PNG signature`);
  assert.equal(bytes.toString('ascii',12,16),'IHDR',`${file}: IHDR header`);
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}

// Instrument the real canvas path without adding test-only behavior to art.js.
// Cached frame canvases inherit provenance from the PNG drawn into them.
function installDrawAudit(){
  const original=CanvasRenderingContext2D.prototype.drawImage;
  const sources=new WeakMap(),records=new Map();
  window.__spriteAudit={phase:'load',records,clear(){records.clear();}};
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    let provenance=[];
    if(typeof source?.src==='string'&&source.src){
      try{provenance=[{file:new URL(source.src,location.href).pathname,crop:args.length===8?args.slice(0,4):[0,0,source.naturalWidth||source.width,source.naturalHeight||source.height]}];}catch{}
    }else provenance=[...(sources.get(source)?.values()||[])];
    if(provenance.length){
      const own=sources.get(this.canvas)||new Map();
      for(const item of provenance)own.set(item.file+'|'+item.crop.join(','),item);
      sources.set(this.canvas,own);
      const canvas=this.canvas.dataset?.spriteProbe||this.canvas.dataset?.itemIcon||(this.canvas.dataset?.portrait?'portrait:'+this.canvas.dataset.portrait:'')||this.canvas.id||'offscreen';
      for(const item of provenance){
        const key=[window.__spriteAudit.phase,canvas,item.file,item.crop.join(',')].join('|');
        const old=records.get(key);
        if(old)old.calls++;
        else records.set(key,{phase:window.__spriteAudit.phase,canvas,...item,calls:1});
      }
    }
    return original.call(this,source,...args);
  };
}

function pixelSummary(ctx,width,height){
  const pixels=ctx.getImageData(0,0,width,height).data;
  let alpha=0,transparent=0,hash=2166136261,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let i=0;i<pixels.length;i+=4){
    const a=pixels[i+3];
    for(let c=0;c<4;c++)hash=Math.imul(hash^pixels[i+c],16777619);
    if(a>16){alpha++;const n=i/4,x=n%width,y=Math.floor(n/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    else transparent++;
  }
  return {paintedPixels:alpha,transparentPixels:transparent,hash:hash>>>0,bounds:alpha?{minX,minY,maxX,maxY}:null};
}

function requiredEntry(manifest,kind,id){
  const entry=manifest[kind]?.[id];
  assert(entry,`${kind}/${id}: catalog entry has generated artwork`);
  assert(manifest.sheets?.[entry.sheet],`${kind}/${id}: sheet ${entry.sheet} exists`);
  return entry;
}

function expectedCell(manifest,kind,id,state='idle',phase=1){
  const entry=manifest[kind][id],sheet=manifest.sheets[entry.sheet];
  let row=entry.row||0,col=entry.col;
  if(kind==='enemies'){row=entry.rows[state]??entry.rows[state==='cast'?'attack':state==='down'?'hurt':'idle'];if(entry.phases&&!['hurt','down','death'].includes(state))row=entry.phases[phase-1];}
  const y=sheet.rowCuts?.[row]??row*sheet.height/sheet.rows;
  const bottom=sheet.rowCuts?.[row+1]??(row+1)*sheet.height/sheet.rows;
  return {file:'/assets/sprites/'+sheet.file,x:col===undefined?0:col*sheet.width/sheet.columns,y,
    w:col===undefined?sheet.width:sheet.width/sheet.columns,h:bottom-y};
}

function isDeclaredCrop(record,cell){
  if(!record.file.endsWith(cell.file)||!record.crop)return false;
  const [x,y,w,h]=record.crop;
  // Alpha trimming may shift a crop inside its declared cell; it must not
  // silently borrow pixels from a neighboring character or item.
  return w>0&&h>0&&x>=cell.x-2&&y>=cell.y-2&&x+w<=cell.x+cell.w+2&&y+h<=cell.y+cell.h+2;
}

async function run(){
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  assert.equal(manifest.version,1,'Supported sprite manifest version');
  for(const [kind,ids]of Object.entries(expected))for(const id of ids)requiredEntry(manifest,kind,id);
  for(const id of ['cache_closed','cache_open'])requiredEntry(manifest,'props',id);
  const sheetChecks=[];
  for(const [key,sheet]of Object.entries(manifest.sheets)){
    assert(Number.isInteger(sheet.columns)&&sheet.columns>0,`${key}: positive column count`);
    assert(Number.isInteger(sheet.rows)&&sheet.rows>0,`${key}: positive row count`);
    const file=path.resolve(path.dirname(manifestFile),sheet.file);
    assert(file.startsWith(path.dirname(manifestFile)+path.sep),`${key}: sheet stays in sprite directory`);
    const size=pngSize(await readFile(file),sheet.file);
    Object.assign(sheet,size);
    if(sheet.rowCuts){assert.equal(sheet.rowCuts.length,sheet.rows+1,`${key}: row cuts include every boundary`);assert.equal(sheet.rowCuts[0],0,`${key}: first row begins at zero`);assert.equal(sheet.rowCuts.at(-1),size.height,`${key}: last row ends at sheet height`);assert(sheet.rowCuts.every((n,i)=>Number.isInteger(n)&&(i===0||n>sheet.rowCuts[i-1])),`${key}: row cuts increase`);}
    sheetChecks.push({key,file:sheet.file,...size,columns:sheet.columns,rows:sheet.rows,...(sheet.rowCuts?{rowCuts:sheet.rowCuts}:{})});
  }
  for(const kind of ['enemies','items','npcs','props'])for(const [id,entry]of Object.entries(manifest[kind]||{})){
    requiredEntry(manifest,kind,id);
    const sheet=manifest.sheets[entry.sheet];
    const rows=kind==='enemies'?Object.values(entry.rows):[entry.row];
    assert(rows.length>0&&rows.every(row=>Number.isInteger(row)&&row>=0&&row<sheet.rows),`${kind}/${id}: row bounds`);
    if(kind==='items'||kind==='props')assert(Number.isInteger(entry.col)&&entry.col>=0&&entry.col<sheet.columns,`${kind}/${id}: column bounds`);
    else assert(Number.isInteger(entry.frames)&&entry.frames>1&&entry.frames<=sheet.columns,`${kind}/${id}: multiple authored frames fit the sheet`);
  }

  let server,browser;
  const errors=[],networkErrors=[];
  try{
    let base=process.env.SPRITE_TEST_URL;
    if(!base){const local=await serve();server=local.server;base=local.url;}
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)networkErrors.push({url:response.url(),status:response.status()});});
    await page.addInitScript(installDrawAudit);
    await page.goto(base.replace(/\/$/,'')+'/?dev=1');
    await page.waitForFunction(()=>!!window.__dev,null,{timeout:30000});
    await mkdir(evidence,{recursive:true});
    const imageChecks=await page.evaluate(async manifest=>{
      const results=[];
      for(const [key,sheet]of Object.entries(manifest.sheets)){
        const img=new Image();img.src='./assets/sprites/'+sheet.file;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
        const data=ctx.getImageData(0,0,img.width,img.height).data;
        let visible=0,transparent=0;for(let i=3;i<data.length;i+=4){if(data[i]>16)visible++;else transparent++;}
        const mapped=new Set();
        for(const kind of ['enemies','npcs','items','props'])for(const entry of Object.values(manifest[kind]||{}))if(entry.sheet===key){
          const rows=kind==='enemies'?[...new Set([...Object.values(entry.rows),...(entry.phases||[])])]:[entry.row];
          for(const row of rows)for(let frame=0;frame<(entry.frames||1);frame++)mapped.add(row+':'+(entry.col??frame));
        }
        const cells=[];
        for(const cell of mapped){
          const [row,col]=cell.split(':').map(Number),x0=Math.floor(col*img.width/sheet.columns),x1=Math.floor((col+1)*img.width/sheet.columns),y0=sheet.rowCuts?.[row]??Math.floor(row*img.height/sheet.rows),y1=sheet.rowCuts?.[row+1]??Math.floor((row+1)*img.height/sheet.rows);
          let painted=0,clear=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(data[(y*img.width+x)*4+3]>16)painted++;else clear++;}
          cells.push({row,col,painted,clear});
        }
        results.push({key,width:img.width,height:img.height,visible,transparent,cells});
      }
      return results;
    },manifest);
    for(const image of imageChecks){assert(image.visible>20,`${image.key}: painted pixels`);assert(image.transparent>image.width*image.height*.015,`${image.key}: transparent separation around sprites`);for(const cell of image.cells){assert(cell.painted>20,`${image.key} ${cell.row}/${cell.col}: mapped source frame is nonempty`);assert(cell.clear>5,`${image.key} ${cell.row}/${cell.col}: mapped frame has transparent surround`);}}

    const renderChecks=await page.evaluate(async({manifest,summarySource})=>{
      const art=await import('./src/art.js');
      const summarize=(0,eval)('('+summarySource+')');
      const required=['drawEnemy','drawNPC','drawItemIcon','drawProp'];
      for(const name of required)if(typeof art[name]!=='function')throw new Error('Missing production sprite export '+name);
      const checks=[],galleries={};
      const makeGallery=(kind,count,cellW,cellH)=>{const c=document.createElement('canvas');c.width=1280;c.height=Math.ceil(count/Math.floor(1280/cellW))*cellH;const ctx=c.getContext('2d');ctx.fillStyle='#28222e';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;return {c,ctx,cellW,cellH,columns:Math.floor(1280/cellW)};};
      for(const kind of ['enemies','npcs','items','props']){
        const entries=Object.entries(manifest[kind]||{}),gallery=makeGallery(kind,entries.length,kind==='enemies'?256:160,kind==='enemies'?220:180);
        let index=0;
        for(const [id,entry]of entries){
          const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
          const states=kind==='enemies'?Object.keys(entry.rows):['idle'];
          for(const state of states){
            const frames=kind==='items'||kind==='props'?1:entry.frames;
            const metrics=[];
            canvas.dataset.spriteProbe=kind+'/'+id+'/'+state;
            window.__spriteAudit.phase='probe';
            for(let frame=0;frame<frames;frame++){
              ctx.clearRect(0,0,256,256);
              // Sample the middle of each production frame at its documented rate.
              const fps=kind==='npcs'?3:state==='idle'?5:10;
              const time=(frame+.1)/fps;
              if(kind==='enemies')art.drawEnemy(ctx,id,state,128,212,1.5,time);
              if(kind==='npcs')art.drawNPC(ctx,id,128,214,1.6,time);
              if(kind==='items')art.drawItemIcon(ctx,id,64,64,128);
              if(kind==='props')art.drawProp(ctx,id,96,160,64);
              metrics.push(summarize(ctx,256,256));
              if(state==='idle'&&frame===0){
                const x=(index%gallery.columns)*gallery.cellW,y=Math.floor(index/gallery.columns)*gallery.cellH;
                const size=kind==='enemies'?220:146;
                gallery.ctx.drawImage(canvas,x+(gallery.cellW-size)/2,y-8,size,size);
                gallery.ctx.fillStyle='#f1dfbf';gallery.ctx.font='13px Georgia';gallery.ctx.textAlign='center';
                gallery.ctx.fillText(id,x+gallery.cellW/2,y+gallery.cellH-15,gallery.cellW-10);
              }
            }
            checks.push({kind,id,state,frames,distinctFrames:new Set(metrics.map(m=>m.hash)).size,minimumPainted:Math.min(...metrics.map(m=>m.paintedPixels)),maximumPainted:Math.max(...metrics.map(m=>m.paintedPixels))});
          }
          index++;
        }
        galleries[kind]=gallery.c.toDataURL('image/png');
      }
      return {checks,galleries,draws:[...window.__spriteAudit.records.values()].filter(r=>r.phase==='probe')};
    },{manifest,summarySource:pixelSummary.toString()});
    for(const check of renderChecks.checks){
      const label=`${check.kind}/${check.id}/${check.state}`;
      assert(check.minimumPainted>20,label+': production renderer paints each frame');
      if(check.frames>1&&check.state!=='down')assert(check.distinctFrames>=2,label+': authored frame changes are visible');
      const sources=renderChecks.draws.filter(r=>r.canvas===label);
      assert(sources.some(r=>isDeclaredCrop(r,expectedCell(manifest,check.kind,check.id,check.state))),label+': production rendering uses its declared generated sheet cell');
    }
    for(const [kind,data]of Object.entries(renderChecks.galleries))await writeFile(path.join(evidence,`sprite-remake-${kind}.png`),Buffer.from(data.split(',')[1],'base64'));

    // Real DOM item rendering: include one of each catalog item in a documented
    // checkpoint, then open Inventory with the player's normal keyboard input.
    await page.evaluate(async()=>{
      __dev.checkpoint('links');const {ITEMS}=await import('./src/data.js'),{addItem}=await import('./src/state.js');
      const s=__dev.snapshot().state;for(const id of Object.keys(ITEMS))if(!s.inventory.some(i=>i.id===id))addItem(s,id);
      __dev.loadState(s);__spriteAudit.clear();__spriteAudit.phase='inventory';
    });
    await page.keyboard.press('3');await page.waitForTimeout(180);
    const inventoryDraws=await page.evaluate(()=>[...__spriteAudit.records.values()]);
    for(const id of expected.items)assert(inventoryDraws.some(r=>r.canvas===id&&isDeclaredCrop(r,expectedCell(manifest,'items',id))),id+': real inventory icon uses generated sheet');
    await page.screenshot({path:path.join(evidence,'sprite-remake-inventory.png')});
    await page.keyboard.press('Escape');

    const worldChecks=[];
    for(const npc of npcs.filter(o=>!excludedNPCs.has(o.id))){
      await page.evaluate(id=>{__dev.near(id);__spriteAudit.clear();__spriteAudit.phase='npc:'+id;},npc.id);
      await page.waitForTimeout(85);
      const draws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'));
      assert(draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'npcs',npc.id))),npc.id+': real world NPC renderer uses declared generated row');
      worldChecks.push(npc.id);
    }
    await page.evaluate(()=>__dev.near('lio'));await page.waitForTimeout(100);
    await page.screenshot({path:path.join(evidence,'sprite-remake-town.png')});

    let ionaPortrait=false;
    if(manifest.npcs.iona){
      await page.evaluate(()=>{__dev.checkpoint('links');__dev.near('keeper_crown_archive');__spriteAudit.clear();__spriteAudit.phase='iona';});
      await page.keyboard.press('c');await page.waitForTimeout(160);
      const draws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='portrait:iona'));
      assert(draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'npcs','iona'))),'Iona: actual narrative dialogue shows the generated portrait');
      await page.screenshot({path:path.join(evidence,'sprite-remake-iona.png')});
      ionaPortrait=true;
    }

    const encounters=[...OBJECTS,...Object.values(INTERIORS).flatMap(r=>r.objects||[])].filter(o=>o.type==='encounter');
    const roaming=OBJECTS.find(o=>o.type==='encounter');assert(roaming,'An overworld encounter exists');
    await page.evaluate(id=>{__dev.checkpoint('links');__dev.near(id);__spriteAudit.clear();__spriteAudit.phase='overworld-encounter';},roaming.id);
    await page.waitForTimeout(100);
    const roamingDraws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'));
    assert(roamingDraws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'enemies',roaming.enemies[0]))),'Overworld encounter uses its generated creature sprite');
    await page.screenshot({path:path.join(evidence,'sprite-remake-overworld-encounter.png')});
    const battleChecks=[];
    for(const id of expected.enemies){
      const encounter=encounters.find(o=>o.enemies?.includes(id));
      assert(encounter,id+': catalog enemy occurs in an actual encounter');
      await page.evaluate(({id,enemy})=>{__dev.checkpoint('finale');__spriteAudit.clear();__spriteAudit.phase='battle:'+enemy;__dev.startBattle(id,{ready:true});},{id:encounter.id,enemy:id});
      await page.waitForTimeout(100);
      const draws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'));
      assert(draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'enemies',id))),id+': actual battle renderer uses generated artwork');
      battleChecks.push(id);
    }
    await page.screenshot({path:path.join(evidence,'sprite-remake-battle.png')});

    const phaseChecks=[];
    for(const [id,entry]of Object.entries(manifest.enemies).filter(([,entry])=>entry.phases)){
      for(let phase=1;phase<=entry.phases.length;phase++){
        await page.evaluate(async({id,phase})=>{
          const {drawEnemy}=await import('./src/art.js');const c=document.createElement('canvas');c.width=c.height=256;c.dataset.spriteProbe='phase:'+phase;
          __spriteAudit.clear();__spriteAudit.phase='phase';drawEnemy(c.getContext('2d'),id,'idle',128,212,1.5,.2,phase);
        },{id,phase});
        const draws=await page.evaluate(()=>[...__spriteAudit.records.values()]);
        assert(draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'enemies',id,'idle',phase))),`${id}: generated phase ${phase} is reachable`);
        const encounter=encounters.find(o=>o.enemies?.includes(id));
        await page.evaluate(({id,encounter,phase})=>{
          __dev.checkpoint('finale');__dev.startBattle(encounter);
          const enemy=__dev.snapshot().battle.enemies.find(e=>e.catalogId===id);
          __dev.enemy(id,{hp:Math.floor(enemy.maxHp*([.9,.5,.2][phase-1]||.2)),atb:100});
          __spriteAudit.clear();__spriteAudit.phase='battle-phase';__dev.advance(.02);
        },{id,encounter:encounter.id,phase});
        await page.waitForTimeout(85);
        const actual=await page.evaluate(()=>({draws:[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'),state:__dev.snapshot().battle}));
        assert.equal(actual.state.enemies.find(e=>e.catalogId===id).bossPhase,phase,`${id}: phase ${phase} entered during an actual enemy turn`);
        assert(actual.draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'enemies',id,'attack',phase))),`${id}: actual battle uses generated phase ${phase}`);
        if(phase===entry.phases.length)await page.screenshot({path:path.join(evidence,'sprite-remake-boss-final-phase.png')});
        phaseChecks.push({id,phase,row:entry.phases[phase-1],actualBattle:true});
      }
    }

    // One real Attack verifies that a lethal impact switches the live battle
    // renderer through the generated death cells before its downed hold.
    const deathEncounter=encounters.find(o=>o.enemies?.length===1&&!o.boss)||roaming;
    const deathId=deathEncounter.enemies[0];
    const deathTarget=await page.evaluate(({encounter,id})=>{
      __dev.checkpoint('links');const s=__dev.snapshot().state;s.settings.speed=1;delete s.cleared[encounter];__dev.loadState(s);
      __dev.startBattle(encounter,{ready:true});__dev.enemy(id,{hp:1});
      const enemy=__dev.snapshot().battle.enemies.find(e=>e.catalogId===id);
      return {id:enemy.id,label:`${enemy.name} · ${enemy.hp}/${enemy.maxHp} HP`};
    },{encounter:deathEncounter.id,id:deathId});
    await page.evaluate(()=>{__spriteAudit.clear();__spriteAudit.phase='battle-supplies';});
    await page.getByRole('button',{name:'Item',exact:true}).click();await page.waitForTimeout(160);
    const supplyDraws=await page.evaluate(()=>[...__spriteAudit.records.values()]);
    const supplyIds=['potion','ether','phoenix'];
    for(const id of supplyIds)assert(supplyDraws.some(r=>r.canvas===id&&isDeclaredCrop(r,expectedCell(manifest,'items',id))),id+': battle Field supplies uses its generated icon');
    await page.screenshot({path:path.join(evidence,'sprite-remake-battle-supplies.png')});
    await page.keyboard.press('b');
    await page.getByRole('button',{name:'Attack',exact:true}).click();
    await page.evaluate(()=>{__spriteAudit.clear();__spriteAudit.phase='lethal-hit';});
    await page.getByRole('button',{name:deathTarget.label,exact:true}).click();
    await page.waitForFunction(id=>__dev.snapshot().battle?.enemies.find(e=>e.id===id)?.hp===0,deathTarget.id,{timeout:5000});
    await page.waitForTimeout(400);
    const deathDraws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'));
    const deathCell=expectedCell(manifest,'enemies',deathId,'death'),deathSheet=manifest.sheets[manifest.enemies[deathId].sheet];
    const deathFrames=[...new Set(deathDraws.filter(r=>isDeclaredCrop(r,deathCell)).map(r=>Math.floor((r.crop[0]+r.crop[2]/2)/deathSheet.width*deathSheet.columns)))].sort();
    assert(deathFrames.filter(frame=>frame>=3).length>=2,'A real lethal hit renders multiple generated death frames');

    await page.getByRole('button',{name:'Continue the journey',exact:true}).waitFor({timeout:5000});
    await page.waitForTimeout(160);
    const lootIds=await page.locator('.result-items [data-item-icon]').evaluateAll(nodes=>nodes.map(c=>c.dataset.itemIcon));
    assert(lootIds.length>0,'First-clear victory displays generated loot icons');
    const rewardDraws=await page.evaluate(()=>[...__spriteAudit.records.values()]);
    for(const id of lootIds)assert(rewardDraws.some(r=>r.canvas===id&&isDeclaredCrop(r,expectedCell(manifest,'items',id))),id+': actual victory loot uses its generated icon');
    await page.screenshot({path:path.join(evidence,'sprite-remake-loot.png')});

    const props=[];
    const chest=OBJECTS.find(o=>o.type==='chest');assert(chest,'A world cache exists');
    for(const open of [false,true]){
      const id=open?'cache_open':'cache_closed';
      await page.evaluate(({open,chest})=>{__dev.checkpoint('links');const s=__dev.snapshot().state;s.chests=open?[chest]:[];__dev.loadState(s);__dev.near(chest);__spriteAudit.clear();__spriteAudit.phase='prop';},{open,chest:chest.id});
      await page.waitForTimeout(100);
      const draws=await page.evaluate(()=>[...__spriteAudit.records.values()].filter(r=>r.canvas==='canvas'));
      assert(draws.some(r=>isDeclaredCrop(r,expectedCell(manifest,'props',id))),id+': real world cache uses generated artwork');props.push(id);
    }
    assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(networkErrors,[],'No missing runtime assets');
    const report={scope:'Targeted generated-sprite coverage and rendering checks using documented development checkpoints; not a campaign playthrough.',excluded:['Existing Kaida, Vex and Rune atlases','Settlement buildings, mayor and commons worker'],sheets:sheetChecks,imageChecks,renderChecks:renderChecks.checks,runtime:{inventoryItems:expected.items,npcs:worldChecks,ionaPortrait,overworldEncounter:roaming.id,battleEnemies:battleChecks,phases:phaseChecks,lethalHit:{enemy:deathId,frames:deathFrames},battleSupplies:supplyIds,victoryLoot:lootIds,props},errors,networkErrors};
    await writeFile(path.join(evidence,'sprite-remake-report.json'),JSON.stringify(report,null,2)+'\n');
    await rm(path.join(evidence,'sprite-remake-failure.json'),{force:true});
    console.log(`PASS: ${sheetChecks.length} generated sheets; ${renderChecks.checks.length} renderer/state probes; ${expected.items.length} item icons, ${worldChecks.length} NPCs, ${battleChecks.length} battle enemies and ${props.length} cache states used by the actual game.`);
  }catch(error){
    await mkdir(evidence,{recursive:true});
    await writeFile(path.join(evidence,'sprite-remake-failure.json'),JSON.stringify({error:error.stack||String(error),pageErrors:errors,networkErrors},null,2)+'\n');
    throw error;
  }finally{
    server?.closeAllConnections();
    await Promise.allSettled([browser?.close(),server?new Promise(resolve=>server.close(resolve)):null]);
  }
}

await run();
