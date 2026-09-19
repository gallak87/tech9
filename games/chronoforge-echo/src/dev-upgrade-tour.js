import * as Art from './art.js';
import {getScene} from './world.js';
import {artSurface,VIEW_WIDTH as W,VIEW_HEIGHT as H} from './rendering.js';
import {upgradePreviewStates,upgradeTourCameras,upgradeShotScale,upgradeSparkles,UpgradeTour} from './dev-upgrade-preview.js';

// Development-only renderer. No Game.travel, Game.interact, progression call,
// state assignment, save, or exploration callback is involved in this tour.
export function mountUpgradeTour(game,{onReturnToPlay}) {
  const root=document.createElement('section');
  root.className='dev-upgrade-tour';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label','Haventide upgrade rehearsal');
  const screen=artSurface(W,H),ctx=screen.getContext('2d');
  screen.setAttribute('aria-hidden','true');
  root.append(screen);
  const chrome=document.createElement('div');chrome.className='dev-upgrade-chrome';
  chrome.innerHTML=`
    <header><span>HAVENTIDE <small>UPGRADE PREVIEW · NEVER SAVED</small></span><button type="button" data-tour="close">Back to art preview <kbd>Esc</kbd></button></header>
    <div class="dev-upgrade-caption" aria-live="polite"><span></span><strong></strong></div>
    <div class="dev-upgrade-card">
      <div data-tour-phase="ready"><small>SETTLEMENT WORKS</small><h2></h2><p>Watch the exterior upgrade, then return to the hall.</p><button type="button" data-tour="play">Upgrade Town Center</button><p class="dev-upgrade-note">Rehearsal only · no resources spent<br>Interior uses current artwork; its four stages come next.</p></div>
      <div data-tour-phase="playing" hidden><button type="button" data-tour="skip">Skip reveal <kbd>Space</kbd></button></div>
      <div data-tour-phase="complete" hidden><small>PREVIEW COMPLETE</small><h2>Back inside Haventide</h2><p>Interior artwork is unchanged in this pass.<br>Your real town and expedition are unchanged.</p><button type="button" data-tour="done">Return to play</button><button type="button" data-tour="play">Replay upgrade</button></div>
    </div>`;
  root.append(chrome);document.querySelector('#game').append(root);
  let tour=null,plan=null,frames=null,previousFocus=null,inertElements=[],raf=0,previousTime=0,shown='',levelSound=false;

  function picture(scene,camera,state,actors=[]) {
    const canvas=artSurface(W,H),c=canvas.getContext('2d');
    Art.drawWorld(c,scene,camera,game.visualTime,state);
    for(const actor of actors)Art.drawHero(c,actor.id,actor.x-camera.x,actor.y-camera.y,{facing:actor.facing,time:game.visualTime});
    Art.drawForeground(c,scene,camera,game.visualTime,state,actors);
    return canvas;
  }
  function refreshChrome(visibleFrame,fade=0) {
    const shot=tour.frame,key=tour.phase+':'+shot.id+':'+visibleFrame;
    root.querySelector('.dev-upgrade-caption').style.opacity=String(1-fade);
    if(shown===key)return;shown=key;
    for(const pane of root.querySelectorAll('[data-tour-phase]'))pane.hidden=pane.dataset.tourPhase!==tour.phase;
    const exterior=visibleFrame.startsWith('outside'),returned=visibleFrame==='deskAfter';
    root.querySelector('.dev-upgrade-caption span').textContent=exterior?'THE TOWN WE ARE BUILDING':returned?'INTERIOR ART UNCHANGED IN THIS PASS':'A PLACE TO COME HOME TO';
    root.querySelector('.dev-upgrade-caption strong').textContent=exterior?`Town Center · Level ${visibleFrame==='outsideAfter'?plan.toLevel:plan.fromLevel}`:'Haventide · Settlement hall';
    root.dataset.phase=tour.phase;
    if(tour.phase==='complete')root.querySelector('[data-tour="done"]').focus({preventScroll:true});
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
    if(shot.id==='upgrade'&&!reducedMotion){
      const anchor=frames.anchor;
      ctx.save();
      for(const particle of upgradeSparkles(shot.progress*shot.duration)){
        const x=anchor.x+particle.x,y=anchor.y+particle.y;
        ctx.globalAlpha=particle.alpha*.3;ctx.strokeStyle=particle.color;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+particle.trail);ctx.stroke();
        ctx.globalAlpha=particle.alpha*.9;ctx.fillStyle=particle.color;
        ctx.beginPath();ctx.arc(x,y,particle.size,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    if(fade){ctx.save();ctx.globalAlpha=fade;ctx.fillStyle='#0b141a';ctx.fillRect(0,0,W,H);ctx.restore();}
    // Letterbox only the rehearsal; the ordinary HUD remains intact underneath.
    ctx.fillStyle='#0b141ac9';ctx.fillRect(0,0,W,39);ctx.fillRect(0,H-23,W,23);
    refreshChrome(visibleFrame,fade);
  }
  function tick(now) {
    if(!tour)return;
    const delta=previousTime?Math.min(.1,(now-previousTime)/1000):0;previousTime=now;
    if(!document.hidden)tour.advance(delta);
    const shot=tour.frame;
    if(!levelSound&&tour.phase!=='ready'&&((shot.id==='upgrade'&&shot.progress>=.72)||['exterior','inside','interior','complete'].includes(shot.id))){game.audio.sound('level');levelSound=true;}
    draw();
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
    tour=null;plan=null;frames=null;root.hidden=true;shown='';
    for(const [element,wasInert] of inertElements)element.inert=wasInert;
    inertElements=[];
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
  }
  function open(fromLevel) {
    if(tour)close();
    plan=upgradePreviewStates(game.state,fromLevel);
    const outside=getScene('haventide'),inside=getScene('haventide_town'),cameras=upgradeTourCameras(outside,inside,plan);
    const entrance=outside.objects.find(o=>o.id==='haventide_entrance');
    const board=inside.objects.find(o=>o.service==='construction');
    frames={
      deskBefore:picture(inside,cameras.desk,plan.before,cameras.actors),
      outsideBefore:picture(outside,cameras.outside,plan.before),
      outsideAfter:picture(outside,cameras.outside,plan.after),
      deskAfter:picture(inside,cameras.desk,plan.after,cameras.actors),
      anchor:{x:entrance.x-cameras.outside.x,y:entrance.y-cameras.outside.y},
      deskAnchor:{x:board.x-cameras.desk.x,y:board.y-cameras.desk.y},
    };
    previousFocus=document.activeElement;
    inertElements=[...document.querySelector('#game').children].filter(element=>element!==root).map(element=>[element,element.inert]);
    for(const [element] of inertElements)element.inert=true;
    tour=new UpgradeTour();root.hidden=false;shown='';
    root.querySelector('[data-tour-phase="ready"] h2').textContent=`Town Center · ${plan.fromLevel} → ${plan.toLevel}`;
    draw();root.querySelector('[data-tour="play"]').focus({preventScroll:true});
  }
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('click',event=>{
    const action=event.target.closest('button')?.dataset.tour;
    if(action==='play')play();
    if(action==='skip'){cancelAnimationFrame(raf);tour.skip();draw();}
    if(action==='close')close();
    if(action==='done'){close();onReturnToPlay();}
  });
  return {
    get open(){return !!tour;},openPreview:open,close,
    handleKey(event){
      if(!tour)return false;
      if(event.key==='Escape'){event.preventDefault();close();return true;}
      if(event.key==='Tab'){
        event.preventDefault();const buttons=[...root.querySelectorAll('button')].filter(button=>!button.closest('[hidden]'));
        const index=buttons.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus();return true;
      }
      if(event.key===' '&&tour.phase==='playing'){
        event.preventDefault();if(!event.repeat){cancelAnimationFrame(raf);tour.skip();draw();}return true;
      }
      // Enter/Space retain native button activation, all field keys are consumed.
      if(!['Enter',' '].includes(event.key)||event.repeat)event.preventDefault();
      return true;
    },
    dispose(){close();root.remove();},
  };
}
