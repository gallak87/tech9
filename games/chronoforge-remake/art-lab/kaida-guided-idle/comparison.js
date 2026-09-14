import {HERO_IDLE_SHEETS,createHeroIdleFrames,heroIdleFrame} from '../../src/hero-idle.js';

const $=id=>document.getElementById(id);
const HEROES={kaida:'Kaida',vex:'Vex',rune:'Rune'};
const MODES=['gallery','compare','overlay'];
let hero='kaida',reference=null,candidate=null,mode='gallery',selected='right',frame=0;
let playing=false,elapsed=0,lastTime=0,dirty=true,attempt=0,lastDpr=0;
const canvases=[...document.querySelectorAll('canvas[data-source]')];
const observer=new ResizeObserver(()=>dirty=true);
for(const c of canvases)observer.observe(c);

function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function assetURL(file,base){return new URL(file,base);}
async function image(url){const img=new Image();const fresh=new URL(url);fresh.searchParams.set('study',String(Date.now()));img.src=fresh.href;await img.decode();return img;}
function mergeBounds(boxes){
  const left=Math.min(...boxes.map(b=>b.left)),top=Math.min(...boxes.map(b=>b.top));
  const right=Math.max(...boxes.map(b=>b.right)),bottom=Math.max(...boxes.map(b=>b.bottom));
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
function alphaBounds(data,width,height){
  let x=width,y=height,right=0,bottom=0,transparent=false;
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const a=data[(py*width+px)*4+3];if(a<255)transparent=true;if(a<=32)continue;
    x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px+1);bottom=Math.max(bottom,py+1);
  }
  if(!right)throw new Error('A candidate pose contains no visible pixels.');
  return {x,y,width:right-x,height:bottom-y,transparent};
}
function validRect(r){return r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;}
function prepareCandidate(img,spec){
  if(spec.columns!==3||spec.rows!==1||spec.poses?.length!==3||new Set(spec.poses.map(p=>p.id)).size!==3||!['front','back','right'].every(id=>spec.poses.some(p=>p.id===id)))throw new Error('The direction study needs front, back and right views in one three-column row.');
  const cw=img.naturalWidth/spec.columns,ch=img.naturalHeight;
  const frames=spec.poses.map((pose,index)=>{
    const crop=pose.crop||{x:index*cw,y:0,width:cw,height:ch};
    if(!validRect(crop)||!Object.values(crop).every(Number.isInteger)||crop.x<0||crop.y<0||crop.x+crop.width>img.naturalWidth||crop.y+crop.height>img.naturalHeight)throw new Error(`Invalid source crop for ${pose.id}.`);
    const canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
    const measured=alphaBounds(ctx.getImageData(0,0,crop.width,crop.height).data,crop.width,crop.height),b=pose.bounds||measured;
    if(!validRect(b)||b.x<0||b.y<0||b.x+b.width>crop.width||b.y+b.height>crop.height)throw new Error(`Invalid silhouette bounds for ${pose.id}.`);
    const originX=pose.originX??((index+.5)*cw-crop.x);
    if(!Number.isFinite(originX))throw new Error(`Invalid horizontal origin for ${pose.id}.`);
    return {id:pose.id,label:pose.label||pose.id,canvas,originX,originY:crop.y,opaque:!measured.transparent,documentedBounds:!!pose.bounds,
      box:{left:b.x-originX,top:b.y+crop.y,right:b.x+b.width-originX,bottom:b.y+b.height+crop.y}};
  });
  return {frames,bounds:mergeBounds(frames.map(f=>f.box)),width:img.naturalWidth,height:img.naturalHeight};
}
async function loadReference(id){
  const spec=HERO_IDLE_SHEETS[id],url=assetURL(`../../assets/${spec.file}`,import.meta.url),img=await image(url);
  const prepared=createHeroIdleFrames(img,undefined,spec.layout),b=prepared.bounds,w=prepared.frames[0].width;
  return {...prepared,layout:spec.layout,file:spec.file,url,
    bounds:{left:b.x-w/2,top:b.y,right:b.right-w/2,bottom:b.bottom,width:b.width,height:b.height},
    frames:prepared.frames.map((canvas,index)=>{const [dx,dy]=spec.offsets?.[index]||[0,0];return {canvas,originX:canvas.width/2-dx,originY:dy};})};
}
async function loadCandidate(id){
  const url=assetURL(`../${id}-directions/study.json`,import.meta.url);
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${HEROES[id]} direction study is not ready (${response.status}).`);
  const study=await response.json();if(study.reference?.hero!==id)throw new Error('The direction study references a different character.');
  const source=assetURL(study.candidate.file,url),img=await image(source);
  return {...prepareCandidate(img,study.candidate),study,url,source};
}
function setPlaying(value){playing=!!value&&!!reference&&!document.hidden;$('play').textContent=playing?'Pause current idle':'Play current idle';$('play').setAttribute('aria-pressed',String(playing));}
function showFrame(index){frame=index;$('frame').value=String(index);$('frame-value').value=`${index+1} / ${reference?.frames.length||8}`;for(const el of document.querySelectorAll('.current-label'))el.textContent=`Frame ${index+1} · current sprite registry`;dirty=true;}
function selectedFrame(){return candidate?.frames.find(f=>f.id===selected);}
function updateSelection(){
  const pose=selectedFrame(),label=pose?.label||$('pose').selectedOptions[0].textContent;
  for(const el of document.querySelectorAll('.selected-label'))el.textContent=label;
  for(const el of document.querySelectorAll('[data-pose-card]'))el.classList.toggle('selected',el.dataset.poseCard===selected);
  const opaque=!!pose?.opaque;$('opacity').disabled=opaque;document.querySelector('[data-mode=overlay]').textContent=opaque?'A/B comparison':'Overlay';
  if(opaque&&Number($('opacity').value)!==0&&Number($('opacity').value)!==100)$('opacity').value='100';
  $('opacity-value').value=`${$('opacity').value}%`;
  $('overlay-hint').textContent=opaque?'Opaque source: use A / B; transparent blending is unavailable.':'Drag the slider to compare edges and clothing.';
  $('overlay-caption').textContent=opaque?'Original background preserved · manual A / B only':'Current fades out as the candidate fades in';
  dirty=true;
}
function setMode(next){mode=MODES.includes(next)?next:'gallery';for(const id of MODES)$(id).hidden=id!==mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));dirty=true;}
function showLoading(){
  for(const el of document.querySelectorAll('[data-pending]')){el.hidden=false;el.textContent='Loading local images…';}
  $('play').disabled=true;$('frame').disabled=true;dirty=true;
}
async function load(){
  const currentAttempt=++attempt,id=hero;setPlaying(false);reference=null;candidate=null;elapsed=0;showFrame(0);showLoading();
  $('hero-name').textContent=HEROES[id];document.title=`${HEROES[id]} · direction study`;
  $('raw-reference').href=assetURL(`../../assets/${HERO_IDLE_SHEETS[id].file}`,import.meta.url).href;
  $('raw-candidate').href=assetURL(`../${id}-directions/candidate.png`,import.meta.url).href;
  $('prompt-link').href=assetURL(`../${id}-directions/prompt.txt`,import.meta.url).href;
  $('generation-link').href=assetURL(`../${id}-directions/generation.json`,import.meta.url).href;
  $('reference-info').textContent='Loading current sprite registry…';$('sheet-info').textContent='Source dimensions will appear after loading.';
  for(const c of canvases)c.setAttribute('aria-label',`${HEROES[id]} ${c.dataset.source==='reference'?'current approved idle':c.dataset.source==='overlay'?'current and candidate comparison':`${c.dataset.source} direction candidate`}`);
  status(`Loading ${HEROES[id]}’s current idle and three new directions…`);
  const results=await Promise.allSettled([loadReference(id),loadCandidate(id)]);if(currentAttempt!==attempt)return;
  const errors=[];
  if(results[0].status==='fulfilled')reference=results[0].value;else errors.push(`Current idle: ${results[0].reason.message}`);
  if(results[1].status==='fulfilled')candidate=results[1].value;else errors.push(`Directions: ${results[1].reason.message}`);
  if(reference){$('frame').max=String(reference.frames.length-1);$('frame').disabled=false;$('play').disabled=false;$('reference-info').textContent=`${reference.file} · ${reference.frames.length} frames`;showFrame(0);}
  if(candidate){
    $('raw-candidate').href=candidate.source.href;
    $('prompt-link').href=assetURL(candidate.study.promptFile||'prompt.txt',candidate.url).href;
    $('generation-link').href=assetURL(candidate.study.generationFile||'generation.json',candidate.url).href;
    const measured=candidate.frames.some(f=>f.documentedBounds)?'Documented silhouette bounds used.':'Alpha > 32 silhouette bounds used.';
    $('sheet-info').textContent=`Candidate: ${candidate.width} × ${candidate.height}px. ${measured} Current: ${reference?.file||'unavailable'}.`;
  }
  for(const el of document.querySelectorAll('[data-pending]')){const ready=el.dataset.pending==='reference'?reference:el.dataset.pending==='candidate'?candidate:reference&&candidate;el.hidden=!!ready;if(!ready)el.textContent='Image unavailable. Use Reload when it is ready.';}
  const opaque=candidate?.frames.some(f=>f.opaque);
  status(errors.length?`${errors.join(' ')} Reload to try again.`:`${HEROES[id]} · current idle + three standing views.${opaque?' Opaque candidate background preserved; use side-by-side or manual A / B.':''}`,errors.length>0);
  updateSelection();dirty=true;
}
function surface(c){
  const rect=c.getBoundingClientRect();if(!rect.width||!rect.height)return null;
  const density=Math.min(window.devicePixelRatio||1,2048/Math.max(rect.width,rect.height)),w=Math.max(1,Math.round(rect.width*density)),h=Math.max(1,Math.round(rect.height*density));
  if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
  const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform(w/rect.width,0,0,h/rect.height,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  return {ctx,width:rect.width,height:rect.height};
}
function drawPose(ctx,group,pose,x,baseline,bodyHeight,alpha=1){
  if(!group||!pose||alpha<=0)return;
  const k=bodyHeight/group.bounds.height,center=(group.bounds.left+group.bounds.right)/2;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.drawImage(pose.canvas,x-(pose.originX+center)*k,baseline+(pose.originY-group.bounds.bottom)*k,pose.canvas.width*k,pose.canvas.height*k);
  ctx.restore();
}
function paint(){
  const visible=canvases.filter(c=>c.closest('section').id===mode),sizes=visible.map(c=>({c,s:surface(c)})).filter(v=>v.s);
  const ratio=Math.max(reference?reference.bounds.width/reference.bounds.height:0,candidate?candidate.bounds.width/candidate.bounds.height:0,.4);
  const bodyHeight=Math.min(Number($('zoom').value),...sizes.map(({s})=>(s.width-30)/ratio));
  const guide=getComputedStyle(document.body).getPropertyValue('--guide').trim();
  for(const {c,s:{ctx,width,height}} of sizes){
    const baseline=height-30,x=width/2,type=c.dataset.source;
    if(type==='reference')drawPose(ctx,reference,reference?.frames[frame],x,baseline,bodyHeight);
    else if(type==='overlay'){
      const mix=Number($('opacity').value)/100;
      drawPose(ctx,reference,reference?.frames[frame],x,baseline,bodyHeight,1-mix);
      drawPose(ctx,candidate,selectedFrame(),x,baseline,bodyHeight,mix);
    }else drawPose(ctx,candidate,type==='selected'?selectedFrame():candidate?.frames.find(f=>f.id===type),x,baseline,bodyHeight);
    ctx.strokeStyle=guide;ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(12,baseline+.5);ctx.lineTo(width-12,baseline+.5);ctx.stroke();ctx.setLineDash([]);
    ctx.font='9px system-ui';ctx.fillStyle=guide;ctx.fillText('BASELINE',13,baseline+17);
  }
}
function tick(now){
  const dt=lastTime?Math.min(.1,(now-lastTime)/1000):0;lastTime=now;
  if(playing&&reference){elapsed+=dt;const next=heroIdleFrame(elapsed,{},reference.layout);if(next!==frame)showFrame(next);}
  const dpr=window.devicePixelRatio||1;if(dpr!==lastDpr){lastDpr=dpr;dirty=true;}
  if(dirty&&!document.hidden){paint();dirty=false;}requestAnimationFrame(tick);
}
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>setMode(b.dataset.mode));
$('hero').addEventListener('change',()=>{hero=$('hero').value;const url=new URL(location.href);url.searchParams.set('hero',hero);history.replaceState(null,'',url);load();});
$('pose').addEventListener('change',()=>{selected=$('pose').value;updateSelection();});
$('zoom').addEventListener('change',()=>{document.documentElement.style.setProperty('--well-height',`${Number($('zoom').value)+76}px`);dirty=true;});
$('backdrop').addEventListener('change',()=>{document.body.dataset.backdrop=$('backdrop').value;dirty=true;});
$('reload').addEventListener('click',load);
$('play').addEventListener('click',()=>setPlaying(!playing));
$('frame').addEventListener('input',()=>{setPlaying(false);showFrame(Number($('frame').value));elapsed=(reference?.layout.sequence.indexOf(frame)||0)*(reference?.layout.beatDuration||0);});
$('opacity').addEventListener('input',()=>{$('opacity-value').value=`${$('opacity').value}%`;dirty=true;});
for(const [id,value] of [['show-current','0'],['show-candidate','100']])$(id).addEventListener('click',()=>{$('opacity').value=value;$('opacity-value').value=`${value}%`;dirty=true;});
for(const id of ['front','back','right'])document.querySelector(`[data-pose-card="${id}"]`).addEventListener('dblclick',()=>{selected=id;$('pose').value=id;updateSelection();setMode('compare');});
window.addEventListener('resize',()=>dirty=true);
window.addEventListener('pagehide',()=>setPlaying(false));
window.addEventListener('pageshow',()=>dirty=true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);else dirty=true;});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)setPlaying(false);});
const requested=new URLSearchParams(location.search).get('hero');if(Object.hasOwn(HEROES,requested))hero=requested;
$('hero').value=hero;updateSelection();setMode('gallery');load();requestAnimationFrame(tick);
