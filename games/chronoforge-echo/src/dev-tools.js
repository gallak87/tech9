import './dev-tools.css';
import {TIERS} from './content.js';
import {TOWN_CENTERS,townCenterPreviewBounds} from './town-center-art.js';
import {VIEW_WIDTH,VIEW_HEIGHT} from './rendering.js';
import {ArtPreview} from './dev-preview.js';
import {WorldTravelPreview} from './dev-world-travel.js';
import {REGIONS} from './world.js';
import {mountUpgradeTour} from './dev-upgrade-tour.js';
import {localDevHost,localDevPreviewRequested,devPreviewReady} from './dev-access.js';

// Only imported in local development. Panel visibility is explicit: menus,
// travel and cinematics disable conflicting controls without closing it.
export function mountDevTools(game) {
  if(!localDevHost(window.location))return null;
  const preview=new ArtPreview(),worlds=new WorldTravelPreview(game);
  let previousFocus=null,previousCamera=null,previousScene=null,availability='',mapExplored=false,autoOpenPending=localDevPreviewRequested(window.location);
  const root=document.createElement('div');
  root.id='dev-tools';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-label','Local development tools');
  root.innerHTML=`
    <header><strong>Dev tools</strong><button type="button" data-preview="close" aria-label="Close dev tools">×</button></header>
    <section class="dev-world-controls" aria-label="Temporary world exploration">
      <div class="dev-world-row">
        <button type="button" class="dev-world-toggle" data-preview="map" role="switch" aria-checked="false">Map explored <span>Off</span></button>
        <button type="button" data-preview="world-view">World view ↗</button>
      </div>
      <div class="dev-world-jumps" role="group" aria-label="Jump to a world">${Object.values(REGIONS).map(region=>`<button type="button" data-world="${region.id}">${region.name}</button>`).join('')}</div>
      <p class="dev-world-status"></p>
      <button type="button" class="dev-world-return" data-preview="return-world" hidden>Return to expedition</button>
    </section>
    <section class="dev-art-controls" aria-label="Town artwork">
      <div class="dev-town-row"><label for="dev-town-select">Town</label><select id="dev-town-select" data-town-select>${TOWN_CENTERS.map(town=>`<option value="${town.region}">${town.name}</option>`).join('')}</select><button type="button" data-preview="restore">Reset art</button></div>
      <div class="dev-tier-buttons" role="group" aria-label="Preview town level">${TIERS.map((name,i)=>`<button type="button" data-tier="${i+1}" aria-label="Preview level ${i+1}: ${name}" aria-pressed="false">${i+1}</button>`).join('')}</div>
      <div class="dev-level-summary"><output aria-live="polite"></output><span class="dev-size"></span></div>
      <button type="button" class="dev-upgrade-button" data-preview="upgrade"></button>
      <p class="dev-status"></p>
    </section>
    <footer><span class="dev-pause-status"></span> · never saved<br>1–4 / ← → levels · &#96; / Esc close</footer>`;
  document.querySelector('#game').append(root);
  const worldBadge=document.createElement('button');
  worldBadge.id='dev-world-preview';worldBadge.type='button';worldBadge.hidden=true;
  worldBadge.textContent='World preview · never saved · return to expedition';
  document.querySelector('#game').append(worldBadge);
  const upgradeTour=mountUpgradeTour(game,{onReturnToPlay:()=>render()});
  const worldView=game.worldView;
  const actual=()=>Math.max(1,Math.min(4,game.state.buildings.town_center||1));
  const current=()=>preview.townCenterLevel??actual();
  const indoors=()=>game.mode==='world'&&game.scene.id==='haventide_town';
  const busy=()=>game.ui.blocked||!!game.transition||upgradeTour.open||worldView.open||!!game.state.recruitmentWalk;
  const canArt=()=>!busy()&&game.mode==='world'&&['haventide','haventide_town'].includes(game.scene.id);
  function render() {
    const blocked=busy(),art=canArt(),selected=current(),town=TOWN_CENTERS.find(t=>t.region===preview.townCenterRegion),frame=town.metadata.frames[selected-1];
    const toggle=root.querySelector('[data-preview="map"]');
    toggle.setAttribute('aria-checked',String(mapExplored));
    toggle.querySelector('span').textContent=mapExplored?'On':'Off';
    toggle.disabled=blocked||game.mode!=='world'||!!game.battle;
    root.querySelector('[data-preview="world-view"]').disabled=blocked||!devPreviewReady(game)||!!game.battle;
    for(const button of root.querySelectorAll('[data-world]'))button.disabled=blocked||!worlds.canJump;
    const returnButton=root.querySelector('[data-preview="return-world"]');
    returnButton.hidden=!worlds.active;returnButton.disabled=blocked||game.mode!=='world'||!!game.battle;
    root.querySelector('.dev-world-status').textContent=worlds.active?'Temporary trip · saves keep your real expedition.':'Click a world to jump · story gates bypassed.';
    const select=root.querySelector('[data-town-select]');select.value=preview.townCenterRegion;select.disabled=!art;
    root.querySelector('output').textContent=selected+' · '+TIERS[selected-1];
    root.querySelector('.dev-size').textContent=indoors()?'Interior':frame.nativeWidth+' × '+Math.round(frame.h*frame.nativeWidth/frame.w);
    for(const button of root.querySelectorAll('[data-tier]')){
      button.disabled=!art;button.setAttribute('aria-pressed',String(Number(button.dataset.tier)===selected));
    }
    root.querySelector('[data-preview="restore"]').disabled=!art||(preview.townCenterLevel===null&&preview.townCenterRegion==='haventide');
    const from=Math.min(3,selected),upgrade=root.querySelector('[data-preview="upgrade"]');
    upgrade.textContent='Preview upgrade '+from+' → '+(from+1);upgrade.disabled=!art;
    root.querySelector('.dev-status').textContent=art?'Inside → exterior → restored hall · actual level '+actual():blocked?'Controls paused during menus and reveals.':'Town art previews are available in Haventide.';
    root.querySelector('.dev-pause-status').textContent=game.transition?'Traveling':blocked?'Controls paused':'Play paused';
    worldBadge.hidden=!worlds.active||preview.open||upgradeTour.open||!!game.upgradeTour?.open;
    game.ui.positionInteraction();
  }
  function setLevel(value){if(canArt()){preview.selectTownCenter(value);render();}}
  function cycle(delta){setLevel((current()-1+delta+4)%4+1);}
  function setOpen(value) {
    if(value===preview.open)return;
    autoOpenPending=false;
    if(!value){worldView.close();upgradeTour.close();}
    preview.setOpen(value);root.hidden=!preview.open;
    game.keys.clear();game.movePath=[];game.moving=false;
    if(preview.open){
      previousFocus=document.activeElement;previousCamera={...game.camera};previousScene=game.scene.id;
      const entrance=game.mode==='world'&&!game.ui.blocked&&game.scene.objects.find(o=>o.id==='haventide_entrance');
      if(entrance){
        const bounds=townCenterPreviewBounds(entrance);
        game.camera.x=Math.max(0,Math.min(game.scene.width-VIEW_WIDTH,bounds.left+bounds.width/2-VIEW_WIDTH*.61));
        game.camera.y=Math.max(0,Math.min(game.scene.height-VIEW_HEIGHT,bounds.top-60));
      }
      render();root.querySelector('[data-preview="close"]').focus({preventScroll:true});
    }else{
      if(previousCamera&&previousScene===game.scene.id)Object.assign(game.camera,previousCamera);
      previousCamera=null;previousScene=null;
      game.ui.positionInteraction();
      if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
    }
    render();
  }
  function restoreWorld() {
    if(!worlds.restore())return;
    const stayOpen=preview.open,keepMapExplored=mapExplored;
    game.resetSession();autoOpenPending=false;
    mapExplored=keepMapExplored;
    game.battle=null;game.mode='world';game.audio.set(game.state.settings);
    game.resetFollowers();game.updateCamera(true);game.ui.render();
    if(stayOpen)setOpen(true);
    render();
  }
  function jumpWorld(id) {
    if(upgradeTour.open||worldView.open||!worlds.jump(id))return false;
    previousCamera=null;
    game.ui.menu=false;game.ui.panel=null;game.ui.notice='';game.ui.render();render();
    return true;
  }
  worldBadge.addEventListener('pointerdown',event=>event.stopPropagation());
  worldBadge.addEventListener('click',event=>{event.stopPropagation();restoreWorld();});
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-town-select]')&&canArt()){preview.selectTown(event.target.value);render();}
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.tier){setLevel(Number(button.dataset.tier));return;}
    if(button.dataset.world){if(!busy())jumpWorld(button.dataset.world);return;}
    switch(button.dataset.preview){
      case 'restore':if(canArt()){preview.resetSelection();render();}break;
      case 'map':if(!busy()){mapExplored=!mapExplored;game.ui.render();render();}break;
      case 'return-world':if(!busy())restoreWorld();break;
      case 'world-view':if(!busy()){worldView.openView();render();}break;
      case 'upgrade':if(canArt()){upgradeTour.openPreview(Math.min(3,current()),preview.townCenterRegion);render();}break;
      case 'close':setOpen(false);break;
    }
  });
  const api={
    get open(){return preview.open;},
    get paused(){return preview.open&&!game.transition;},
    get mapExplored(){return mapExplored;},
    get worldPreviewActive(){return worlds.active;},
    saveSource(){return worlds.saveSource();},jumpWorld,
    visualState(state){return preview.visualState(state);},
    update(){
      if(autoOpenPending&&devPreviewReady(game))setOpen(true);
      const key=[game.scene.id,game.mode,game.ui.blocked,!!game.transition,upgradeTour.open,worldView.open,!!game.state.recruitmentWalk,worlds.active,mapExplored].join(':');
      if(availability!==key){availability=key;render();}
    },
    reset(){
      const wasOpen=preview.open;
      worldView.close();upgradeTour.close();preview.resetSelection();worlds.restore();
      mapExplored=false;
      previousCamera=null;previousScene=null;availability='';render();
      autoOpenPending=!wasOpen&&localDevPreviewRequested(window.location);
    },
    handleKey(event){
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
      const editable=event.target instanceof Element&&event.target.closest('input,textarea,[contenteditable="true"]');
      if(!preview.open&&editable)return false;
      if(event.code==='Backquote'||event.key==='`'){
        event.preventDefault();if(!event.repeat)setOpen(!preview.open);return true;
      }
      if(!preview.open)return false;
      if(worldView.handleKey(event)||upgradeTour.handleKey(event))return true;
      // An open menu owns its shortcuts; the visible panel stays put.
      if(game.ui.blocked||game.transition)return false;
      if(event.key==='Escape'){event.preventDefault();setOpen(false);return true;}
      if(event.target instanceof Element&&event.target.matches('select')&&event.key!=='Tab')return true;
      if(/^[1-4]$/.test(event.key)){event.preventDefault();if(!event.repeat)setLevel(Number(event.key));return true;}
      if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(!event.repeat)cycle(event.key==='ArrowLeft'?-1:1);return true;}
      if(event.key==='Tab'){
        event.preventDefault();const controls=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(control=>!control.closest('[hidden]'));
        const index=controls.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
        controls[next].focus();return true;
      }
      if(event.key===' '&&!root.contains(document.activeElement))event.preventDefault();
      return true;
    },
    dispose(){
      worldView.close();upgradeTour.close();restoreWorld();setOpen(false);autoOpenPending=false;
      upgradeTour.dispose();root.remove();worldBadge.remove();
    },
  };
  if(import.meta.hot)import.meta.hot.dispose(()=>api.dispose());
  return api;
}
