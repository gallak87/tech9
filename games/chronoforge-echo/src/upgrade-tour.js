import * as Art from './art.js';
import {getScene} from './world.js';
import {artSurface,VIEW_WIDTH as W,VIEW_HEIGHT as H} from './rendering.js';
import {upgradeTourCameras,upgradeShotScale,upgradeSparkles,interiorUpgradeSparkles,UpgradeTour} from './upgrade-cinematic.js';
import {havenInteriorBounds} from './haventide-interior-renderer.js';
import './upgrade-tour.css';

// Shared presentation for real upgrades and local art previews. Rendering only:
// the real transaction is already checkpointed before opening the sequence.
export function mountUpgradeTour(game,{previewMarkup=null,onReturnToPlay=()=>{}}={}) {
  const preview=previewMarkup!==null;
  const root=document.createElement('section');
  root.className='upgrade-tour';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label','Town Center upgrade');
  const screen=artSurface(W,H),ctx=screen.getContext('2d');
  screen.setAttribute('aria-hidden','true');
  root.append(screen);
  const chrome=document.createElement('div');chrome.className='upgrade-chrome';
  chrome.innerHTML=previewMarkup??`
    <header><span data-town-name></span><button type="button" data-tour="skip">Skip reveal <kbd>Esc</kbd></button></header>
    <div class="upgrade-caption" aria-live="polite"><span></span><strong></strong></div>
    <div class="upgrade-card" data-tour-phase="playing"><button type="button" data-tour="skip">Skip reveal <kbd>Space</kbd></button></div>`;
  root.append(chrome);document.querySelector('#game').append(root);
  let tour=null,plan=null,frames=null,previousFocus=null,inertElements=[],raf=0,previousTime=0,shown='',levelSound=false,onComplete=null,townName='';

  function picture(scene,camera,state,actors=[]) {
    const canvas=artSurface(W,H),c=canvas.getContext('2d');
    Art.drawWorld(c,scene,camera,game.visualTime,state);
    for(const actor of [...actors].sort((a,b)=>a.y-b.y))Art.drawHero(c,actor.id,actor.x-camera.x,actor.y-camera.y,{facing:actor.facing,time:game.visualTime});
    Art.drawForeground(c,scene,camera,game.visualTime,state,actors);
    return canvas;
  }
  function refreshChrome(visibleFrame,fade=0) {
    const shot=tour.frame,key=tour.phase+':'+shot.id+':'+visibleFrame;
    root.querySelector('.upgrade-caption').style.opacity=String(1-fade);
    if(shown===key)return;shown=key;
    for(const pane of root.querySelectorAll('[data-tour-phase]'))pane.hidden=pane.dataset.tourPhase!==tour.phase;
    const exterior=visibleFrame.startsWith('outside'),returned=['inside','interiorBefore','interiorUpgrade','interior','complete'].includes(shot.id);
    root.querySelector('.upgrade-caption span').textContent=exterior?'THE TOWN WE ARE BUILDING':returned?'A STRONGER HOME':'A PLACE TO COME HOME TO';
    root.querySelector('.upgrade-caption strong').textContent=exterior?`Town Center · Level ${visibleFrame==='outsideAfter'?plan.toLevel:plan.fromLevel}`:`${townName} · Settlement hall`;
    root.dataset.phase=tour.phase;
    if(preview&&tour.phase==='complete')root.querySelector('[data-tour="done"]').focus({preventScroll:true});
  }
  function draw() {
    const shot=tour.frame,reducedMotion=game.state.settings.reducedMotion;
    const isFade=shot.transition==='fade';
    const visibleFrame=shot.to&&(isFade?shot.progress>=.5:shot.blend>=.5)?shot.to:shot.from;
    const fade=isFade?1-Math.abs(shot.progress*2-1):0;
    function layer(frame,alpha=1) {
      const scale=upgradeShotScale(shot,frame,reducedMotion),pivot=frame.startsWith('outside')?frames.anchor:frames.deskAnchor;
      ctx.save();ctx.globalAlpha=alpha;
      ctx.translate(pivot.x,pivot.y);ctx.scale(scale,scale);ctx.translate(-pivot.x,-pivot.y);
      ctx.drawImage(frames[frame],0,0,W,H);ctx.restore();
    }
    ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);
    if(isFade)layer(visibleFrame);
    else{layer(shot.from);if(shot.to)layer(shot.to,shot.blend);}
    if(['upgrade','interiorUpgrade'].includes(shot.id)&&!reducedMotion){
      const exterior=shot.id==='upgrade',anchor=exterior?frames.anchor:{x:0,y:0};
      const elapsed=shot.progress*shot.duration;
      const particles=exterior?upgradeSparkles(elapsed):interiorUpgradeSparkles(elapsed,frames.interiorTargets);
      ctx.save();
      for(const particle of particles){
        const x=anchor.x+particle.x,y=anchor.y+particle.y;
        if(!exterior&&(x<12||x>W-12||y<44||y>H-28))continue;
        ctx.globalAlpha=particle.alpha*.3;ctx.strokeStyle=particle.color;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+particle.trail);ctx.stroke();
        ctx.globalAlpha=particle.alpha*.9;ctx.fillStyle=particle.color;
        ctx.beginPath();ctx.arc(x,y,particle.size,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    if(fade){ctx.save();ctx.globalAlpha=fade;ctx.fillStyle='#0b141a';ctx.fillRect(0,0,W,H);ctx.restore();}
    // The field view and HUD remain intact underneath the cinematic.
    ctx.fillStyle='#0b141ac9';ctx.fillRect(0,0,W,39);ctx.fillRect(0,H-23,W,23);
    refreshChrome(visibleFrame,fade);
  }
  function tick(now) {
    if(!tour)return;
    const delta=previousTime?Math.min(.1,(now-previousTime)/1000):0;previousTime=now;
    if(!document.hidden)tour.advance(delta);
    const shot=tour.frame;
    if(!levelSound&&tour.phase!=='ready'&&((shot.id==='upgrade'&&shot.progress>=.72)||['exterior','inside','interiorBefore','interiorUpgrade','interior','complete'].includes(shot.id))){game.audio.sound('level');levelSound=true;}
    if(!preview&&tour.phase==='complete'){finish();return;}
    try{draw();}catch(error){game.log('upgrade_reveal_error',{message:error.message});finish();return;}
    if(tour.phase==='playing')raf=requestAnimationFrame(tick);
  }
  function play() {
    if(!tour)return;
    cancelAnimationFrame(raf);tour.play();previousTime=0;levelSound=false;shown='';
    game.audio.unlock();game.audio.sound('build');draw();
    root.querySelector('[data-tour="skip"]').focus({preventScroll:true});
    raf=requestAnimationFrame(tick);
  }
  function close() {
    cancelAnimationFrame(raf);raf=0;previousTime=0;levelSound=false;
    for(const name of ['deskBefore','outsideBefore','outsideAfter','deskAfter']){
      const image=frames?.[name];if(image){image.width=0;image.height=0;}
    }
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,screen.width,screen.height);ctx.restore();
    tour=null;plan=null;frames=null;onComplete=null;root.hidden=true;shown='';
    for(const [element,wasInert] of inertElements)element.inert=wasInert;
    inertElements=[];
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
  }
  function finish() {
    const done=onComplete;close();done?.();
  }
  function skip() {
    if(!tour)return;
    if(!preview){finish();return;}
    cancelAnimationFrame(raf);tour.skip();draw();
  }
  function open(nextPlan,done=null) {
    if(tour)close();
    plan=nextPlan;onComplete=done;
    const location=plan.previewLocation??plan.region;
    const outside=getScene(location),inside=getScene(location+'_town');
    townName=getScene(plan.region).name;
    const townLabel=root.querySelector('[data-town-name]');if(townLabel)townLabel.textContent=townName;
    const view=preview&&game.scene.id!==location+'_town'?null:{camera:game.camera,actors:[{id:'kaida',x:game.state.x,y:game.state.y,facing:game.state.facing},...game.followers]};
    const cameras=upgradeTourCameras(outside,inside,plan,view);
    const entrance=outside.objects.find(o=>o.id===location+'_entrance');
    const board=inside.objects.find(o=>o.service==='construction');
    const interiorReveal=inside.objects.some(o=>o.havenPart);
    const interiorTargets=inside.objects.filter(o=>o.service&&o.havenPart).map(o=>{
      const b=havenInteriorBounds(o,plan.after);
      const x=Math.max(16,b.left-cameras.desk.x),y=Math.max(52,b.top-cameras.desk.y);
      return {x,y,width:Math.min(W-16,b.left+b.width-cameras.desk.x)-x,height:Math.min(H-30,b.top+b.height-cameras.desk.y)-y};
    }).filter(b=>b.width>30&&b.height>30);
    frames={
      deskBefore:picture(inside,cameras.desk,plan.before,cameras.actors),
      outsideBefore:picture(outside,cameras.outside,plan.before),
      outsideAfter:picture(outside,cameras.outside,plan.after),
      deskAfter:picture(inside,cameras.desk,plan.after,cameras.actors),
      anchor:{x:entrance.x-cameras.outside.x,y:entrance.y-cameras.outside.y},
      deskAnchor:{x:board.x-cameras.desk.x,y:board.y-cameras.desk.y},
      interiorTargets,
    };
    previousFocus=document.activeElement;
    inertElements=[...document.querySelector('#game').children].filter(element=>element!==root&&element.id!=='dev-tools').map(element=>[element,element.inert]);
    for(const [element] of inertElements)element.inert=true;
    tour=new UpgradeTour({interiorReveal});root.hidden=false;shown='';
    if(preview){
      root.querySelector('[data-tour-phase="ready"] h2').textContent=`Town Center · ${plan.fromLevel} → ${plan.toLevel}`;
      draw();root.querySelector('[data-tour="play"]').focus({preventScroll:true});
    }else{
      root.querySelector('[data-town-name]').textContent=townName+' · Town Center upgrade';
      play();
    }
  }
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('click',event=>{
    const action=event.target.closest('button')?.dataset.tour;
    if(action==='play')play();
    if(action==='skip')skip();
    if(action==='close')close();
    if(action==='done'){close();onReturnToPlay();}
  });
  return {
    get open(){return !!tour;},openUpgrade:open,close,
    handleKey(event){
      if(!tour)return false;
      if(event.key==='Escape'){event.preventDefault();if(!event.repeat){if(preview)close();else finish();}return true;}
      if(event.key==='Tab'){
        event.preventDefault();const buttons=[...root.querySelectorAll('button')].filter(button=>!button.closest('[hidden]'));
        const index=buttons.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus();return true;
      }
      if(event.key===' '&&tour.phase==='playing'){
        event.preventDefault();if(!event.repeat)skip();return true;
      }
      // Enter/Space retain native button activation, all field keys are consumed.
      if(!['Enter',' '].includes(event.key)||event.repeat)event.preventDefault();
      return true;
    },
    dispose(){close();root.remove();},
  };
}
