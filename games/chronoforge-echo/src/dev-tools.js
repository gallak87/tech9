import './dev-tools.css';
import {TIERS} from './content.js';
import {TOWN_CENTERS,townCenterPreviewBounds} from './town-center-art.js';
import {VIEW_WIDTH,VIEW_HEIGHT} from './rendering.js';
import {ArtPreview} from './dev-preview.js';
import {mountUpgradeTour} from './dev-upgrade-tour.js';
import {localDevHost,localDevPreviewRequested,devPreviewReady} from './dev-access.js';

// Imported only by Vite's development branch. Overrides live in this closure,
// never on game.state, so checkpoints, manual saves and exports keep real data.
export function mountDevTools(game) {
  if(!localDevHost(window.location))return null;
  const preview=new ArtPreview();
  let previousFocus=null,previousCamera=null,autoOpenPending=localDevPreviewRequested(window.location);
  const root=document.createElement('div');
  root.id='dev-tools';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-label','Temporary art preview');
  root.innerHTML=`
    <header><strong>Art preview</strong><button type="button" data-preview="close" aria-label="Close art preview">×</button></header>
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
    <section class="dev-upgrade-controls" aria-label="Haventide upgrade rehearsal">
      <strong>Upgrade from inside Haventide</strong>
      <p>Choose a step, then press Upgrade at the indoor desk.</p>
      <div>${[1,2,3].map(level=>`<button type="button" data-upgrade="${level}" aria-label="Rehearse Haventide upgrade from level ${level} to ${level+1}">${level} → ${level+1}</button>`).join('')}</div>
      <p class="dev-upgrade-availability"></p>
    </section>
    <footer>Art only at Haventide · no travel or discovery<br>Play paused · preview never saved<br>1–4 / ← → select · &#96; / Esc close and restore</footer>`;
  document.querySelector('#game').append(root);
  const upgradeTour=mountUpgradeTour(game,{onReturnToPlay:()=>setOpen(false)});

  const actual=()=>Math.max(1,Math.min(4,game.state.buildings.town_center||1));
  const current=()=>preview.townCenterLevel??actual();
  const indoors=()=>game.mode==='world'&&game.scene.id==='haventide_town';
  const canRehearse=()=>game.mode==='world'&&['haventide','haventide_town'].includes(game.scene.id)&&!game.transition&&!game.state.recruitmentWalk;
  function render() {
    const selected=current(),town=TOWN_CENTERS.find(t=>t.region===preview.townCenterRegion),f=town.metadata.frames[selected-1];
    root.querySelector('.dev-subtitle').textContent=indoors()?'Haventide · Town hall interior':`${town.name} · Town center`;
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
    if(!value)upgradeTour.close();
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
  }
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.town)setTown(button.dataset.town);
    else if(button.dataset.tier)setLevel(Number(button.dataset.tier));
    else if(button.dataset.upgrade&&canRehearse())upgradeTour.openPreview(Number(button.dataset.upgrade));
    else switch(button.dataset.preview){
      case 'previous':cycle(-1);break;
      case 'next':cycle(1);break;
      case 'restore':preview.resetSelection();render();break;
      case 'close':setOpen(false);break;
    }
  });
  const api={
    get open(){return preview.open;},
    visualState(state){return preview.visualState(state);},
    update(){if(autoOpenPending&&devPreviewReady(game))setOpen(true);},
    reset(){setOpen(false);preview.setOpen(false);autoOpenPending=localDevPreviewRequested(window.location);},
    handleKey(event){
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
        event.preventDefault();const buttons=[...root.querySelectorAll('button:not(:disabled)')];
        const index=buttons.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus();return true;
      }
      // Native Enter/Space button activation still works; game bindings do not.
      if(event.key===' '&&!root.contains(document.activeElement))event.preventDefault();
      return true;
    },
    dispose(){setOpen(false);autoOpenPending=false;upgradeTour.dispose();root.remove();},
  };
  if(import.meta.hot)import.meta.hot.dispose(()=>api.dispose());
  return api;
}
