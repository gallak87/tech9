// Focused browser verification of the production battle renderer and action clock.
// Run: node tests/battle-motion.mjs. The temporary server/browser close in finally.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,writeFile,mkdir,stat,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from './browser.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'evidence');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const near=(a,b,tolerance=2)=>Math.abs(a-b)<=tolerance;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

async function serve(){
  const server=http.createServer(async(req,res)=>{
    try{
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(await readFile(file));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}

// Read positions from actual PNG drawImage calls on the visible game canvas.
// This catches a renderer that exposes correct poses but still draws at home.
function installMotionAudit(){
  const original=CanvasRenderingContext2D.prototype.drawImage;
  const records=new Map();
  window.__motionAudit={records,clear(){records.clear();}};
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    if(this.canvas.id==='canvas'&&typeof source?.src==='string'&&args.length===8){
      const file=new URL(source.src,location.href).pathname;
      const hero=file.match(/\/assets\/(kaida|vex|rune)\.png$/);
      const enemy=file.match(/\/assets\/sprites\/enemies\/([^/]+)\.png$/);
      if(hero||enemy){
        const m=this.getTransform(),[sx,sy,sw,sh,dx,dy,dw,dh]=args;
        const px=hero?0:dx+dw/2,py=hero?0:dy+dh;
        const id=hero?.[1]||enemy[1];
        records.set(id,{id,kind:hero?'hero':'enemy',file,x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f,
          crop:[sx,sy,sw,sh],destination:[dx,dy,dw,dh],facing:m.a<0?'left':'right'});
      }
    }
    return original.call(this,source,...args);
  };
}

async function rendered(page){
  return page.evaluate(async()=>{
    __motionAudit.clear();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(window.__runtimeError)throw new Error(window.__runtimeError);
    return {snapshot:__dev.snapshot(),poses:__dev.poses(),draws:[...__motionAudit.records.values()]};
  });
}
function actor(frame,id){
  const unit=[...frame.snapshot.battle.heroes,...frame.snapshot.battle.enemies].find(u=>u.id===id);
  const draw=frame.draws.find(d=>d.id===(unit?.catalogId||id));
  assert(draw,`${id}: production canvas drew its sprite`);
  return draw;
}
function pose(frame,id){return frame.poses.find(p=>p.id===id);}
function hp(frame){return Object.fromEntries([...frame.snapshot.battle.heroes,...frame.snapshot.battle.enemies].map(u=>[u.id,u.hp]));}
function resources(frame){return Object.fromEntries(frame.snapshot.battle.heroes.map(h=>[h.id,{mp:h.mp,atb:h.atb} ]));}
function checkRenderer(frame,label){
  for(const p of frame.poses){
    const d=actor(frame,p.id);
    assert(near(d.x,p.x)&&near(d.y,p.y),`${label}/${p.id}: real canvas anchor (${d.x},${d.y}) matches pose (${p.x},${p.y})`);
    assert(d.x>20&&d.x<910&&d.y>90&&d.y<480,`${label}/${p.id}: actor remains in visible battle stage`);
  }
}
async function atTime(page,elapsed){
  await page.evaluate(t=>{
    const s=__dev.snapshot(),current=s.battle.action?.elapsed||0;
    if(t<current-1e-8)throw new Error('Cannot rewind a combat action');
    __dev.advance(Math.max(0,t-current)/s.state.settings.speed);
  },elapsed);
  return rendered(page);
}

async function fixture(page,{encounter='crown_gate',reduced=false,enemy=false}={}){
  await page.evaluate(({encounter,reduced,enemy})=>{
    __dev.checkpoint('links');
    const s=__dev.snapshot().state;s.settings.speed=1;s.settings.reducedMotion=reduced;s.settings.wait=true;
    __dev.loadState(s);__dev.pause();__dev.startBattle(encounter,{ready:!enemy});
    if(enemy){for(const h of __dev.snapshot().battle.heroes)__dev.hero(h.id,{atb:0});}
  },{encounter,reduced,enemy});
  return rendered(page);
}
async function choose(page,{hero='kaida',command='Attack',technique,target=0}={}){
  await page.getByRole('button',{name:`Select ${hero[0].toUpperCase()+hero.slice(1)} in battle`,exact:true}).click();
  await page.getByRole('button',{name:command,exact:true}).click();
  if(technique)await page.getByRole('button',{name:technique,exact:true}).click();
  if((await page.evaluate(()=>__dev.snapshot().battle.view))==='target'){
    await page.locator('.command-panel .command-button').nth(target).click();
  }
  const result=await rendered(page);
  assert(result.snapshot.battle.action,'Semantic battle buttons started a production action');
  assert.equal(result.snapshot.battle.action.elapsed,0,'Paused fixture has not advanced action time');
  return result;
}

async function run(){
  let server,browser,page;
  const errors=[],networkErrors=[],checks=[],gallery=[];
  try{
    let base=process.env.BATTLE_MOTION_TEST_URL;
    if(!base){const local=await serve();server=local.server;base=local.url;}
    browser=await chromium.launch({headless:true});
    page=await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)networkErrors.push({url:r.url(),status:r.status()});});
    await page.addInitScript(installMotionAudit);
    await page.goto(base.replace(/\/$/,'')+'/?dev=1');
    await page.waitForFunction(()=>typeof window.__dev?.poses==='function',null,{timeout:30000});
    await mkdir(evidence,{recursive:true});

    async function screenshot(name,label){
      const data=await page.locator('#game').screenshot();
      gallery.push({name,label,data:data.toString('base64')});
      return data;
    }
    async function actionCheck(spec){
      const home=await fixture(page,spec);
      if(spec.before)await spec.before(page);
      const start=await choose(page,spec),a=start.snapshot.battle.action;
      const participants=a.participants,initialHP=hp(start),initialResources=resources(start);
      const samples=[];
      checkRenderer(start,spec.name+'/start');
      for(const fraction of [.2,.4,.6,.8,.98]){
        const frame=await atTime(page,a.impactAt*fraction);
        checkRenderer(frame,spec.name+'/'+fraction);
        assert.deepEqual(hp(frame),initialHP,spec.name+': HP is unchanged before contact');
        assert.equal(frame.snapshot.battle.lastAction.impacts,0,spec.name+': no early impact');
        samples.push(frame);
        if(fraction===.6)await screenshot(spec.name,'APPROACH');
      }
      const impact=await atTime(page,a.impactAt+.025);
      checkRenderer(impact,spec.name+'/impact');
      assert.equal(impact.snapshot.battle.lastAction.impacts,1,spec.name+': damage/effect commits once at contact');
      const impactHP=hp(impact);
      await screenshot(spec.name,'CONTACT');
      const hold=await atTime(page,a.impactAt+.16);
      assert.deepEqual(hp(hold),impactHP,spec.name+': hold frames do not repeat damage/healing');
      assert.equal(hold.snapshot.battle.lastAction.impacts,1,spec.name+': one committed impact during contact hold');
      const recovery=await atTime(page,a.total-.01);
      checkRenderer(recovery,spec.name+'/recovery');
      assert.deepEqual(hp(recovery),impactHP,spec.name+': return frames do not repeat damage/healing');
      assert.equal(recovery.snapshot.battle.lastAction.impacts,1,spec.name+': one committed impact throughout return');
      const end=await atTime(page,a.total+.001);
      checkRenderer(end,spec.name+'/formation');
      assert.equal(end.snapshot.battle.action,null,spec.name+': action completes');
      for(const id of participants){
        const original=actor(home,id),returned=actor(end,id);
        assert(distance(original,returned)<2.5,spec.name+'/'+id+': visible sprite returns to its formation');
      }
      await screenshot(spec.name,'FORMATION');

      if(spec.offensive!==false){
        for(const id of participants){
          const origin=actor(home,id),contact=actor(impact,id),p=pose(impact,id);
          const target=actor(impact,p.targetId);
          if(spec.reduced){
            assert(distance(origin,contact)<20,spec.name+'/'+id+': reduced motion limits translation');
          }else{
            assert(contact.x-origin.x>180,spec.name+'/'+id+': actual sprite crosses the arena');
            assert(distance(contact,target)<185,spec.name+'/'+id+': visible contact reaches the selected enemy');
            assert(samples.some(f=>distance(actor(f,id),origin)>60),spec.name+'/'+id+': real intermediate frames travel');
            assert(new Set([...samples,impact].map(f=>actor(f,id).crop.join(','))).size>=3,spec.name+'/'+id+': actual travel and strike draw distinct authored animation cells');
          }
          assert.equal(p.targetId,a.targetIds.includes(p.targetId)?p.targetId:undefined,spec.name+'/'+id+': contact follows an action target');
        }
        assert(a.targetIds.some(id=>impactHP[id]<initialHP[id]),spec.name+': target takes damage at visible contact');
      }else{
        for(const frame of [...samples,impact,recovery])for(const id of participants){
          assert(distance(actor(frame,id),actor(home,id))<2.5,spec.name+'/'+id+': support/defend stays in formation');
        }
      }
      for(const cost of start.snapshot.battle.lastAction.costs){
        const before=resources(home)[cost.id],reserved=initialResources[cost.id];
        assert.equal(reserved.mp,before.mp-cost.mp,spec.name+'/'+cost.id+': MP is reserved once');
        assert.equal(reserved.atb,0,spec.name+'/'+cost.id+': full ATB is reserved once');
        if(!spec.refundsMP)assert.equal(resources(recovery)[cost.id].mp,reserved.mp,spec.name+'/'+cost.id+': no repeated MP deduction');
        assert.equal(resources(recovery)[cost.id].atb,0,spec.name+'/'+cost.id+': ATB stays consumed during animation');
      }
      if(spec.verify)spec.verify({home,start,samples,impact,hold,recovery,end});
      const check={name:spec.name,action:a,participants,initialHP,impactHP,
        frames:[{stage:'formation',frame:home},...samples.map((frame,i)=>({stage:'approach-'+i,frame})),{stage:'contact',frame:impact},{stage:'return',frame:recovery},{stage:'formation-restored',frame:end}].map(({stage,frame})=>({stage,elapsed:frame.snapshot.battle.action?.elapsed,draws:frame.draws,poses:frame.poses})),
        impacts:end.snapshot.battle.lastAction.impacts,costs:start.snapshot.battle.lastAction.costs};
      checks.push(check);console.log('PASS '+spec.name);
      return check;
    }

    await actionCheck({name:'kaida-dash',hero:'kaida',verify:({home,samples,impact})=>{
      assert(samples.every(f=>pose(f,'kaida').lift<25),'Kaida uses a low dash');
      assert(actor(impact,'kaida').x>actor(home,'kaida').x+180,'Kaida visibly reaches the opposing line');
    }});
    await actionCheck({name:'rune-jump',hero:'rune',verify:({samples})=>{
      assert(Math.max(...samples.map(f=>pose(f,'rune').groundY-actor(f,'rune').y))>35,'Rune visibly rises above his ground trajectory');
    }});
    await actionCheck({name:'vex-glide',hero:'vex',command:'Tech',technique:'Void Lance',verify:({samples})=>{
      assert(samples.some(f=>pose(f,'vex').groundY-actor(f,'vex').y>8),'Vex visibly glides above the floor');
    }});
    await actionCheck({name:'chosen-lower-target',hero:'kaida',target:1,verify:({home,impact,start})=>{
      const id=start.snapshot.battle.action.targetIds[0];
      assert.equal(id,home.snapshot.battle.enemies[1].id,'Clicked second target is retained');
      assert(actor(impact,'kaida').y>actor(home,'kaida').y+60,'Approach follows the second enemy’s lower lane');
      assert(near(hp(impact)[home.snapshot.battle.enemies[0].id],hp(home)[home.snapshot.battle.enemies[0].id],0),'Unchosen upper enemy is unharmed');
    }});
    await actionCheck({name:'double-contact',encounter:'architect',hero:'kaida',command:'Link',technique:'Tidal Rift',verify:({impact})=>{
      assert(distance(actor(impact,'kaida'),actor(impact,'vex'))>20,'Double technique gives participants distinct contact lanes');
    }});
    await actionCheck({name:'triple-contact',encounter:'architect',hero:'kaida',command:'Link',technique:'The Unwritten Hour',verify:({impact})=>{
      const positions=['kaida','vex','rune'].map(id=>actor(impact,id));
      for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert(distance(positions[i],positions[j])>20,'Triple technique separates every participant at contact');
    }});
    await actionCheck({name:'support-heal',hero:'vex',command:'Tech',technique:'Mend the Moment',target:0,offensive:false,before:page=>page.evaluate(()=>__dev.hero('kaida',{hp:40})),verify:({start,impact})=>assert(hp(impact).kaida>hp(start).kaida,'Support healing resolves while Vex stays home')});
    await actionCheck({name:'support-link',hero:'vex',command:'Link',technique:'Winter Mercy',offensive:false});
    await actionCheck({name:'defend-home',hero:'rune',command:'Defend',offensive:false,refundsMP:true});
    await actionCheck({name:'reduced-motion',hero:'rune',reduced:true});

    // Enemy readiness and decision-making use the real ATB update path.
    const enemyHome=await fixture(page,{encounter:'ember_gravbot',enemy:true});
    await page.evaluate(()=>{__dev.enemy('gravbot',{atb:100});__dev.advance(.001);});
    const enemyStart=await rendered(page),ea=enemyStart.snapshot.battle.action;
    assert.equal(ea.side,'enemy','Enemy ATB starts an enemy action');
    const enemyId=ea.participants[0],enemyTravel=await atTime(page,ea.impactAt*.6);
    checkRenderer(enemyTravel,'enemy-charge/travel');
    assert.deepEqual(hp(enemyTravel),hp(enemyStart),'Enemy does not damage allies before contact');
    await screenshot('enemy-charge','APPROACH');
    const enemyImpact=await atTime(page,ea.impactAt+.025);
    checkRenderer(enemyImpact,'enemy-charge/contact');
    assert(actor(enemyHome,enemyId).x-actor(enemyImpact,enemyId).x>180,'Physical enemy crosses the arena toward the chosen hero');
    assert(distance(actor(enemyImpact,enemyId),actor(enemyImpact,ea.targetIds[0]))<155,'Enemy reaches the actual targeted hero');
    assert(hp(enemyImpact)[ea.targetIds[0]]<hp(enemyStart)[ea.targetIds[0]],'Enemy damage lands at contact');
    assert.equal(enemyImpact.snapshot.battle.lastAction.impacts,1,'Enemy impact applies exactly once');
    await screenshot('enemy-charge','CONTACT');
    const enemyRecovery=await atTime(page,ea.total-.01);
    assert.deepEqual(hp(enemyRecovery),hp(enemyImpact),'Enemy recovery does not repeat damage');
    const enemyEnd=await atTime(page,ea.total+.001);
    assert(distance(actor(enemyEnd,enemyId),actor(enemyHome,enemyId))<2.5,'Enemy returns to original formation');
    await screenshot('enemy-charge','FORMATION');
    checks.push({name:'enemy-charge',action:ea,frames:[enemyHome,enemyTravel,enemyImpact,enemyRecovery,enemyEnd].map(f=>({draws:f.draws,poses:f.poses})),impacts:enemyEnd.snapshot.battle.lastAction.impacts});
    console.log('PASS enemy-charge');

    // A contact sheet made from browser screenshots shows the actual runtime UI,
    // actors, target lanes and return formations, not a separate pose renderer.
    const contactSheet=await page.evaluate(async images=>{
      const width=480,height=300,labelHeight=32,canvas=document.createElement('canvas');
      canvas.width=width*3;canvas.height=Math.ceil(images.length/3)*(height+labelHeight);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#211b26';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(let i=0;i<images.length;i++){
        const image=new Image();image.src='data:image/png;base64,'+images[i].data;await image.decode();
        const x=(i%3)*width,y=Math.floor(i/3)*(height+labelHeight);
        ctx.drawImage(image,x,y+labelHeight,width,height);ctx.fillStyle='#ecd6ad';ctx.font='14px system-ui';
        ctx.fillText(images[i].name+' · '+images[i].label,x+12,y+22);
      }
      return canvas.toDataURL('image/png');
    },gallery);
    await writeFile(path.join(evidence,'battle-motion-contact-sheet.png'),Buffer.from(contactSheet.split(',')[1],'base64'));
    for(const image of gallery.filter(g=>g.label==='CONTACT'&&['kaida-dash','rune-jump','vex-glide','triple-contact','enemy-charge'].includes(g.name)))await writeFile(path.join(evidence,`battle-motion-${image.name}.png`),Buffer.from(image.data,'base64'));
    assert.deepEqual(errors,[],'No browser exceptions');assert.deepEqual(networkErrors,[],'No failed asset/module requests');
    await writeFile(path.join(evidence,'battle-motion-report.json'),JSON.stringify({passed:true,checks,screenshotCount:gallery.length,errors,networkErrors},null,2));
    await rm(path.join(evidence,'battle-motion-failure.json'),{force:true});
    await rm(path.join(evidence,'battle-motion-failure.png'),{force:true});
    console.log(`PASS ${checks.length} focused motion scenarios; ${gallery.length} real runtime screenshots; no browser or network errors.`);
  }catch(error){
    await mkdir(evidence,{recursive:true});
    if(page)await page.screenshot({path:path.join(evidence,'battle-motion-failure.png')}).catch(()=>{});
    await writeFile(path.join(evidence,'battle-motion-failure.json'),JSON.stringify({message:error.message,stack:error.stack,completed:checks.map(c=>c.name),errors,networkErrors},null,2));throw error;
  }finally{
    server?.closeAllConnections();await Promise.allSettled([browser?.close(),server?new Promise(resolve=>server.close(resolve)):null]);
  }
}
await run();
