import './dev-tools.css';
import {TIERS} from './content.js';
import {TOWN_CENTERS,townCenterPreviewBounds} from './town-center-art.js';
import {VIEW_WIDTH,VIEW_HEIGHT} from './rendering.js';
import {ArtPreview} from './dev-preview.js';
import {WorldTravelPreview} from './dev-world-travel.js';
import {mountWorldView} from './dev-world-view.js';
import {REGIONS} from './world.js';
import {mountUpgradeTour} from './dev-upgrade-tour.js';
import {localDevHost,localDevPreviewRequested,devPreviewReady} from './dev-access.js';

// Imported only by Vite's development branch. Art overrides stay in this
// closure; world travel uses an isolated expedition with the original as save source.
export function mountDevTools(game) {
  if(!localDevHost(window.location))return null;
  const preview=new ArtPreview();
  const worlds=new WorldTravelPreview(game);
  let previousFocus=null,previousCamera=null,autoOpenPending=localDevPreviewRequested(window.location);
  const root=document.createElement('div');
  root.id='dev-tools';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-label','Local development tools');
  root.innerHTML=`
    <header><strong>Dev tools</strong><button type="button" data-preview="close" aria-label="Close dev tools">×</button></header>
    <section class="dev-world-controls" aria-label="Temporary world exploration">
      <button type="button" class="dev-world-toggle" data-preview="worlds" role="switch" aria-checked="false">Worlds explored <span>Off</span></button>
      <p class="dev-world-status"></p>
      <div class="dev-world-buttons" hidden>${Object.values(REGIONS).map(region=>`<button type="button" data-world="${region.id}">${region.name}</button>`).join('')}</div>
      <button type="button" class="dev-world-view-button" data-preview="world-view">World view <span>↗</span></button>
      <p>Fly out to see the full current map. Play stays paused.</p>
    </section>
    <strong>Art preview</strong>
    <p class="dev-subtitle"></p>
    <div class="dev-town-buttons" role="group" aria-label="Town artwork to preview at Haventide">
      ${TOWN_CENTERS.map(town=>`<button type="button" data-town="${town.region}" aria-pressed="false">${town.name}</button>`).join('')}
    </div>
    <div class="dev-tier-buttons" role="group" aria-label="Preview town center level">
      ${TIERS.map((name,i)=>`<button type="button" data-tier="${i+1}" aria-label="Preview level ${i+1}: ${name}" aria-pressed="false">${i+1}</button>`).join('')}
    </div>
    <div class="dev-cycle"><button type="button" data-preview="previous" aria-label="Previous town center level">←</button><output aria-live="polite"></output><button type="button" data-preview="next" aria-label="Next town center level">→</button></div>
    <p class="dev-size"></p>
    <button type="button" class="dev-restore" data-preview="restore">Use actual Haventide</button>
    <p class="dev-status"></p>
    <section class="dev-upgrade-controls" aria-label="Selected town upgrade rehearsal">
      <strong>Upgrade from inside the selected hall</strong>
      <p>Choose a step, then press Upgrade at the indoor desk.</p>
      <div>${[1,2,3].map(level=>`<button type="button" data-upgrade="${level}" aria-label="Rehearse selected town upgrade from level ${level} to ${level+1}">${level} → ${level+1}</button>`).join('')}</div>
      <p class="dev-upgrade-availability"></p>
    </section>
    <footer>Play paused while this panel is open<br>1–4 / ← → select art · &#96; / Esc close<br>World preview stays on until switched off.</footer>`;
  document.querySelector('#game').append(root);
  const worldBadge=document.createElement('button');
  worldBadge.id='dev-world-preview';worldBadge.type='button';worldBadge.hidden=true;
  worldBadge.textContent='World preview · never saved · return to expedition';
  document.querySelector('#game').append(worldBadge);
  const upgradeTour=mountUpgradeTour(game,{onReturnToPlay:()=>setOpen(false)});
  const worldView=mountWorldView(game,{onClose:()=>{root.hidden=!preview.open;renderWorldControls();}});

  const actual=()=>Math.max(1,Math.min(4,game.state.buildings.town_center||1));
  const current=()=>preview.townCenterLevel??actual();
  const indoors=()=>game.mode==='world'&&game.scene.id==='haventide_town';
  const canRehearse=()=>game.mode==='world'&&['haventide','haventide_town'].includes(game.scene.id)&&!game.transition&&!game.state.recruitmentWalk;
  function renderWorldControls() {
    const toggle=root.querySelector('.dev-world-toggle');
    toggle.setAttribute('aria-checked',String(worlds.active));
    toggle.querySelector('span').textContent=worlds.active?'On':'Off';
    toggle.disabled=!worlds.active&&!worlds.canEnable;
    root.querySelector('.dev-world-status').textContent=worlds.active
      ?'All eight maps revealed. Jump here or in Menu → Map. Turning off restores your original location and progress; saves use the real expedition.'
      :worlds.canEnable?'Temporarily reveal every map and jump past story gates. Your expedition stays unchanged.':'Return to exploration to enable world preview.';
    root.querySelector('.dev-world-buttons').hidden=!worlds.active;
    root.querySelector('[data-preview="world-view"]').disabled=!devPreviewReady(game)||!!game.battle||upgradeTour.open;
    for(const button of root.querySelectorAll('[data-world]'))button.disabled=!worlds.canJump||upgradeTour.open;
    worldBadge.hidden=!worlds.active||preview.open||worldView.open||upgradeTour.open||!!game.upgradeTour?.open;
  }
  function render() {
    renderWorldControls();
    const selected=current(),town=TOWN_CENTERS.find(t=>t.region===preview.townCenterRegion),f=town.metadata.frames[selected-1];
    root.querySelector('.dev-subtitle').textContent=indoors()?`${town.name} · Town hall interior`:`${town.name} · Town center`;
    root.querySelector('output').textContent=`${selected} · ${TIERS[selected-1]}`;
    root.querySelector('.dev-size').textContent=indoors()?'Restoration art · fixed service positions':`${f.nativeWidth} × ${Math.round(f.h*f.nativeWidth/f.w)} world units`;
    root.querySelector('.dev-status').textContent=(preview.townCenterLevel===null?`Actual level ${actual()}.`:`Preview level ${selected}; actual level ${actual()}.`)+((game.scene.id==='haventide'||indoors())&&game.mode==='world'?'':' View from Haventide or its town hall.');
    for(const button of root.querySelectorAll('[data-upgrade]'))button.disabled=!canRehearse();
    root.querySelector('.dev-upgrade-availability').textContent=canRehearse()?'Exterior → restored hall → desk.':'Available while standing in Haventide or its town hall.';
    root.querySelector('[data-preview="restore"]').disabled=preview.townCenterLevel===null&&preview.townCenterRegion==='haventide';
    for(const button of root.querySelectorAll('[data-town]'))button.setAttribute('aria-pressed',String(button.dataset.town===preview.townCenterRegion));
    for(const button of root.querySelectorAll('[data-tier]'))button.setAttribute('aria-pressed',String(Number(button.dataset.tier)===selected));
    game.ui.positionInteraction();
  }
  function setLevel(value) {preview.selectTownCenter(value);render();}
  function setTown(value) {preview.selectTown(value);render();}
  function cycle(delta) {setLevel((current()-1+delta+4)%4+1);}
  function setOpen(value) {
    if(value===preview.open)return;
    autoOpenPending=false;
    if(!value){worldView.close();upgradeTour.close();}
    preview.setOpen(value);root.hidden=!preview.open;
    game.keys.clear();game.movePath=[];game.moving=false;
    if(preview.open){
      previousFocus=document.activeElement;previousCamera={...game.camera};
      // Frame all sixteen extents once, so neither the player nor the camera
      // moves when switching towns or tiers. Camera is not save data.
      const entrance=game.mode==='world'&&game.scene.objects.find(o=>o.id==='haventide_entrance');
      if(entrance){
        const bounds=townCenterPreviewBounds(entrance);
        game.camera.x=Math.max(0,Math.min(game.scene.width-VIEW_WIDTH,bounds.left+bounds.width/2-VIEW_WIDTH*.61));
        game.camera.y=Math.max(0,Math.min(game.scene.height-VIEW_HEIGHT,bounds.top-60));
      }
      render();root.querySelector(`[data-tier="${current()}"]`).focus({preventScroll:true});
    }else{
      if(previousCamera)Object.assign(game.camera,previousCamera);previousCamera=null;
      game.ui.positionInteraction();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
    }
    renderWorldControls();
  }
  function restoreWorld() {
    if(!worlds.restore())return;
    game.resetSession();
    autoOpenPending=false;
    game.battle=null;game.mode='world';game.audio.set(game.state.settings);
    game.resetFollowers();game.updateCamera(true);game.ui.render();renderWorldControls();
  }
  function jumpWorld(id) {
    if(upgradeTour.open||!worlds.jump(id))return false;
    setOpen(false);
    game.ui.menu=false;game.ui.panel=null;game.ui.notice='';game.ui.render();
    return true;
  }
  worldBadge.addEventListener('pointerdown',event=>event.stopPropagation());
  worldBadge.addEventListener('click',event=>{event.stopPropagation();restoreWorld();});
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.world)jumpWorld(button.dataset.world);
    else if(button.dataset.town)setTown(button.dataset.town);
    else if(button.dataset.tier)setLevel(Number(button.dataset.tier));
    else if(button.dataset.upgrade&&canRehearse())upgradeTour.openPreview(Number(button.dataset.upgrade),preview.townCenterRegion);
    else switch(button.dataset.preview){
      case 'previous':cycle(-1);break;
      case 'next':cycle(1);break;
      case 'restore':preview.resetSelection();render();break;
      case 'worlds':if(worlds.active){restoreWorld();setOpen(true);}else if(worlds.enable()){game.ui.render();render();}break;
      case 'world-view':if(worldView.openView())root.hidden=true;break;
      case 'close':setOpen(false);break;
    }
  });
  const api={
    get open(){return preview.open;},
    get worldsExplored(){return worlds.active;},
    saveSource(){return worlds.saveSource();},
    jumpWorld,
    visualState(state){return preview.visualState(state);},
    update(){if(autoOpenPending&&devPreviewReady(game))setOpen(true);worldBadge.hidden=!worlds.active||preview.open||upgradeTour.open||!!game.upgradeTour?.open;},
    reset(){setOpen(false);preview.setOpen(false);worlds.restore();renderWorldControls();autoOpenPending=localDevPreviewRequested(window.location);},
    handleKey(event){
      if(worldView.handleKey(event))return true;
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
      const editable=event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"]');
      if(!preview.open&&editable)return false;
      if(event.code==='Backquote'||event.key==='`'){
        event.preventDefault();if(!event.repeat)setOpen(!preview.open);return true;
      }
      if(!preview.open)return false;
      if(upgradeTour.handleKey(event))return true;
      if(event.key==='Escape'){event.preventDefault();setOpen(false);return true;}
      if(/^[1-4]$/.test(event.key)){event.preventDefault();if(!event.repeat)setLevel(Number(event.key));return true;}
      if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(!event.repeat)cycle(event.key==='ArrowLeft'?-1:1);return true;}
      if(event.key==='Tab'){
        event.preventDefault();const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
        const index=buttons.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus();return true;
      }
      // Native Enter/Space button activation still works; game bindings do not.
      if(event.key===' '&&!root.contains(document.activeElement))event.preventDefault();
      return true;
    },
    dispose(){worldView.close();restoreWorld();setOpen(false);autoOpenPending=false;upgradeTour.dispose();worldView.dispose();root.remove();worldBadge.remove();},
  };
  if(import.meta.hot)import.meta.hot.dispose(()=>api.dispose());
  return api;
}
