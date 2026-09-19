import * as Art from './art.js';
import {artSurface,artContext,RENDER_SCALE,VIEW_WIDTH as W,VIEW_HEIGHT as H} from './rendering.js';
import {worldViewCamera,worldViewSurfaceSize,worldViewTiles} from './world-view-camera.js';
import {worldViewFogPixels} from './world-view-fog.js';

export function canOpenWorldView(game) {
  return game.mode==='world'&&!game.ui.blocked&&!game.transition&&!game.battle&&!game.state.recruitmentWalk;
}

// An existing custom movement/interaction binding takes priority over R.
export function worldViewShortcut(settings) {
  return ['up','left','down','right','interact'].some(action=>settings.keys?.[action]?.toLowerCase()==='r')?'':'r';
}

// A paused overview of the current scene. Camera, fog and expedition state stay
// intact underneath; the temporary canvas is released on close, never saved.
export function mountWorldView(game) {
  const root=document.createElement('section');
  root.className='world-view';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label','Full world view');
  const screen=artSurface(W,H),ctx=screen.getContext('2d');
  screen.setAttribute('aria-hidden','true');root.append(screen);
  const chrome=document.createElement('div');
  chrome.innerHTML='<header><div><strong></strong><small>World view · paused</small></div><button type="button">Return to play <kbd>R / Esc</kbd></button></header><p aria-live="polite"></p>';
  root.append(chrome);document.querySelector('#game').append(root);
  const back=root.querySelector('button'),status=root.querySelector('p');
  let session=null,raf=0,previousFocus=null,inertElements=[];

  function tile(camera) {
    const {scene,state,actors,time,scratch}=session,c=scratch.getContext('2d');
    c.clearRect(0,0,W,H);
    Art.drawWorld(c,scene,camera,time,state);
    for(const actor of actors)Art.drawHero(c,actor.id,actor.x-camera.x,actor.y-camera.y,{facing:actor.facing,time});
    Art.drawForeground(c,scene,camera,time,state,actors);
    return scratch;
  }
  function draw(progress) {
    const {scene,start,image,state}=session,camera=worldViewCamera(scene,start,progress);
    ctx.fillStyle='#101c20';ctx.fillRect(0,0,W,H);
    ctx.drawImage(image,-camera.x*camera.zoom,-camera.y*camera.zoom,scene.width*camera.zoom,scene.height*camera.zoom);
    drawFog(camera);
    // Keep the expedition's position findable even when the party is tiny.
    if(progress>.8){
      const x=(state.x-camera.x)*camera.zoom,y=(state.y-camera.y)*camera.zoom;
      ctx.save();ctx.globalAlpha=(progress-.8)/.2;ctx.strokeStyle='#ffba79';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
  function drawFog(camera) {
    const {scene,fog}=session,zoom=camera.zoom??1;
    const x=-camera.x*zoom,y=-camera.y*zoom,w=scene.width*zoom,h=scene.height*zoom;
    if(fog)ctx.drawImage(fog,x,y,w,h);
    ctx.save();ctx.strokeStyle='#80918c55';ctx.lineWidth=.75;ctx.strokeRect(x,y,w,h);ctx.restore();
  }
  function close() {
    if(!session)return;
    cancelAnimationFrame(raf);raf=0;
    session.image.width=session.image.height=0;
    session.scratch.width=session.scratch.height=0;
    if(session.fog)session.fog.width=session.fog.height=0;
    session=null;root.hidden=true;ctx.clearRect(0,0,W,H);
    game.keys.clear();
    for(const [element,wasInert] of inertElements)element.inert=wasInert;
    inertElements=[];
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
  }
  function animate(now) {
    if(!session)return;
    const progress=game.state.settings.reducedMotion?1:Math.min(1,(now-session.started)/450);
    draw(progress);
    if(progress<1)raf=requestAnimationFrame(animate);
  }
  function prepare() {
    if(!session)return;
    try{
      // Yield between viewports so R/Escape can cancel preparation.
      const next=session.tiles.next();
      if(!next.done){
        const t=next.value,{image,scene}=session,sx=image.width/scene.width,sy=image.height/scene.height;
        image.getContext('2d').drawImage(tile(t),0,0,t.width*RENDER_SCALE,t.height*RENDER_SCALE,t.x*sx,t.y*sy,t.width*sx,t.height*sy);
        raf=requestAnimationFrame(prepare);return;
      }
      status.textContent=(session.fog?'Explored terrain':'Full map')+' · the amber ring marks your party';
      session.started=performance.now();raf=requestAnimationFrame(animate);
    }catch(error){game.log('world_view_error',{message:error.message});close();}
  }
  function open({revealAll=false}={}) {
    if(session||!canOpenWorldView(game))return false;
    const scene=game.scene,size=worldViewSurfaceSize(scene),image=document.createElement('canvas');
    image.width=size.width;image.height=size.height;artContext(image.getContext('2d'));
    session={scene,image,fog:null,state:game.visualState,start:{...game.camera},time:game.visualTime,scratch:artSurface(W,H),tiles:worldViewTiles(scene),actors:[{id:'kaida',x:game.state.x,y:game.state.y,facing:game.state.facing},...game.followers].sort((a,b)=>a.y-b.y)};
    game.audio.unlock();game.keys.clear();game.movePath=[];game.moving=false;
    game.ui.positionInteraction();
    previousFocus=document.activeElement;
    inertElements=[...document.querySelector('#game').children].filter(element=>element!==root&&element.id!=='dev-tools').map(element=>[element,element.inert]);
    for(const [element] of inertElements)element.inert=true;
    root.hidden=false;root.querySelector('strong').textContent=scene.name;
    back.querySelector('kbd').textContent=worldViewShortcut(game.state.settings)?'R / Esc':'Esc';
    status.textContent='Preparing world view…';back.focus({preventScroll:true});
    try{
      if(!revealAll){
        const pixels=worldViewFogPixels(scene,game.state),fog=session.fog=document.createElement('canvas');
        fog.width=pixels.width;fog.height=pixels.height;
        const c=fog.getContext('2d'),data=c.createImageData(fog.width,fog.height);
        data.data.set(pixels.data);c.putImageData(data,0,0);
      }
      ctx.drawImage(tile(session.start),0,0,W,H);drawFog(session.start);
      raf=requestAnimationFrame(prepare);
    }
    catch(error){game.log('world_view_error',{message:error.message});close();return false;}
    return true;
  }
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  back.addEventListener('click',close);
  return {
    get open(){return !!session;},openView:open,close,
    handleKey(event){
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
      const shortcut=worldViewShortcut(game.state.settings);
      const isShortcut=!!shortcut&&event.key.toLowerCase()===shortcut;
      if(!session){
        if(!isShortcut||!canOpenWorldView(game)||event.target?.closest?.('input,textarea,select,[contenteditable]'))return false;
        event.preventDefault();if(!event.repeat)open();return true;
      }
      // Keep the local dev panel operable above the overview.
      if((event.code==='Backquote'||event.key==='`')&&game.devTools)return false;
      if(event.key==='Escape'||isShortcut){
        event.preventDefault();if(!event.repeat)close();
      }else if(event.key==='Tab'){event.preventDefault();back.focus({preventScroll:true});}
      else if(!['Enter',' '].includes(event.key)||event.repeat)event.preventDefault();
      return true;
    },
    dispose(){close();root.remove();screen.width=screen.height=0;},
  };
}
