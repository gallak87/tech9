import { ENEMIES, TECHS, ITEMS } from './content.js';
import { stats } from './progression.js';
import { drawHero, drawEnemy, drawBattleBackdrop, actorBounds } from './art.js';

// Only updateBattle advances combat time. Drawing and input never advance the
// authoritative animation clock; the global menu can therefore freeze any frame.
const C = { ink: '#171717', paper: '#f0efed', teal: '#a5a5a5', pale: '#b8b8b8', amber: '#df702e', rose: '#df702e', red: '#c46c61', faint: '#494949' };
const ROOT_COMMANDS = ['Attack', 'Tech', 'Defend', 'Item', 'Retreat'];
// Choreography retains its 768-unit design space inside the 960×540 canvas.
// The production accordion is a DOM overlay; field actors stay on their art grid.
const DISPLAY_SCALE = 1.25;
const FIELD_OFFSET_Y = -50;
const H_POS = [{ x: 192, y: 200 }, { x: 135, y: 260 }, { x: 247, y: 278 }];
const E_POS = {
  1: [{ x: 568, y: 241 }],
  2: [{ x: 541, y: 194 }, { x: 627, y: 268 }],
  3: [{ x: 577, y: 190 }, { x: 483, y: 282 }, { x: 665, y: 288 }],
  4: [{ x: 503, y: 190 }, { x: 668, y: 190 }, { x: 483, y: 291 }, { x: 665, y: 291 }],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const alive = actor => actor.hp > 0;
const confirmKey = key => key === 'Enter' || key === ' ' || key === 'Space' || key === 'Spacebar';
const learned = (hero, id) => Array.isArray(hero.skills) ? hero.skills.includes(id) : Boolean(hero.skills?.[id]);
const actorById = (b, id) => b.heroes.find(h => h.id === id) || b.enemies.find(e => e.uid === id);
const actorId = actor => actor.side === 'hero' ? actor.id : actor.uid;
const easing = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
const selected = b => b.heroes.find(h => h.id === b.selectedHero);
const sourceHero = (state, id) => state.heroes.find(h => h.id === id);

function roll(state) {
  let n = (state.rng || state.seed || 9127) >>> 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  state.rng = n >>> 0;
  return state.rng / 4294967296;
}

function log(b, text, kind = 'info') {
  b.logSerial = (b.logSerial || 0) + 1;
  b.logs.push({ seq: b.logSerial, time: Number(b.clock.toFixed(3)), text, kind });
  if (b.logs.length > 80) b.logs.shift();
  b.message = text;
}

function sync(b, state) {
  for (const h of b.heroes) {
    const saved = sourceHero(state, h.id);
    if (saved) { saved.hp = clamp(h.hp, 0, h.maxHp); saved.mp = clamp(h.mp, 0, h.maxMp); }
  }
}

function cleanQueue(b) {
  b.readyQueue = b.readyQueue.filter(id => {
    const h = actorById(b, id);
    return h && alive(h) && h.atb >= 100;
  });
  if (b.selectedHero) b.lastSelectedHero = b.selectedHero;
  if (!b.readyQueue.includes(b.selectedHero)) b.selectedHero = b.readyQueue[0] || null;
  if (!b.selectedHero && !b.action && b.mode !== 'waiting') {
    b.mode = 'waiting'; b.cursor = 0; b.pending = null;
  }
}

export function createBattle(state, encounter) {
  if (!Array.isArray(encounter.enemies) || encounter.enemies.length < 1 || encounter.enemies.length > 4) {
    throw new Error(`Encounter ${encounter.id || '?'} must contain one to four enemies.`);
  }
  const heroes = state.heroes.map((h, i) => ({
    ...h, ...stats(h, state), side: 'hero', index: i,
    hp: clamp(h.hp, 0, stats(h, state).maxHp), mp: clamp(h.mp, 0, stats(h, state).maxMp),
    atb: 58 - i * 9, shield: 0, guarding: false, criticalGuard: false, slowTurns: 0, reaction: 0,
    home: { ...H_POS[i] },
  }));
  const enemies = encounter.enemies.map((id, i) => {
    const data = ENEMIES[id];
    if (!data) throw new Error(`Required enemy content missing: ${id}`);
    return {
      ...data, id, uid: `enemy_${i}`, side: 'enemy', index: i,
      maxHp: data.hp, hp: data.hp, maxMp: data.mp || 0, mp: data.mp || 0,
      int: data.int || data.str, tec: data.tec || data.str, crit: data.crit || 4,
      atb: 10 + i * 7, shield: 0, guarding: false, criticalGuard: false, slowTurns: 0, reaction: 0,
      home: { ...E_POS[encounter.enemies.length][i] }, turns: 0, bossPhase: 1, charging: false,
    };
  });
  const b = {
    encounter: { ...encounter }, biome: encounter.biome || state.region,
    heroes, enemies, readyQueue: [], selectedHero: null, lastSelectedHero: heroes[0]?.id || null, phase: 'active', mode: 'waiting',
    cursor: 0, target: 0, pending: null, action: null, result: null,
    clock: 0, floaters: [], logs: [], message: '', notice: '', noticeTime: 0,
    actionSerial: 0, inputSerial: 0, held: {}, hitAreas: [],
  };
  log(b, encounter.boss ? 'A signal answers from the dark.' : 'Weapons drawn. Keep the signal alive.');
  checkEnd(b, state);
  return b;
}

function rate(actor) {
  return (12 + actor.spd * (actor.side === 'hero' ? 1.36 : 1.02)) * (actor.slowTurns ? .57 : 1);
}

function listTechs(b, state) {
  const id = b.selectedHero;
  return Object.values(TECHS).filter(t => {
    if (!t.heroes?.includes(id)) return false;
    // Unknown skills remain in the atlas with an explanation rather than vanishing.
    return t.heroes.length === 1 || t.heroes.every(hid => b.heroes.some(h => h.id === hid));
  }).map(t => ({ ...t, unavailable: techReason(b, state, t) }));
}

function techReason(b, state, tech) {
  const members = tech.heroes.map(id => b.heroes.find(h => h.id === id));
  if (members.some(h => !h)) return 'A companion has not joined yet.';
  if (!tech.heroes.some(id => learned(sourceHero(state, id) || {}, tech.id))) return 'Learn this technique in Skills.';
  const fallen = members.find(h => !alive(h));
  if (fallen) return `${fallen.name} is down.`;
  const waiting = members.find(h => h.atb < 100);
  if (waiting) return `Waiting for ${waiting.name}'s gauge.`;
  const dry = members.find(h => h.mp < (typeof tech.mp === 'object' ? tech.mp[h.id] || 0 : tech.mp || 0));
  if (dry) return `${dry.name} needs more MP.`;
  return '';
}

function listItems(state) {
  return Object.entries(state.inventory || {}).filter(([id, count]) => count > 0 && ['heal', 'restoreMp', 'revive'].includes(ITEMS[id]?.effect)).map(([id, count]) => ({ ...ITEMS[id], id, count }));
}

function validTargets(b, command) {
  if (!command) return [];
  if (command.target === 'self') return [actorById(b, command.participants[0])].filter(Boolean);
  const side = command.target === 'ally' || command.target === 'allAllies' ? b.heroes : b.enemies;
  return side.filter(actor => command.effect === 'revive' ? !alive(actor) : alive(actor));
}

function commandFromTech(b, tech) {
  return { ...tech, kind: 'tech', participants: [...tech.heroes], returnMode: 'tech', returnCursor: b.cursor };
}

function chooseCommand(b, state, command) {
  b.pending = command; b.target = 0; b.mode = 'target';
  const targets = validTargets(b, command);
  if (!targets.length) {
    b.mode = command.returnMode || 'command';
    notice(b, command.effect === 'revive' ? 'Everyone is standing.' : 'No valid target.');
    return;
  }
  if (command.target === 'ally') {
    let need = targets[0];
    for (const t of targets) if (t.hp / t.maxHp < need.hp / need.maxHp) need = t;
    b.target = targets.indexOf(need);
  }
}

function notice(b, text) { b.notice = text; b.noticeTime = 3; }

function rootConfirm(b, state) {
  const h = selected(b);
  if (!h || !alive(h) || h.atb < 100) return;
  const cmd = ROOT_COMMANDS[b.cursor];
  if (cmd === 'Attack') chooseCommand(b, state, {
    id: 'attack', name: 'Attack', kind: 'attack', effect: 'damage', stat: h.id === 'vex' ? 'int' : 'str',
    power: 1, target: 'enemy', participants: [h.id], returnMode: 'command', returnCursor: b.cursor,
  });
  if (cmd === 'Tech') { b.mode = 'tech'; b.cursor = 0; }
  if (cmd === 'Defend') execute(b, state, { id: 'defend', name: 'Defend', kind: 'defend', effect: 'guard', target: 'self', participants: [h.id] }, [h]);
  if (cmd === 'Item') {
    if (!listItems(state).length) { notice(b, 'No field supplies. Vendors stock healing items.'); return; }
    b.mode = 'item'; b.cursor = 0;
  }
  if (cmd === 'Retreat') {
    if (b.encounter.boss || b.enemies.some(e => e.id === 'void_architect')) { notice(b, 'This confrontation must be faced.'); return; }
    chooseCommand(b, state, { id: 'retreat', name: 'Retreat', kind: 'retreat', effect: 'retreat', target: 'self', participants: [h.id], returnMode: 'command', returnCursor: b.cursor });
  }
}

function execute(b, state, command, targets) {
  if (b.action || b.result) return false;
  const members = command.participants.map(id => actorById(b, id));
  if (!members.length || members.some(h => !h || !alive(h) || h.atb < 100)) {
    cleanQueue(b); b.mode = 'waiting'; notice(b, 'The formation changed. Choose a ready hero.'); return false;
  }
  if (command.kind === 'tech') {
    const unavailable = techReason(b, state, command);
    if (unavailable) { notice(b, unavailable); return false; }
  }
  if (command.kind === 'item' && !(state.inventory[command.id] > 0)) {
    notice(b, 'That supply has been used.'); b.mode = 'command'; b.cursor = 0; return false;
  }
  if (!targets.length) return false;
  for (const h of members) {
    h.atb = 0;
    h.guarding = command.kind === 'defend';
    h.criticalGuard = false;
    if (command.kind === 'tech') h.mp -= typeof command.mp === 'object' ? command.mp[h.id] || 0 : command.mp || 0;
  }
  if (command.kind === 'item') state.inventory[command.id]--;
  cleanQueue(b);
  const harmful = ['damage', 'drain', 'slow'].includes(command.effect);
  const combo = members.length > 1;
  const contact = combo ? .93 : .76;
  const assisted = Boolean(state.settings?.timingAssist);
  b.action = {
    id: ++b.actionSerial, side: 'hero', command: { ...command }, participants: members.map(actorId),
    targets: targets.map(actorId), elapsed: 0, contact, duration: combo ? 1.92 : 1.54,
    windowStart: contact - (assisted ? .36 : .28), windowEnd: contact - (assisted ? .055 : .095),
    timingEligible: harmful || command.kind === 'defend', timingAttempted: false, timingSuccess: false, resolved: false, critical: false,
    executeInput: b.inputSerial, stage: 'anticipation',
  };
  b.phase = 'action'; b.mode = 'action'; b.pending = null; b.cursor = 0;
  log(b, `${members.map(h => h.name).join(' + ')} · ${command.name}`, 'action');
  sync(b, state);
  return true;
}

function commitTarget(b, state) {
  if (!b.pending) return;
  const targets = validTargets(b, b.pending);
  const group = b.pending.target === 'allEnemies' || b.pending.target === 'allAllies';
  const chosen = group ? targets : [targets[clamp(b.target, 0, targets.length - 1)]].filter(Boolean);
  execute(b, state, b.pending, chosen);
}

function nextReady(b, direction = 1) {
  cleanQueue(b);
  if (!b.readyQueue.length) return false;
  const index = Math.max(0, b.readyQueue.indexOf(b.selectedHero));
  b.selectedHero = b.readyQueue[(index + direction + b.readyQueue.length) % b.readyQueue.length];
  b.pending = null; b.cursor = 0;
  if (b.mode !== 'waiting') b.mode = 'command';
  return true;
}

// Pass fresh string keydowns, or native keydown/keyup events. Native events also
// get repeat and held-key protection here; strings are the host's fresh presses.
export function battleKey(b, state, input) {
  const key = typeof input === 'string' ? input : input?.key;
  if (!key || key === 'Escape') return false;
  if (typeof input === 'object') {
    if (input.type === 'keyup') { delete b.held[key]; return false; }
    if (input.repeat || b.held[key]) return true;
    b.held[key] = true;
  }
  b.inputSerial++;
  if (b.result) return false;
  if (b.action) {
    if (confirmKey(key)) timingPress(b);
    return true;
  }
  cleanQueue(b);
  if (key === 'Tab') return nextReady(b, input?.shiftKey ? -1 : 1);
  if (key === 'Backspace' || key === 'ArrowLeft') {
    if (b.mode === 'target') {
      b.mode = b.pending?.returnMode || 'command'; b.cursor = b.pending?.returnCursor || 0; b.pending = null;
    } else if (b.mode === 'tech' || b.mode === 'item') { const wasItem = b.mode === 'item'; b.mode = 'command'; b.cursor = wasItem ? 3 : 1; }
    else if (b.mode === 'command') b.mode = 'waiting';
    return true;
  }
  if (b.mode === 'waiting') {
    if (key === 'ArrowUp' || key === 'ArrowDown') return nextReady(b, key === 'ArrowUp' ? -1 : 1);
    if ((confirmKey(key) || key === 'ArrowRight') && b.selectedHero) { b.mode = 'command'; b.cursor = 0; return true; }
    return false;
  }
  const direction = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  if (direction) {
    const count = b.mode === 'command' ? ROOT_COMMANDS.length : b.mode === 'tech' ? listTechs(b, state).length : b.mode === 'item' ? listItems(state).length : validTargets(b, b.pending).length;
    if (count) {
      if (b.mode === 'target') b.target = (b.target + direction + count) % count;
      else b.cursor = (b.cursor + direction + count) % count;
    }
    return true;
  }
  if (confirmKey(key) || key === 'ArrowRight') {
    if (b.mode === 'command') rootConfirm(b, state);
    else if (b.mode === 'tech') {
      const t = listTechs(b, state)[b.cursor];
      if (!t) return true;
      if (t.unavailable) notice(b, t.unavailable);
      else chooseCommand(b, state, commandFromTech(b, t));
    } else if (b.mode === 'item') {
      const item = listItems(state)[b.cursor];
      if (item) chooseCommand(b, state, { ...item, kind: 'item', name: item.name, target: 'ally', participants: [b.selectedHero], returnMode: 'item', returnCursor: b.cursor });
    } else if (b.mode === 'target') commitTarget(b, state);
    return true;
  }
  return false;
}

function timingPress(b) {
  const a = b.action;
  if (!a || a.side !== 'hero' || !a.timingEligible || a.timingAttempted || a.resolved || b.inputSerial <= a.executeInput) return;
  a.timingAttempted = true;
  a.timingSuccess = a.elapsed >= a.windowStart && a.elapsed <= a.windowEnd;
  const defending = a.command.kind === 'defend';
  log(b, a.timingSuccess ? defending ? 'Critical guard · damage reduced by 85% until your next action.' : 'Signal caught · critical chance raised.' : defending ? 'Normal guard · damage reduced by 65% until your next action.' : 'Signal missed · the strike continues.', a.timingSuccess ? 'timing' : 'miss');
}

function mechanicFor(e) {
  if (e.id === 'void_architect') return 'architect';
  if (e.mechanic) return ({ caster: 'siphon', ward: 'fortress', colossus: 'fortress', herald: 'charge', ember: 'charge' })[e.mechanic] || e.mechanic;
  if (e.id === 'wraith_core' || e.id === 'mire_warden') return 'siphon';
  if (e.id === 'frost_colossus' || e.id === 'magma_behemoth') return 'fortress';
  return e.tier >= 4 ? 'charge' : '';
}

function enemyTurn(b, state, e) {
  const targets = b.heroes.filter(alive);
  if (!targets.length) { checkEnd(b, state); return; }
  const mechanic = mechanicFor(e);
  e.turns++;
  const wantsCharge = ['charge', 'fortress', 'architect'].includes(mechanic) && !e.charging && (e.turns % 3 === 1 || mechanic === 'architect' && e.bossPhase > 1);
  e.atb = 0;
  let command, chosen;
  if (wantsCharge) {
    command = { id: 'telegraph', name: mechanic === 'architect' ? e.bossPhase === 3 ? 'Last Equation' : 'Unwritten Sky' : mechanic === 'fortress' ? 'Earthbound oath' : 'Gathering force', effect: 'telegraph', power: 0, target: 'self' };
    chosen = [e];
  } else {
    const charged = e.charging;
    const group = charged && (mechanic === 'architect' || mechanic === 'charge' || e.tier >= 5);
    command = {
      id: charged ? 'surge' : 'strike', name: charged ? mechanic === 'architect' ? e.bossPhase === 3 ? 'Last Equation' : 'Unwritten Sky' : 'Faultline surge' : mechanic === 'siphon' && e.turns % 2 === 0 ? 'Hollow thirst' : 'Strike',
      effect: mechanic === 'siphon' && e.turns % 2 === 0 ? 'drain' : mechanic === 'slow' ? 'slow' : 'damage',
      power: charged ? mechanic === 'architect' ? 1.7 + e.bossPhase * .13 : 1.95 : mechanic === 'architect' ? 1 + e.bossPhase * .08 : 1,
      stat: 'str', target: group ? 'allAllies' : 'ally', charged,
    };
    chosen = group ? targets : [targets[Math.floor(roll(state) * targets.length)]];
    e.charging = false;
  }
  b.action = {
    id: ++b.actionSerial, side: 'enemy', command, participants: [e.uid], targets: chosen.map(actorId),
    elapsed: 0, contact: command.effect === 'telegraph' ? .46 : .72,
    duration: command.effect === 'telegraph' ? 1.04 : 1.4,
    timingEligible: false, timingAttempted: false, timingSuccess: false, resolved: false, critical: false, stage: 'anticipation',
  };
  b.phase = 'action'; b.mode = 'action';
  log(b, `${e.name} · ${command.name}`, 'enemy');
}

function floating(b, actor, text, kind) {
  const bounds = actorBounds(actor.id, { pose: 'idle', side: actor.side, scale: artScale(b, actor), facing: actor.side === 'hero' ? 'right' : 'left' });
  const visual = actorVisual(b, actor, {});
  b.floaters.push({ x: visual.x, y: Math.max(65, visual.y + bounds.top / DISPLAY_SCALE - 7), text, kind, life: 1.18, maxLife: 1.18 });
}

function takeDamage(b, target, amount, critical) {
  if (target.guarding) amount = Math.max(1, Math.round(amount * (target.criticalGuard ? .15 : .35)));
  const blocked = Math.min(target.shield, amount);
  target.shield -= blocked; amount -= blocked;
  const applied = Math.min(target.hp, amount);
  target.hp = Math.max(0, target.hp - amount);
  target.reaction = .32;
  if (amount === 0) floating(b, target, 'WARD', 'shield');
  else floating(b, target, `${critical ? '✦ ' : ''}${amount}`, critical ? 'crit' : 'damage');
  if (!alive(target)) {
    target.atb = 0; target.charging = false; target.guarding = false; target.criticalGuard = false; target.shield = 0;
    target.defeatedAt = b.clock - Math.max(0, (b.action?.elapsed || 0) - (b.action?.contact || 0));
    log(b, `${target.name} falls.`, 'down');
  }
  return applied;
}

function phaseTransition(b, e) {
  if (!alive(e)) return;
  const mechanic = mechanicFor(e);
  let phase = 1;
  if (mechanic === 'architect') phase = e.hp / e.maxHp <= .33 ? 3 : e.hp / e.maxHp <= .67 ? 2 : 1;
  else if (['fortress', 'charge'].includes(mechanic)) phase = e.hp / e.maxHp <= (e.phaseAt || .5) ? 2 : 1;
  if (phase > e.bossPhase) {
    e.bossPhase = phase;
    if (mechanic === 'architect' || mechanic === 'fortress') e.shield += Math.ceil(e.maxHp * (mechanic === 'architect' ? .06 : .12));
    const msg = mechanic === 'architect' ? phase === 2 ? 'The Architect unfolds a second sky. Watch its signal.' : 'The final equation fractures. Stand together.' : `${e.name} exposes its core and gathers force.`;
    log(b, msg, 'phase'); notice(b, msg); e.charging = true;
  }
}

function resolveAction(b, state, a) {
  a.resolved = true;
  const command = a.command;
  const participants = a.participants.map(id => actorById(b, id)).filter(h => h && alive(h));
  if (!participants.length) { log(b, 'The action breaks before contact.', 'cancel'); return; }
  const targets = a.targets.map(id => actorById(b, id)).filter(t => t && (command.effect === 'revive' ? !alive(t) : alive(t)));
  const actor = participants[0];
  if (command.effect === 'retreat') { b.retreatPending = true; log(b, 'The crew withdraws along the path.', 'retreat'); return; }
  if (command.effect === 'telegraph') {
    actor.charging = true;
    log(b, actor.telegraph || `${actor.name} is preparing ${command.name}. Defend or raise a ward.`, 'telegraph');
    floating(b, actor, 'CHARGING', 'warning'); return;
  }
  if (command.effect === 'guard') { actor.guarding = true; actor.criticalGuard = a.timingSuccess; a.critical = a.timingSuccess; floating(b, actor, a.timingSuccess ? 'CRITICAL GUARD' : 'GUARD', a.timingSuccess ? 'crit' : 'shield'); return; }
  const harm = ['damage', 'drain', 'slow'].includes(command.effect);
  if (harm) {
    const baseline = participants.reduce((sum, h) => sum + (h.crit || 5), 0) / participants.length / 100;
    a.criticalChance = clamp(baseline + (a.timingSuccess ? .46 : 0), .02, .88);
    a.critical = roll(state) < a.criticalChance;
  }
  const stat = command.stat || 'str';
  const combined = participants.reduce((sum, h) => sum + (h[stat] || h.str || 10), 0);
  let drained = 0;
  for (const target of targets) {
    if (harm) {
      const variance = .91 + roll(state) * .18;
      const base = (combined * (command.power || 1) * 1.6 + 8 - (target.def || 0) * .66) * variance;
      const damage = Math.max(3, Math.round(base * (a.critical ? 1.6 : 1)));
      const applied = takeDamage(b, target, damage, a.critical);
      drained += applied;
      log(b, `${target.name} · ${applied ? `${applied} damage` : 'ward holds'}`, 'damage');
      if (command.effect === 'slow' && alive(target)) { target.slowTurns = Math.max(target.slowTurns, 2); target.atb = Math.max(0, target.atb - 16); }
      if (target.side === 'enemy') phaseTransition(b, target);
    } else if (command.effect === 'heal') {
      const amount = command.kind === 'item' ? command.power : Math.round(30 + combined * (command.power || 1.8));
      const gain = Math.max(0, Math.min(target.maxHp - target.hp, amount));
      target.hp += gain; floating(b, target, `+${gain}`, 'heal'); log(b, `${target.name} recovers ${gain} HP.`, 'heal');
    } else if (command.effect === 'shield') {
      const amount = Math.round(24 + combined * (command.power || 1.5));
      target.shield = Math.max(target.shield, amount); floating(b, target, `WARD ${amount}`, 'shield');
    } else if (command.effect === 'restoreMp') {
      const gain = Math.min(target.maxMp - target.mp, command.power || 30);
      target.mp += gain; floating(b, target, `MP +${gain}`, 'heal'); log(b, `${target.name} recovers ${gain} MP.`, 'heal');
    } else if (command.effect === 'revive') {
      target.hp = Math.max(1, Math.round(target.maxHp * (command.power > 1 ? command.power / 100 : command.power || .35)));
      target.atb = 28; floating(b, target, 'RISE', 'heal');
    }
  }
  if (command.effect === 'drain' && drained) {
    const gain = Math.min(actor.maxHp - actor.hp, Math.round(drained * .4));
    actor.hp += gain; floating(b, actor, `+${gain}`, 'heal');
  }
  if (harm && a.critical) log(b, 'Critical strike · the signal breaks through.', 'crit');
  cleanQueue(b); sync(b, state);
}

function checkEnd(b, state) {
  if (b.result) return true;
  if (b.retreatPending) b.result = 'retreat';
  else if (!b.heroes.some(alive)) b.result = 'defeat';
  else if (!b.enemies.some(alive)) b.result = 'victory';
  if (!b.result) return false;
  b.phase = b.result; b.mode = 'result'; b.action = null; b.pending = null;
  sync(b, state);
  log(b, b.result === 'victory' ? 'The signal holds. Victory.' : b.result === 'defeat' ? 'The expedition falls silent.' : 'A path remains. The crew retreats.', b.result);
  return true;
}

export function updateBattle(b, state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // Caller supplies seconds; support a larger simulation step without skipping
  // contact or completing a second action in the same update.
  b.clock += dt;
  b.noticeTime = Math.max(0, b.noticeTime - dt);
  for (const actor of [...b.heroes, ...b.enemies]) actor.reaction = Math.max(0, actor.reaction - dt);
  b.floaters = b.floaters.filter(f => (f.life -= dt) > 0);
  // The host's existing result transition advances presentation only. No actor
  // can become ready, attack, resolve damage, or pay rewards after the result.
  if (b.result) return;
  if (b.action) {
    const a = b.action;
    a.elapsed = Math.min(a.duration, a.elapsed + dt);
    a.stage = a.elapsed < (a.windowStart ?? .3) ? 'anticipation' : a.elapsed < a.contact ? 'approach' : a.elapsed < a.contact + .15 ? 'contact' : 'recovery';
    if (!a.resolved && a.elapsed >= a.contact) resolveAction(b, state, a);
    if (a.elapsed >= a.duration) {
      for (const id of a.participants) {
        const actor = actorById(b, id);
        if (actor?.slowTurns) actor.slowTurns--;
      }
      b.action = null; b.phase = 'active'; b.mode = 'waiting'; b.pending = null; b.cursor = 0; b.target = 0;
      if (!checkEnd(b, state)) cleanQueue(b);
    }
    return;
  }
  cleanQueue(b);
  if (checkEnd(b, state) || b.mode !== 'waiting') return;
  const arriving = [];
  for (const h of b.heroes) {
    if (!alive(h) || h.atb >= 100) continue;
    const before = h.atb;
    h.atb = Math.min(100, h.atb + rate(h) * dt);
    if (h.atb >= 100) arriving.push({ id: h.id, when: (100 - before) / rate(h), index: h.index });
  }
  arriving.sort((a, z) => a.when - z.when || a.index - z.index);
  for (const h of arriving) if (!b.readyQueue.includes(h.id)) b.readyQueue.push(h.id);
  cleanQueue(b);
  for (const e of b.enemies) if (alive(e)) e.atb = Math.min(100, e.atb + rate(e) * dt);
  const enemy = b.enemies.find(e => alive(e) && e.atb >= 100);
  if (enemy) enemyTurn(b, state, enemy);
}

export function battleView(b, state) {
  const a = b.action;
  const techs = listTechs(b, state);
  const targets = validTargets(b, b.pending);
  return {
    phase: b.phase, mode: b.mode, result: b.result, clock: b.clock,
    selectedHero: b.selectedHero, focusHero: b.selectedHero || b.lastSelectedHero || b.heroes.find(alive)?.id, readyQueue: [...b.readyQueue], cursor: b.cursor, target: b.target,
    message: b.noticeTime > 0 ? b.notice : b.message,
    status: b.result || (a ? `${a.command.name} · ${a.stage}` : b.mode === 'waiting' ? b.selectedHero ? `${selected(b).name} ready` : 'Gauges charging' : 'Wait · choose an action'),
    commands: ROOT_COMMANDS.map((name, i) => ({ name, selected: b.mode === 'command' && b.cursor === i, unavailable: name === 'Retreat' && (b.encounter.boss || b.enemies.some(e => e.id === 'void_architect')) ? 'This confrontation must be faced.' : name === 'Item' && !listItems(state).length ? 'No field supplies.' : '' })),
    pending: b.pending && { id: b.pending.id, name: b.pending.name, kind: b.pending.kind, effect: b.pending.effect, target: b.pending.target, participants: [...b.pending.participants] },
    techs: techs.map(t => ({ id: t.id, name: t.name, mp: t.mp, participants: t.heroes, effect: t.effect, target: t.target, description: t.description, unavailable: t.unavailable })),
    items: listItems(state).map(item => ({ id: item.id, name: item.name, count: item.count, description: item.description, effect: item.effect })),
    targets: targets.map(t => ({ id: actorId(t), name: t.name, hp: t.hp, maxHp: t.maxHp, selected: targets[b.target] === t })),
    heroes: b.heroes.map(h => ({ id: h.id, name: h.name, hp: h.hp, maxHp: h.maxHp, mp: h.mp, maxMp: h.maxMp, atb: h.atb, shield: h.shield, guarding: h.guarding, criticalGuard: Boolean(h.criticalGuard), slowTurns: h.slowTurns, visual: actorVisual(b, h, state) })),
    enemies: b.enemies.map(e => ({ id: e.id, uid: e.uid, name: e.name, hp: e.hp, maxHp: e.maxHp, atb: e.atb, shield: e.shield, slowTurns: e.slowTurns, charging: e.charging, bossPhase: e.bossPhase, visual: actorVisual(b, e, state) })),
    action: a && { id: a.id, side: a.side, kind: a.command.kind, effect: a.command.effect, name: a.command.name, participants: [...a.participants], targets: [...a.targets], elapsed: a.elapsed, duration: a.duration, stage: a.stage, contact: a.contact, windowStart: a.windowStart, windowEnd: a.windowEnd, timingEligible: a.timingEligible, timingAttempted: a.timingAttempted, timingSuccess: a.timingSuccess, resolved: a.resolved, critical: a.critical, criticalChance: a.criticalChance },
    log: b.logs.map(l => ({ ...l })),
    hints: b.mode === 'target' ? '↑ ↓ Target · Space / Enter Execute · ← Back' : b.mode === 'waiting' ? '↑ ↓ Ready hero · → / Enter Commands' : '↑ ↓ Choose · → / Enter Confirm · ← Back',
  };
}

function text(ctx, value, x, y, color = C.paper, size = 11, align = 'left', font = 'Barlow, sans-serif') {
  ctx.fillStyle = color; ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(value, Math.round(x), Math.round(y));
}

function line(ctx, x1, y1, x2, y2, color = C.faint) {
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x1) + .5, Math.round(y1) + .5); ctx.lineTo(Math.round(x2) + .5, Math.round(y2) + .5); ctx.stroke();
}

function bar(ctx, x, y, width, height, value, color) {
  ctx.fillStyle = '#151515'; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color; ctx.fillRect(x, y, Math.round(width * clamp(value, 0, 1)), height);
}

function trim(ctx, value, width, size = 10) {
  ctx.font = `${size}px Barlow, sans-serif`;
  if (ctx.measureText(value).width <= width) return value;
  let s = value;
  while (s.length && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

function button(b, x, y, w, h, kind, data = {}) { b.hitAreas.push({ x, y, w, h, kind, ...data }); }

function artScale(b, actor) {
  if (actor.side === 'hero') return 1.25;
  const base = actor.tier >= 5 ? 1.05 : ['mire_hulk', 'ember_golem', 'magma_behemoth'].includes(actor.id) ? 1.1 : 1.45;
  return base * (b.enemies.length > 2 ? .86 : 1);
}

function defeatOpacity(b, actor) {
  if (alive(actor)) return 1;
  if (actor.side === 'hero') return .6;
  if (!Number.isFinite(actor.defeatedAt)) return 0;
  return clamp(1 - (b.clock - actor.defeatedAt - .68) / .42, 0, 1);
}

function harborPlant(b, a) {
  const rune = b.heroes.find(h => h.id === 'rune');
  const compression = a.elapsed >= .42 && a.elapsed < .54 ? Math.sin((a.elapsed - .42) / .12 * Math.PI) * 3 : 0;
  return { x: (rune?.home.x || 247) + 26, y: (rune?.home.y || 278) - 49 + compression, compression };
}

// A single defender meets the enemy beyond the formation. Weapon reach comes
// from the actual attack crop, so a spear and a short claw make true contact
// without parking the attacker's body on an uninvolved companion.
function enemyExchange(b, a) {
  if (!a || a.side !== 'enemy' || a.targets.length !== 1 || !['damage', 'drain', 'slow'].includes(a.command.effect)) return null;
  const defender = actorById(b, a.targets[0]), attacker = actorById(b, a.participants[0]);
  if (!defender || defender.side !== 'hero' || !attacker) return null;
  const formationRight = Math.max(...b.heroes.map(h => h.home.x + actorBounds(h.id, { pose: 'idle', side: 'hero', scale: artScale(b, h), facing: 'right' }).right / DISPLAY_SCALE));
  const body = actorBounds(defender.id, { pose: 'guard', side: 'hero', scale: artScale(b, defender), facing: 'right' });
  const weapon = actorBounds(attacker.id, { pose: 'attack', side: 'enemy', scale: artScale(b, attacker), facing: 'left' });
  // Contact heights measured at the leading 7.5% of each painted attack crop.
  // Tall spear/fist sources cannot be aligned by their ground anchor alone.
  const contactHeight = ({ frost_revenant:.277, ember_lord:.475, ember_golem:.528, glacier_wolf:.632, mire_hulk:.737, wraith_core:.615, architect_herald:.394, frost_colossus:.292, magma_behemoth:.541, mire_warden:.314, void_architect:.547 })[attacker.id] ?? .54;
  const weaponY = weapon.top + (weapon.bottom - weapon.top) * contactHeight;
  const offsetY = (body.top * .47 - weaponY) / DISPLAY_SCALE;
  const target = { x: formationRight + 24 - body.left / DISPLAY_SCALE, y: Math.min(257, 302 - Math.max(0, offsetY) - Math.max(0, weapon.bottom / DISPLAY_SCALE)) };
  return { defender, target, attacker: { x: target.x + body.right * .35 / DISPLAY_SCALE - (weapon.left + (weapon.right - weapon.left) * .025) / DISPLAY_SCALE, y: target.y + offsetY } };
}

function actorVisual(b, actor, state) {
  const home = actor.home;
  let x = home.x, y = home.y, pose = actor.hp <= 0 ? 'down' : actor.guarding ? 'guard' : 'idle', moving = false, progress = 0;
  let facing = actor.side === 'hero' ? 'right' : 'left', animationTime = b.clock;
  const a = b.action;
  if (actor.reaction > 0 && alive(actor)) { pose = 'hurt'; x += Math.round(Math.sin(actor.reaction * 34) * 3) * (actor.side === 'hero' ? -1 : 1); }
  const exchange = enemyExchange(b, a);
  if (exchange?.defender === actor) {
    const t = a.elapsed, arrival = a.contact - .24;
    const travel = t < arrival ? easing((t - .12) / (arrival - .12)) : t < a.contact + .18 ? 1 : 1 - easing((t - a.contact - .18) / (a.duration - a.contact - .22));
    x = home.x + (exchange.target.x - home.x) * travel;
    y = home.y + (exchange.target.y - home.y) * travel;
    moving = travel > 0 && travel < 1;
    pose = actor.hp <= 0 ? 'down' : actor.reaction > 0 ? 'hurt' : moving ? 'move' : travel === 1 ? 'guard' : actor.guarding ? 'guard' : 'idle';
    if (moving && t > a.contact) facing = 'left';
    if (actor.reaction > 0) x -= Math.round(Math.sin(actor.reaction * 34) * 3);
    animationTime = t * 1.3;
  }
  if (a?.participants.includes(actorId(actor)) && alive(actor)) {
    const t = a.elapsed;
    progress = t / a.duration;
    const harborAnchor = a.command.id === 'harbor_break' && actor.id === 'rune';
    const supportive = ['heal', 'shield', 'restoreMp', 'revive'].includes(a.command.effect);
    const cast = harborAnchor || a.command.stat === 'int' || ['heal', 'shield', 'restoreMp', 'revive', 'telegraph'].includes(a.command.effect) || actor.id === 'vex' || a.command.target === 'allEnemies';
    if (a.command.kind === 'defend') pose = 'guard';
    else if (harborAnchor) { pose = 'guard'; y += harborPlant(b, a).compression; }
    else if (supportive) { pose = actor.id === 'rune' ? 'guard' : 'cast'; }
    else if (a.command.id === 'harbor_break' && actor.id === 'kaida') {
      const target = a.targets.map(id => actorById(b, id)).find(Boolean);
      const plant = harborPlant(b, a), runway = { x: plant.x - 39, y: plant.y + 43 };
      const stop = { x: (target?.home.x || 568) - 77, y: target?.home.y || 241 };
      const cruiseY = state.settings?.reducedMotion ? Math.min(plant.y, stop.y) - 20 : 112;
      if (t < .14) { pose = 'anticipate'; }
      else if (t < .32) {
        const p = easing((t - .14) / .18); x += (runway.x - x) * p; y += (runway.y - y) * p; pose = 'move'; moving = true;
      } else if (t < .46) {
        const p = easing((t - .32) / .14); x = runway.x + (plant.x - runway.x) * p; y = runway.y + (plant.y - runway.y) * p; pose = 'guard';
      } else if (t < .54) { x = plant.x; y = plant.y; pose = 'guard'; }
      else if (t < .68) {
        const p = easing((t - .54) / .14); x = plant.x + 40 * p; y = plant.y + (cruiseY - plant.y) * p; pose = 'guard';
      } else if (t < .82) {
        const p = easing((t - .68) / .14); x = plant.x + 40 + (stop.x - plant.x - 40) * p; y = cruiseY; pose = 'guard';
      } else if (t < a.contact) {
        const p = easing((t - .82) / (a.contact - .82)); x = stop.x; y = cruiseY + (stop.y - cruiseY) * p; pose = 'attack';
      } else if (t < a.contact + .18) { x = stop.x; y = stop.y; pose = 'attack'; }
      else {
        const p = easing((t - a.contact - .18) / (a.duration - a.contact - .26));
        x = stop.x + (home.x - stop.x) * p; y = stop.y + (home.y - stop.y) * p;
        if (!state.settings?.reducedMotion) y -= Math.sin(p * Math.PI) * 24;
        moving = p < .98; pose = moving ? 'move' : 'idle'; facing = moving ? 'left' : 'right';
      }
      animationTime = t * 1.3;
    }
    else if (a.command.id === 'concord_dawn') {
      pose = actor.id === 'rune' ? 'guard' : actor.id === 'vex' ? 'cast' : t < a.contact ? 'anticipate' : t < a.contact + .18 ? 'attack' : 'idle';
    }
    else if (a.side === 'enemy' && a.command.target === 'allAllies') {
      pose = t < .22 ? 'anticipate' : 'cast';
    }
    else if (t < .22) { pose = 'anticipate'; x += (actor.side === 'hero' ? -1 : 1) * Math.round(easing(t / .22) * 5); }
    else if (cast) { pose = t < a.contact ? 'cast' : t < a.contact + .18 ? 'attack' : 'cast'; }
    else {
      const target = a.targets.map(id => actorById(b, id)).find(Boolean);
      if (target) {
        const participantIndex = a.participants.indexOf(actorId(actor));
        const spread = a.command.id === 'harbor_break' ? 0 : (participantIndex - (a.participants.length - 1) / 2) * 35;
        const reach = actor.side === 'hero' ? actor.id === 'rune' ? -55 : -77 : 91;
        const stopX = exchange?.attacker.x ?? target.home.x + reach - participantIndex * 14;
        const stopY = exchange?.attacker.y ?? target.home.y + spread;
        const travel = t < a.contact - .16 ? easing((t - .23) / Math.max(.1, a.contact - .39)) : t < a.contact + .16 ? 1 : 1 - easing((t - a.contact - .16) / (a.duration - a.contact - .25));
        x += (stopX - x) * travel; y += (stopY - y) * travel;
        if (!state.settings?.reducedMotion) y -= Math.sin(travel * Math.PI) * (a.command.id === 'harbor_break' ? 42 : 11);
        moving = t < a.contact - .18 || t > a.contact + .2;
        pose = t < a.contact - .19 ? 'move' : t < a.contact - .06 ? 'anticipate' : t < a.contact + .18 ? 'attack' : 'move';
        if (t > a.contact + .2 && t < a.duration - .1) facing = actor.side === 'hero' ? 'left' : 'right';
        if (t >= a.duration - .1) { moving = false; pose = 'idle'; }
        if (moving) animationTime = a.elapsed * 1.3;
      }
    }
  }
  return { x: Math.round(x), y: Math.round(y), pose, moving, progress, facing, animationTime, opacity: defeatOpacity(b, actor) };
}

function brackets(ctx, x, y, w, h, color) {
  const s = 7;
  line(ctx, x, y + s, x, y, color); line(ctx, x, y, x + s, y, color);
  line(ctx, x + w - s, y, x + w, y, color); line(ctx, x + w, y, x + w, y + s, color);
  line(ctx, x, y + h - s, x, y + h, color); line(ctx, x, y + h, x + s, y + h, color);
  line(ctx, x + w - s, y + h, x + w, y + h, color); line(ctx, x + w, y + h, x + w, y + h - s, color);
}

function groundRing(ctx, x, y, rx, color, dashed = false) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  if (dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y) + 1, rx, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  line(ctx, x - rx - 6, y, x - rx + 2, y, color); line(ctx, x + rx - 2, y, x + rx + 6, y, color);
}

function spellArc(ctx, cx, cy, radius, start, end, colors, width = 3, squash = 1) {
  const steps = Math.ceil((end - start) * radius / 3);
  for (let i = 0; i <= steps; i++) {
    if (i % 13 === 0 || i % 13 === 1) continue;
    const angle = start + (end - start) * i / steps;
    for (let band = 0; band < width; band++) {
      const r = radius + band * 2;
      ctx.fillStyle = colors[band % colors.length];
      ctx.fillRect(Math.round((cx + Math.cos(angle) * r) / 2) * 2, Math.round((cy + Math.sin(angle) * r * squash) / 2) * 2, 2, 2);
    }
  }
}

function spellShard(ctx, x, y, length, color) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x,y-length);ctx.lineTo(x+3,y);ctx.lineTo(x,y+6);ctx.lineTo(x-3,y);ctx.closePath();ctx.fill();
  ctx.fillStyle = C.paper;ctx.fillRect(x-1,y-Math.round(length*.6),2,Math.max(2,Math.round(length*.5)));
}

function spellRibbon(ctx, from, to, phase, color) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx,dy) || 1;
  const ux = dx / length, uy = dy / length, steps = Math.ceil(length / 3), alpha = ctx.globalAlpha;
  for (let i = 0; i <= steps; i++) {
    if (i % 17 === 0) continue;
    const p = i / steps, wave = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 3 - phase * 9) * 3;
    const x = Math.round(from.x + dx * p - uy * wave), y = Math.round(from.y + dy * p + ux * wave);
    ctx.globalAlpha = alpha * .45; ctx.fillStyle = color; ctx.fillRect(x-1,y-1,3,3);
    if (i % 3 !== 0) { ctx.globalAlpha = alpha * .82; ctx.fillStyle = C.paper; ctx.fillRect(x,y,1,1); }
  }
  ctx.globalAlpha = alpha;
}

function drawEffect(ctx, b, state) {
  const a = b.action;
  if (!a || a.command.effect === 'retreat') return;
  const t = a.elapsed;
  const active = a.participants.map(id => actorById(b, id)).filter(Boolean);
  const targets = a.targets.map(id => actorById(b, id)).filter(Boolean);
  const support = ['heal', 'shield', 'restoreMp', 'revive', 'guard'].includes(a.command.effect);
  const spell = a.command.stat === 'int' || active[0]?.id === 'vex';
  const prism = a.command.id === 'prism_cut', dawn = a.command.id === 'concord_dawn';
  const enemyWave = a.side === 'enemy' && a.command.target === 'allAllies';
  const drone = active.find(actor => actor.id === 'drone_sentinel');
  const color = support ? C.pale : a.side === 'enemy' ? C.amber : C.rose;
  if (!state.settings?.reducedMotion) {
    for (const actor of active) {
      const p = actorVisual(b, actor, state);
      if (!p.moving) continue;
      const direction = p.facing === 'right' ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = .34 - i * .08;
        ctx.fillStyle = '#b7b69b';
        const stride = (a.elapsed * 23 + i * 3) % 7;
        ctx.fillRect(Math.round(p.x + direction * (12 + i * 7)), Math.round(p.y - 2 - stride * .35), 6 - i, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  // Coordinated techniques share an etched circuit before one synchronized contact.
  if (active.length > 1 && !prism && !dawn && t < (a.command.id === 'harbor_break' ? .54 : a.contact + .1)) {
    const p = Math.min(1, t / .35);
    ctx.globalAlpha = .8 * p;
    const positions = active.map(h => actorVisual(b, h, state));
    for (let i = 0; i < positions.length; i++) {
      const from = positions[i], to = positions[(i + 1) % positions.length];
      if (support) {
        spellRibbon(ctx, {x:from.x,y:from.y-24}, {x:to.x,y:to.y-24}, t, C.pale);
        for (let petal=0;petal<3;petal++) {
          const flight=(t*.8+petal/3)%1;
          spellShard(ctx,from.x+(to.x-from.x)*flight,from.y-24+(to.y-from.y)*flight-Math.sin(flight*Math.PI)*13,4+petal,C.pale);
        }
      } else line(ctx, from.x, from.y - 24, to.x, to.y - 24, C.amber);
      groundRing(ctx, from.x, from.y, 22 + Math.round(p * 4), C.amber);
    }
    ctx.globalAlpha = 1;
  }
  if (a.command.id === 'harbor_break' && t >= .36 && t < .68) {
    const p = harborPlant(b, a), power = clamp((t - .36) / .18, 0, 1);
    ctx.globalAlpha = t > .54 ? 1 - (t - .54) / .14 : power;
    groundRing(ctx, p.x, p.y, 10 + power * 6, C.amber);
    for (let i = -1; i <= 1; i++) line(ctx, p.x + i * 7, p.y + 6, p.x + i * 12 + 5, p.y - 13, i ? C.amber : C.paper);
    ctx.globalAlpha = 1;
  }
  if (prism && t >= .2 && t < a.contact + .35) {
    const kaida = active.find(h => h.id === 'kaida'), vex = active.find(h => h.id === 'vex');
    const focus = { x: (kaida?.home.x || 192) + 54, y: (kaida?.home.y || 200) - 44 };
    const origin = vex && actorVisual(b, vex, state);
    const fade = t > a.contact ? 1 - (t - a.contact) / .35 : 1;
    ctx.globalAlpha = fade;
    if (origin) spellRibbon(ctx, {x:origin.x+35,y:origin.y-55}, focus, t, C.amber);
    for (const [i,stroke] of [C.rose,C.paper,C.teal].entries()) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.beginPath();ctx.moveTo(focus.x,focus.y-13-i*2);ctx.lineTo(focus.x+9+i*3,focus.y);ctx.lineTo(focus.x,focus.y+13+i*2);ctx.lineTo(focus.x-9-i*3,focus.y);ctx.closePath();ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + .2, radius = 21 + Math.sin(t * 13 + i) * 3;
      spellShard(ctx, focus.x + Math.cos(angle) * radius, focus.y + Math.sin(angle) * radius, 5 + i % 3, i % 2 ? C.rose : C.pale);
    }
    if (t >= a.contact - .19) {
      const travel = easing((t - a.contact + .19) / .19);
      for (const [i,target] of targets.entries()) {
        const end = { x: target.home.x, y: target.home.y - 37 };
        const dx=end.x-focus.x,dy=end.y-focus.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
        const tip={x:focus.x+dx*travel,y:focus.y+dy*travel};
        spellRibbon(ctx,focus,tip,t,[C.rose,C.pale,C.amber][i%3]);
        ctx.fillStyle=[C.paper,C.pale,C.rose][i%3];
        ctx.beginPath();ctx.moveTo(tip.x+ux*8,tip.y+uy*8);ctx.lineTo(tip.x-ux*17-uy*3,tip.y-uy*17+ux*3);ctx.lineTo(tip.x-ux*30,tip.y-uy*30);ctx.lineTo(tip.x-ux*17+uy*3,tip.y-uy*17-ux*3);ctx.closePath();ctx.fill();
        line(ctx, tip.x - ux * 25, tip.y - uy * 25, tip.x - ux * 4, tip.y - uy * 4, i % 2 ? C.teal : C.rose);
        for (let mote = 0; mote < 3; mote++) {
          const back = 36 + mote * 11, side = (mote % 2 ? -1 : 1) * (4 + mote * 2);
          ctx.fillStyle = mote === 0 ? C.paper : C.rose;
          ctx.fillRect(Math.round(tip.x - ux * back - uy * side), Math.round(tip.y - uy * back + ux * side), 3 - mote % 2, 2);
        }
      }
    }
    ctx.globalAlpha=1;
  }
  if (dawn && t >= .18 && t < a.contact + .46) {
    const focus={x:355,y:164}, build=clamp((t-.18)/(a.contact-.18),0,1), colors=[C.rose,C.pale,C.amber];
    const fade=t>a.contact?1-(t-a.contact)/.46:1;
    ctx.globalAlpha=fade;
    for(const [i,actor] of active.entries()){
      const p=actorVisual(b,actor,state),r=10+build*21;
      spellRibbon(ctx,{x:p.x+18,y:p.y-51},focus,t,colors[i]);
      spellArc(ctx,focus.x,focus.y,r+i*4,-Math.PI*.92+i*1.6,-Math.PI*.92+i*1.6+Math.PI*1.1,[colors[i],C.paper],2);
    }
    spellShard(ctx,focus.x,focus.y,8+build*7,C.amber);
    if(t>=a.contact){
      const p=(t-a.contact)/.46,cx=targets.reduce((n,e)=>n+e.home.x,0)/Math.max(1,targets.length),cy=284,r=67+p*40;
      spellArc(ctx,cx,cy,r,Math.PI,Math.PI*2,['#926c4f',C.amber,C.paper,C.pale],4);
      spellArc(ctx,cx,cy,r+12,Math.PI,Math.PI*2,[C.amber,C.pale],2);
      spellRibbon(ctx,focus,{x:cx-r*.72,y:cy-r*.65},t,C.amber);
      for(let i=0;i<11;i++){
        const angle=Math.PI+i*Math.PI/10,inner=r+24,outer=inner+9+(i%2)*9;
        const x=cx+Math.cos(angle)*outer,y=cy+Math.sin(angle)*outer;
        spellShard(ctx,x,y,6+(i%3)*3,i%2?C.amber:C.pale);
      }
      for(const target of targets)for(let i=0;i<3;i++)spellShard(ctx,target.home.x-12+i*12,target.home.y-27-p*25,6+i*3,i%2?C.amber:C.pale);
    }
    ctx.globalAlpha=1;
  }
  if (t >= .22 && t < a.contact && !prism && !dawn && (spell || support || a.command.effect === 'telegraph')) {
    for (const actor of active) {
      const p = actorVisual(b, actor, state), r = 13 + Math.floor(t * 12);
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 48 - r); ctx.lineTo(p.x + r, p.y - 48); ctx.lineTo(p.x, p.y - 48 + r); ctx.lineTo(p.x - r, p.y - 48); ctx.closePath(); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 + t * 3;
        ctx.fillStyle = color; ctx.fillRect(Math.round(p.x + Math.cos(angle) * (r + 6)), Math.round(p.y - 48 + Math.sin(angle) * (r + 6)), 2, 2);
      }
    }
  }
  if (t >= a.contact - .12 && t < a.contact && spell && !support && !prism && !dawn) {
    for (const target of targets) {
      const start = actorVisual(b, active[0], state), p = easing((t - a.contact + .12) / .12);
      const x = start.x + (target.home.x - start.x) * p, y = start.y - 47 + (target.home.y - start.y + 20) * p;
      line(ctx, start.x, start.y - 47, x, y, color);
      ctx.fillStyle = C.paper; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
    }
  }
  if (drone && t >= a.contact - .045 && t < a.contact + .15) {
    const p=actorVisual(b,drone,state),bounds=actorBounds(drone.id,{pose:'attack',side:'enemy',scale:artScale(b,drone),facing:'left'});
    const from={x:p.x+bounds.left/DISPLAY_SCALE+3,y:p.y+(bounds.top+(bounds.bottom-bounds.top)*.58)/DISPLAY_SCALE};
    for(const target of targets){
      const hit=actorVisual(b,target,state),body=actorBounds(target.id,{pose:hit.pose,side:target.side,scale:artScale(b,target),facing:hit.facing});
      const to={x:hit.x+body.right/DISPLAY_SCALE*.8,y:hit.y+body.top/DISPLAY_SCALE*.5};
      ctx.globalAlpha=clamp(1-(t-a.contact)/.15,0,1);
      ctx.strokeStyle='#6cc5b6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
      line(ctx,from.x,from.y,to.x,to.y,C.paper);
      ctx.fillStyle=C.pale;ctx.fillRect(Math.round(to.x)-2,Math.round(to.y)-2,4,4);
    }
    ctx.globalAlpha=1;
  }
  if (enemyWave && t >= a.contact - .2 && t < a.contact + .38) {
    const p = clamp((t - a.contact + .2) / .2, 0, 1), after = Math.max(0, (t - a.contact) / .38);
    const origin = actorVisual(b, active[0], state), center = { x: 207, y: 243 };
    const waveColor = active[0].id === 'void_architect' ? '#b695d0' : ['ice', 'snow'].includes(b.biome) ? '#a5d6dc' : b.biome === 'volcanic' ? '#e9a05e' : C.pale;
    ctx.globalAlpha = 1 - after;
    if (t < a.contact) {
      const x = origin.x + (center.x - origin.x) * p;
      ctx.strokeStyle = waveColor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, 236, 9 + p * 23, 17 + p * 51, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
      line(ctx, x + 10, 221, x + 35, 221, C.paper);
      line(ctx, x + 13, 249, x + 42, 249, waveColor);
    }
    for (const target of targets) {
      const hit = actorVisual(b, target, state), radius = t < a.contact ? 18 * p : 18 + after * 21;
      spellArc(ctx, hit.x, hit.y, radius, 0, Math.PI * 2, [waveColor,C.paper], 2, .3);
      if (t >= a.contact) {
        for (let i = -1; i <= 1; i++) {
          const x = hit.x + i * (12 + after * 15), y = hit.y - 17 - after * 38;
          spellShard(ctx, x, y, 12 + Math.abs(i) * 4, waveColor);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  if (t >= a.contact && t < a.contact + .38) {
    const p = (t - a.contact) / .38;
    for (const target of targets) {
      const hit = actorVisual(b, target, state), x = hit.x, y = hit.y - 32;
      ctx.globalAlpha = 1 - p;
      if (support) {
        groundRing(ctx, x, hit.y - p * 15, 19 + p * 19, color);
        for (let i = 0; i < 5; i++) {
          const px = x - 25 + i * 12, py = y + 25 - p * 52 + Math.sin(i * 9) * 7;
          line(ctx, px - 3, py, px + 3, py, color); line(ctx, px, py - 3, px, py + 3, color);
        }
      } else if (a.command.effect !== 'telegraph' && !prism && !dawn && !drone && !enemyWave) {
        const radius = 15 + p * 37;
        for (let i = 0; i < 7; i++) {
          const angle = i * Math.PI * 2 / 7 + .4;
          const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius * .65;
          ctx.fillStyle = i % 2 ? color : C.paper; ctx.fillRect(Math.round(px), Math.round(py), i % 2 ? 4 : 2, 2);
        }
        ctx.strokeStyle = a.critical ? C.amber : C.paper; ctx.lineWidth = a.critical ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(x - 24 + p * 10, y + 25); ctx.lineTo(x + 26 - p * 8, y - 25); ctx.stroke();
        if (a.critical) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 29, y - 14); ctx.lineTo(x + 30, y + 14); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function drawBattle(ctx, b, state, time = b.clock) {
  // Rendering derives motion solely from the frozen simulation clock. The unused
  // external time argument is retained for the shared renderer contract.
  const now = b.clock;
  b.hitAreas = [];
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // Reframe the existing backdrop with the lifted formation: its ground plane
  // stays under the crew, while the extra lower field fills behind the dock.
  ctx.save(); ctx.translate(0, -108); ctx.scale(1, 1.2);
  drawBattleBackdrop(ctx, b.biome, now);
  ctx.restore();
  ctx.scale(DISPLAY_SCALE, DISPLAY_SCALE);
  // The field is lifted slightly to leave the folding command dock unobstructed.
  ctx.translate(0, FIELD_OFFSET_Y);
  const potential = validTargets(b, b.pending);
  const group = b.pending?.target === 'allAllies' || b.pending?.target === 'allEnemies';
  const highlighted = b.mode === 'target' ? group ? potential : [potential[b.target]].filter(Boolean) : [];
  const contactPriority = actor => b.action && b.action.elapsed >= .23 && b.action.elapsed <= b.action.contact + .24 && b.action.participants.includes(actorId(actor)) ? 1000 : 0;
  // At contact the striking limb belongs in front of the struck silhouette.
  // Without this pass the crab's shell would paint over Kaida's entire blade.
  const actors = [...b.heroes, ...b.enemies].sort((a, z) => actorVisual(b, a, state).y + contactPriority(a) - actorVisual(b, z, state).y - contactPriority(z));
  for (const actor of actors) {
    const p = actorVisual(b, actor, state);
    if (!alive(actor) && actor.side === 'enemy' && p.opacity <= 0) continue;
    const hero = actor.side === 'hero';
    const scale = artScale(b, actor);
    const bounds = actorBounds(actor.id, { pose: 'idle', side: actor.side, scale, facing: hero ? 'right' : 'left' });
    const boundsLeft = bounds.left / DISPLAY_SCALE - 5, boundsTop = bounds.top / DISPLAY_SCALE - 5;
    const boundsWidth = (bounds.right - bounds.left) / DISPLAY_SCALE + 10, boundsHeight = (bounds.bottom - bounds.top) / DISPLAY_SCALE + 10;
    if (highlighted.includes(actor)) groundRing(ctx, actor.home.x, actor.home.y, actor.tier >= 5 ? 46 : 32, hero ? C.pale : C.rose);
    if (hero && b.selectedHero === actor.id && alive(actor)) groundRing(ctx, actor.home.x, actor.home.y, 25, C.amber, true);
    if (actor.shield && alive(actor)) {
      ctx.globalAlpha = .65; ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 26, hero ? 27 : 34, hero ? 34 : 41, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (!alive(actor)) ctx.globalAlpha = p.opacity;
    const artOptions = { time: p.animationTime, facing: p.facing, pose: b.result === 'victory' && hero && alive(actor) ? 'victory' : p.pose, poseProgress: p.progress, actionElapsed: b.action?.elapsed || 0, strikeProgress: b.action ? clamp((b.action.elapsed - b.action.contact + .19) / .37, 0, 1) : 0, moving: p.moving, scale };
    ctx.save(); ctx.scale(1 / DISPLAY_SCALE, 1 / DISPLAY_SCALE);
    if (hero) drawHero(ctx, actor.id, Math.round(p.x * DISPLAY_SCALE), Math.round(p.y * DISPLAY_SCALE), artOptions);
    else drawEnemy(ctx, actor.id, Math.round(p.x * DISPLAY_SCALE), Math.round(p.y * DISPLAY_SCALE), artOptions);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (highlighted.includes(actor)) {
      brackets(ctx, actor.home.x + boundsLeft, actor.home.y + boundsTop, boundsWidth, boundsHeight, hero ? C.pale : C.rose);
      if (hero) text(ctx, group ? 'ALL' : 'TARGET', actor.home.x, Math.max(62, actor.home.y + boundsTop - 6), C.paper, 8, 'center');
    }
    if (!hero && alive(actor)) {
      const y = actor.home.y + boundsTop - 10;
      const label = trim(ctx, actor.name, 124, 9);
      ctx.font = '9px Barlow, sans-serif';
      const labelWidth = Math.ceil(ctx.measureText(label).width) + 8;
      ctx.fillStyle = '#171717bc'; ctx.fillRect(Math.round(actor.home.x - labelWidth / 2), y - 10, labelWidth, 13);
      text(ctx, label, actor.home.x, y, C.paper, 9, 'center');
      bar(ctx, actor.home.x - 35, y + 5, 70, 3, actor.hp / actor.maxHp, actor.charging || highlighted.includes(actor) ? C.amber : C.pale);
      bar(ctx, actor.home.x - 35, y + 10, 70, 1, actor.atb / 100, C.pale);
      if (actor.charging) text(ctx, '!', actor.home.x + 44, y + 9, C.amber, 13);
      if (actor.slowTurns) text(ctx, 'SLOW', actor.home.x + 42, y + 9, C.pale, 7);
      if (actor.shield) text(ctx, `WARD ${actor.shield}`, actor.home.x, y + 22, C.pale, 8, 'center');
    }
    button(b, actor.home.x + boundsLeft, actor.home.y + boundsTop + FIELD_OFFSET_Y, boundsWidth, boundsHeight + 19, 'actor', { id: actorId(actor) });
  }
  drawEffect(ctx, b, state);
  for (const f of b.floaters) {
    const age = 1 - f.life / f.maxLife;
    const y = f.y - Math.min(19, age * 35);
    ctx.globalAlpha = Math.min(1, f.life * 4);
    const color = f.kind === 'crit' || f.kind === 'warning' ? C.amber : f.kind === 'heal' || f.kind === 'shield' ? C.pale : C.paper;
    ctx.font = `${f.kind === 'crit' ? 17 : 13}px Barlow, sans-serif`;
    const width = ctx.measureText(f.text).width;
    ctx.fillStyle = C.ink; ctx.fillRect(Math.round(f.x - width / 2 - 4), Math.round(y - 12), Math.round(width + 8), 17);
    text(ctx, f.text, f.x, y, color, f.kind === 'crit' ? 17 : 13, 'center'); ctx.globalAlpha = 1;
  }
  ctx.translate(0, -FIELD_OFFSET_Y);
  if (b.result) {
    ctx.fillStyle = 'rgba(20,20,20,.93)'; ctx.fillRect(229, 108, 310, 86);
    line(ctx, 241, 113, 527, 113, C.amber); line(ctx, 241, 188, 527, 188, C.teal);
    text(ctx, b.result === 'victory' ? 'The signal holds' : b.result === 'retreat' ? 'A path remains' : 'A light in the dark', 384, 147, C.paper, 23, 'center', 'Barlow, sans-serif');
    text(ctx, b.result === 'victory' ? 'VICTORY' : b.result === 'retreat' ? 'WITHDRAWN' : 'THE CREW WILL RISE AGAIN', 384, 174, C.amber, 10, 'center');
  }
  ctx.restore();
}

// Canvas actors and DOM controls dispatch exactly the same combat intents.
// Keep this boundary free of rendering and DOM assumptions for suspended saves.
export function battleIntent(b, state, area) {
  if (!area) return false;
  if (area.kind === 'pause') return 'pause';
  if (b.result) return false;
  b.inputSerial++;
  if (b.action) {
    if (area.kind === 'timing') timingPress(b);
    return true;
  }
  cleanQueue(b);
  if (area.kind === 'breadcrumb') {
    if (area.stage === 0) { b.mode = 'waiting'; b.pending = null; b.cursor = 0; }
    if (area.stage === 1 && b.selectedHero) {
      const previous = b.pending;
      b.mode = previous?.returnMode || 'command';
      b.cursor = previous?.returnCursor || 0; b.pending = null;
    }
    return true;
  }
  if ((area.kind === 'hero' || area.kind === 'actor' && actorById(b, area.id)?.side === 'hero') && b.mode !== 'target') {
    if (!b.readyQueue.includes(area.id)) { notice(b, 'That companion is not ready yet.'); return true; }
    b.selectedHero = area.id; b.lastSelectedHero = area.id; b.mode = 'command'; b.cursor = 0; b.pending = null; return true;
  }
  if ((area.kind === 'actor' || area.kind === 'hero' || area.kind === 'target') && b.mode === 'target') {
    const index = validTargets(b, b.pending).findIndex(t => actorId(t) === area.id);
    if (index >= 0) b.target = index;
    return true;
  }
  if (area.kind === 'command' && b.selectedHero) {
    b.mode = 'command'; b.cursor = area.index; b.pending = null; rootConfirm(b, state); return true;
  }
  if (area.kind === 'list') {
    b.cursor = area.index;
    if (b.mode === 'tech') {
      const tech = listTechs(b, state)[b.cursor];
      if (tech?.unavailable) notice(b, tech.unavailable);
      else if (tech) chooseCommand(b, state, commandFromTech(b, tech));
    } else if (b.mode === 'item') {
      const item = listItems(state)[b.cursor];
      if (item) chooseCommand(b, state, { ...item, kind: 'item', target: 'ally', participants: [b.selectedHero], returnMode: 'item', returnCursor: b.cursor });
    }
    return true;
  }
  if (area.kind === 'scroll') {
    const items = b.mode === 'tech' ? listTechs(b, state) : listItems(state);
    b.cursor = clamp(b.cursor + area.direction * 5, 0, Math.max(0, items.length - 1));
    return true;
  }
  if (area.kind === 'back') { battleKey(b, state, 'ArrowLeft'); return true; }
  if (area.kind === 'execute') { commitTarget(b, state); return true; }
  if (area.kind === 'open' && b.selectedHero) { b.mode = 'command'; b.cursor = 0; return true; }
  return false;
}

export function battleClick(b, state, x, y) {
  x /= DISPLAY_SCALE; y /= DISPLAY_SCALE;
  // Retain the original native pause hit area for existing input integrations.
  if (x >= 658 && x <= 757 && y >= 26 && y <= 46) return 'pause';
  const area = [...b.hitAreas].reverse().find(a => x >= a.x && y >= a.y && x <= a.x + a.w && y <= a.y + a.h);
  return battleIntent(b, state, area);
}
