import { battleIntent, battleView } from './combat.js';
import { drawPortrait } from './art.js';
import './battle.css';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const pct = value => `${Math.max(0, Math.min(100, value))}%`;
const commandNotes = {
  Attack: 'One precise strike. Catch the timing window to raise critical chance.',
  Tech: 'Learned techniques, healing and coordinated attacks. Each participant must be ready.',
  Defend: 'Reduce damage by 65% until your next action. Catch the timing window for a 75% critical guard.',
  Item: 'Use a shared field supply on a companion.',
  Retreat: 'Withdraw from this encounter. No supplies are spent.',
};
const signs = { Attack:'↗', Tech:'∿', Defend:'⊏', Item:'+', Retreat:'↶' };
const portrait = id => `<canvas width="96" height="96" data-battle-portrait="${esc(id)}" aria-hidden="true"></canvas>`;
const status = h => h.hp <= 0 ? 'DOWN' : h.guarding ? h.criticalGuard ? 'CRIT GUARD' : 'GUARD' : h.shield ? `WARD ${h.shield}` : h.slowTurns ? 'SLOWED' : '';
const button = (kind, body, attrs = '', classes = '') => `<button type="button" class="${classes}" data-battle-intent="${kind}" ${attrs}>${body}</button>`;

// Presentation reads the combat state; only combat.js advances time or commits
// choices. No interval, UI animation, or DOM lifecycle can charge an ATB gauge.
export class BattleUI {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('section');
    this.root.id = 'battle-interface';
    this.root.setAttribute('aria-label', 'Battle commands');
    this.root.hidden = true;
    document.querySelector('#overlay').before(this.root);
    this.signature = '';
    this.root.addEventListener('click', event => {
      const control = event.target.closest('[data-battle-intent]');
      if (!control || control.disabled || this.game.ui.blocked || !this.game.battle) return;
      this.game.audio.unlock();
      const { battleIntent:kind, id, index, stage, direction } = control.dataset;
      const outcome = battleIntent(this.game.battle, this.game.state, { kind, id, index:Number(index), stage:Number(stage), direction:Number(direction) });
      if (outcome === 'pause') this.game.ui.toggleMenu();
      this.render();
    });
  }

  render() {
    const g = this.game, b = g.battle;
    if(g.mode==='battle'&&b?.itemConfirmation&&!g.ui.blocked){
      const pending=b.itemConfirmation;
      g.ui.confirmItemUse(pending.use,()=>{battleIntent(b,g.state,{kind:'item-confirm'});g.ui.render();},{onCancel:()=>battleIntent(b,g.state,{kind:'item-cancel'})});
    }
    const visible = g.mode === 'battle' && b && !g.ui.blocked;
    this.root.hidden = !visible;
    if (!visible) return;
    const v = battleView(b, g.state);
    const heroAction = v.action?.side === 'hero';
    const incoming = v.action?.side === 'enemy' && v.action.timingEligible;
    const defending = incoming || v.action?.kind === 'defend';
    const stage = heroAction || incoming ? 3 : v.mode === 'target' ? 2 : ['command', 'tech', 'item'].includes(v.mode) ? 1 : 0;
    const actor = v.heroes.find(h => h.id === (incoming ? v.action.targets[0] : heroAction ? v.action.participants[0] : v.focusHero)) || v.heroes[0];
    // A static subtree is rebuilt only when a choice or combat event changes.
    // ATB and timing values are patched below, keeping pointer targets stable.
    const signature = JSON.stringify([stage,v.mode,v.selectedHero,v.focusHero,v.readyQueue,v.cursor,v.target,v.pending,v.action?.id,v.action?.resolved,v.action?.timingAttempted,v.action?.timingSuccess,v.action?.critical,v.result,
      v.heroes.map(h=>[h.id,h.hp,h.mp,h.shield,h.guarding,h.criticalGuard,h.slowTurns]),v.enemies.map(e=>[e.uid,e.hp,e.shield,e.charging,e.bossPhase]),
      v.techs,v.items,b.noticeTime > 0 ? b.notice : '',g.state.settings.reducedMotion]);
    this.root.dataset.stage = stage;
    this.root.dataset.timingSide = incoming ? 'defense' : heroAction ? defending ? 'defense' : 'attack' : '';
    this.root.classList.toggle('cb-reduced', Boolean(g.state.settings.reducedMotion));
    this.root.classList.toggle('cb-waiting', !v.selectedHero && stage === 0);
    this.root.classList.toggle('cb-busy', Boolean(v.action || v.result));
    if (signature !== this.signature || this.battle !== b) {
      this.signature = signature; this.battle = b;
      const focused = this.root.contains(document.activeElement);
      const selectedAction = incoming ? 'Defend' : v.pending?.name || (heroAction ? v.action.name : v.commands[v.cursor]?.name || 'Action');
      const targets = heroAction || incoming ? v.action.targets.map(id=>v.heroes.find(h=>h.id===id)||v.enemies.find(e=>e.uid===id)).filter(Boolean) : v.targets;
      const targetLabel = heroAction ? targets.length > 1 ? `${targets.length} targets` : targets[0]?.name || 'Self' : v.pending?.target?.startsWith('all') ? 'Group' : v.targets[v.target]?.name || 'Target';
      const attacker = incoming ? v.enemies.find(e=>e.uid===v.action.participants[0])?.name || 'Enemy' : '';
      const labels = [incoming && targets.length > 1 ? 'The crew' : actor?.name || 'Crew', selectedAction, incoming ? attacker : targetLabel, 'Timing'];
      const nodeNames = ['Crew','Action','Target','Timing'];
      const title = b.enemies.some(e=>e.id==='void_architect') ? 'The shape of tomorrow' : b.encounter.name || (b.encounter.boss ? 'A signal in the dark' : 'Hold the line');
      const charging = v.enemies.filter(e=>e.hp>0 && e.charging);
      const waitingStatus = v.action?.side === 'enemy' ? `${v.action.name} · enemy action` : v.readyQueue.length ? `${v.readyQueue.length} ready` : 'Gauges charging';
      this.root.innerHTML = `<header class="cb-header"><div><span class="cb-eyebrow">FIELD / ENGAGEMENT</span><h2>${esc(title)}</h2></div><div class="cb-header-right"><span>${v.result ? esc(v.result.toUpperCase()) : stage===1||stage===2 ? 'WAIT · FIELD PAUSED' : 'ATB · LIVE'}</span>${button('pause','<kbd>Esc</kbd> Pause','', 'cb-pause')}</div></header>
        ${charging.length ? `<div class="cb-warning">${esc(charging.map(e=>e.name).join(' / '))} charging · defend or raise a ward</div>` : ''}
        <div class="cb-dock"><div class="cb-path"><span>${['CHOOSE A COMPANION',v.mode==='tech'?'CHOOSE A TECHNIQUE':v.mode==='item'?'CHOOSE A SUPPLY':'CHOOSE AN ACTION','CHOOSE A TARGET',v.action?.timingEligible?defending?'DEFEND TIMING':'ATTACK TIMING':'ACTION IN MOTION'][stage]}</span><span>${incoming?`${esc(attacker)} → ${esc(targets.map(t=>t.name).join(' + '))}`:stage===0?esc(waitingStatus):`${esc(actor.name)}${stage>1?' / '+esc(selectedAction):''}`}</span></div>
          <div class="cb-fold" data-open="${stage}">${nodeNames.map((name,i)=>`<section class="cb-node ${stage===i?'cb-open':''} ${i<stage?'cb-past':''}" data-node="${i}">${button('breadcrumb',`<span class="cb-node-number">0${i+1}</span><span class="cb-node-symbol">${i===0&&stage>0?portrait(actor.id):['≡','↗','⊕','∣'][i]}</span><span class="cb-node-label">${esc(i<stage?labels[i]:name)}</span>`,`data-stage="${i}" aria-label="Back to ${name}" ${i>=stage||v.action||v.result?'disabled':''}`, 'cb-node-tab')}<div class="cb-pane" ${i===stage?'':'hidden'}>${i===0?this.crew(v):i===1?this.actions(v):i===2?this.targets(v):this.timing(v)}</div></section>`).join('')}</div>
          <div class="cb-under">${button('back','← Back',stage===0||v.action?'disabled':'','cb-back')}<span class="cb-context">${esc(b.noticeTime>0?b.notice:stage===0?v.action?'Hold your formation.':v.selectedHero?'Choose a ready companion.':'Waiting for a companion to charge.':stage===1?'Choose an action. Previous choices stay to the left.':stage===2?v.pending?.kind==='retreat'?'Confirm withdrawal, or go back.':'Select a target, then execute.':v.action?.timingEligible?'Fresh press inside the orange window.':'Returning to the crew after this action.')}</span><span class="cb-keys">${stage===3?`<kbd>Space / Enter</kbd> ${defending?'Guard':'Strike'}`:`<kbd>↑ ↓</kbd> Choose <kbd>→ / Enter</kbd> ${stage===2?'Execute':'Confirm'}`}</span></div>
        </div>
        <div class="cb-party-rail">${v.heroes.map(h=>`<div class="cb-party ${v.selectedHero===h.id?'cb-party-active':''} ${h.hp<=0?'cb-down':''}"><span class="cb-party-name">${esc(h.name)}</span><span class="cb-party-values">${h.hp}<small> / ${h.maxHp} HP</small> <span>${h.mp}<small> MP</small></span></span><span class="cb-rail-state" data-rail-state="${h.id}">${esc(status(h))}</span><span class="cb-rail-atb"><i data-atb="${h.id}"></i></span></div>`).join('')}</div>`;
      for (const canvas of this.root.querySelectorAll('[data-battle-portrait]')) drawPortrait(canvas.getContext('2d'),canvas.dataset.battlePortrait,0,0,96);
      this.root.querySelector('.cb-list .cb-selected')?.scrollIntoView({block:'nearest'});
      if (focused) (this.root.querySelector('.cb-open .cb-selected:not(:disabled)') || this.root.querySelector('.cb-open button:not(:disabled)'))?.focus({preventScroll:true});
    }
    for (const h of v.heroes) {
      this.root.querySelectorAll(`[data-atb="${h.id}"]`).forEach(el=>{ el.style.width=pct(h.atb); });
      this.root.querySelectorAll(`[data-charge="${h.id}"]`).forEach(el=>{ el.textContent=h.hp<=0?'DOWN':h.atb>=100?'READY':`${Math.floor(h.atb)}%`; });
      const rail=this.root.querySelector(`[data-rail-state="${h.id}"]`);
      if(rail)rail.textContent=status(h)||(h.atb>=100?'READY':`${Math.floor(h.atb)}%`);
    }
    const action=v.action;
    const timing=this.root.querySelector('.cb-timing');
    if(timing && action) {
      const inWindow=action.timingEligible && !action.timingAttempted && !action.resolved && action.elapsed>=action.windowStart && action.elapsed<=action.windowEnd;
      this.root.classList.toggle('cb-critical-window', inWindow);
      const progress=timing.querySelector('.cb-timing-marker');
      if(progress)progress.style.left=pct(action.elapsed/action.contact*100);
      const elapsed=timing.querySelector('.cb-action-progress i');
      if(elapsed)elapsed.style.width=pct(action.elapsed/action.duration*100);
      const cue=this.root.querySelector('.cb-timing-cue');
      if(cue)cue.textContent=action.timingAttempted?(action.timingSuccess?defending?'CRITICAL GUARD':'TIMING CAUGHT':incoming?'GUARD MISSED':defending?'NORMAL GUARD':'NORMAL STRIKE'):action.resolved?incoming?'CONTACT':defending?'GUARD RAISED':'CONTACT':inWindow?defending?'GUARD NOW':'STRIKE NOW':'WATCH THE MARKER';
    } else this.root.classList.remove('cb-critical-window');
  }

  crew(v) {
    return `<div class="cb-pane-head"><h3>The crew</h3><span>${v.readyQueue.length ? `${v.readyQueue.length} READY` : 'CHARGING'}</span></div><div class="cb-crew">${v.heroes.map(h=>button('hero',`${portrait(h.id)}<span class="cb-crew-copy"><span class="cb-row-title">${esc(h.name)}<small data-charge="${h.id}"></small></span><span class="cb-row-meta">${h.hp} / ${h.maxHp} HP · ${h.mp} MP${status(h)?' · '+esc(status(h)):''}</span><span class="cb-micro-atb"><i data-atb="${h.id}"></i></span></span><span class="cb-chevron">›</span>`,`data-id="${h.id}" ${!v.readyQueue.includes(h.id)||v.action||v.result?'disabled':''} aria-label="${esc(h.name)}, ${v.readyQueue.includes(h.id)?'ready':'charging'}"`,`cb-choice ${v.focusHero===h.id?'cb-selected':''}`)).join('')}</div>`;
  }

  actions(v) {
    const list=v.mode==='tech'?v.techs:v.mode==='item'?v.items:v.commands;
    const current=list[v.cursor];
    const sub=v.mode!=='command';
    return `<div class="cb-pane-head"><h3>${v.mode==='tech'?'Techniques':v.mode==='item'?'Field supplies':'Choose an action'}</h3><span>${sub?`${v.cursor+1} / ${list.length}`:'COMMANDS'}</span></div><div class="cb-action-layout"><div class="cb-list ${sub?'cb-sublist':''}">${list.map((item,i)=>button(sub?'list':'command',`${!sub?`<span class="cb-command-sign">${signs[item.name]}</span>`:''}<span class="cb-row-title">${esc(item.name)}${sub&&item.participants?.length>1?`<small>${esc(item.participants.join(' + '))}</small>`:''}</span><span class="cb-command-cost">${v.mode==='tech'?typeof item.mp==='number'?`${item.mp} MP`:Object.entries(item.mp).map(([id,n])=>`${id} ${n}`).join(' / '):v.mode==='item'?`×${item.count}`:'›'}</span>`,`data-index="${i}" aria-label="${esc(item.name)}${item.unavailable?', '+esc(item.unavailable):''}" aria-disabled="${Boolean(item.unavailable)}"`,`cb-choice ${i===v.cursor?'cb-selected':''} ${item.unavailable?'cb-unavailable':''}`)).join('')}</div><aside class="cb-choice-detail"><strong>${esc(current?.name||'No supplies')}</strong><p>${esc(current?.unavailable||current?.description||commandNotes[current?.name]||'No field supplies remain.')}</p>${current?.participants?.length>1?`<small>${current.participants.length} ready companions required</small>`:''}</aside></div>`;
  }

  targets(v) {
    const group=v.pending?.target?.startsWith('all');
    const retreat=v.pending?.kind==='retreat';
    return `<div class="cb-pane-head"><h3>${esc(v.pending?.name)}</h3><span>${retreat?'WITHDRAW':group?'ALL VALID TARGETS':'SELECT TARGET'}</span></div><div class="cb-target-layout"><div class="cb-list">${v.targets.map((target,i)=>button('target',`<span class="cb-row-title">${retreat?'The crew':esc(target.name)}<small>${retreat?'Return to the road':`${target.hp} / ${target.maxHp} HP`}</small></span><span>${group?'ALL':i===v.target?'●':'○'}</span>`,`data-id="${target.id}"`,`cb-choice ${group||i===v.target?'cb-selected':''}`)).join('')}</div><aside class="cb-target-detail"><p>${retreat?'Leave this encounter and return to the field.':group?`Affects ${v.targets.length} ${v.pending.target==='allAllies'?'companions':'enemies'}.`:'The marked figure will receive this action.'}</p>${button('execute','Execute <span>→</span>','', 'cb-execute')}<small><kbd>Space / Enter</kbd> Execute</small></aside></div>`;
  }

  timing(v) {
    const a=v.action;
    if(!a)return '';
    const incoming=a.side==='enemy', defending=incoming||a.kind==='defend', verb=defending?'Guard':'Strike';
    const inputNotch=Number.isFinite(a.timingPressedAt)?`<i class="cb-input-notch ${a.timingSuccess?'cb-input-caught':''}" style="left:${pct(a.timingPressedAt/a.contact*100)}" role="img" aria-label="Your input at ${Math.round(a.timingPressedAt/a.contact*100)}% of the timing track" title="Your input"></i>`:'';
    const result=incoming?(a.timingSuccess?'Critical guard: 75% less damage from this attack.':a.timingAttempted||a.resolved?'Existing guards and wards still apply.':"Incoming attack. Catch the orange window for 75% less damage."):a.timingSuccess?defending?'Critical guard: 75% less damage until your next action.':'Timing caught. Critical chance raised.':a.timingAttempted?defending?'Normal guard: 65% less damage until your next action.':'Normal strike. Your action continues.':defending?'Catch the orange window for critical guard. A miss still raises normal guard.':a.timingEligible?'Press as the marker crosses the orange window.':'The action is in motion.';
    const title=incoming?(a.timingSuccess?'Critical guard':a.resolved?'Impact':a.timingAttempted?'Guard timing missed':'Brace at the opening.'):a.resolved?defending?a.critical?'Critical guard':'Guard raised':a.critical?'Critical strike':a.timingSuccess?'Timing caught':'Action resolved':defending?'Brace at the opening.':a.timingEligible?'Find the opening.':'Hold the formation.';
    return `<div class="cb-pane-head"><h3>${incoming?'Defend · ':''}${esc(a.name)}</h3><span class="cb-timing-cue">IN MOTION</span></div><div class="cb-timing"><strong>${esc(title)}</strong><p>${esc(result)}</p>${a.timingEligible?button('timing',`<span class="cb-timing-track"><span class="cb-critical-zone" style="left:${pct(a.windowStart/a.contact*100)};width:${pct((a.windowEnd-a.windowStart)/a.contact*100)}"></span><i class="cb-timing-marker"></i>${inputNotch}</span><span class="cb-timing-scale"><span>ANTICIPATE</span><span>${defending?'CRITICAL GUARD':'STRIKE'}</span><span>${defending?'BRACE':'CONTACT'}</span></span>`,`${a.timingAttempted||a.resolved?'disabled':''} aria-label="${verb} timing, Space or Enter"`, 'cb-timing-button'):'<span class="cb-action-progress"><i></i></span>'}</div>`;
  }
}
