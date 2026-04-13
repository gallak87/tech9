// Chronoforge — main entry. Phase 2: overworld + menu shell + first-deploy readiness.

import {
  drawSplash, drawOverworld,
  initParty, updateOverworld,
} from './scenes.js';
import {
  initBase, initTierState, maybeTick, drawBaseScene,
  handleBaseMouseDown, handleBaseMouseMove, handleBaseKey,
} from './base.js';
import {
  menuState, toggleMenu, closeMenu, handleMenuKey,
  handleMenuMouseDown, handleMenuMouseMove, handleMenuMouseUp, handleMenuWheel,
  drawMenu,
} from './menu.js';
import { initBattle, updateBattle, drawBattle, handleBattleKey } from './battle.js';
import { initAudio, resumeAudio, playSfx } from './audio.js';
import { PLAYER_START, MAP_W, MAP_H } from './world.js';

const STATES = Object.freeze({
  SPLASH: 'splash',
  OVERWORLD: 'overworld',
  BATTLE: 'battle',
  BASE: 'base',
});

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const game = {
  state: STATES.SPLASH,
  time: 0,
  frame: 0,
  lastT: 0,
  width: 0, height: 0,
  keys: new Set(),
  mouseX: 0, mouseY: 0,

  party: initParty(),
  explored: new Set(),
  resources: { food: 10, ore: 150, energy: 0, renown: 0, skillPoints: 0 },
  toastMsg: null,
  toastExpire: 0,
  pendingEncounter: null,
  base: initBase(),
  ...initTierState(),

  setState(next) {
    if (this.state === next) return;
    this.state = next;
    if (next === 'battle' && this.pendingEncounter) {
      initBattle(this, this.pendingEncounter);
    }
  },
  toast(msg) {
    this.toastMsg = msg;
    this.toastExpire = this.time + 2200;
  },
};

// seed initial exploration around starting position
(function seedExplored() {
  const r = 4;
  for (let y = PLAYER_START.y - r; y <= PLAYER_START.y + r; y++) {
    for (let x = PLAYER_START.x - r; x <= PLAYER_START.x + r; x++) {
      if ((x - PLAYER_START.x) ** 2 + (y - PLAYER_START.y) ** 2 <= r * r) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) game.explored.add(`${x},${y}`);
      }
    }
  }
})();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.width = window.innerWidth;
  game.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- input ---
window.addEventListener('keydown', (e) => {
  const k = e.key;
  game.keys.add(k);

  // first keypress unlocks audio context (browser autoplay policy)
  initAudio(); resumeAudio();

  if (k === 'Escape' || k === 'Tab') {
    e.preventDefault();
    const wasOpen = menuState.open;
    toggleMenu();
    playSfx(wasOpen ? 'ui_menu_close' : 'ui_menu_open', { gain: 0.5 });
    return;
  }

  if (menuState.open) {
    handleMenuKey(k, game);
    return;
  }

  if (game.state === STATES.SPLASH && (k === 'Enter' || k === ' ')) {
    game.setState(STATES.OVERWORLD);
    playSfx('ui_click');
    return;
  }

  if (game.state === STATES.BATTLE) {
    handleBattleKey(game, k);
    return;
  }

  if (game.state === STATES.OVERWORLD) {
    if (k === 'c' || k === 'C') game.setState(STATES.BASE);
  } else if (game.state === STATES.BASE) {
    if (handleBaseKey(game, k)) { e.preventDefault(); return; }
  }
});

window.addEventListener('keyup', (e) => { game.keys.delete(e.key); });

canvas.addEventListener('mousedown', (e) => {
  game.mouseX = e.clientX; game.mouseY = e.clientY;
  if (menuState.open) { handleMenuMouseDown(e.clientX, e.clientY, game); return; }
  if (game.state === STATES.BASE) handleBaseMouseDown(game, e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e) => {
  game.mouseX = e.clientX; game.mouseY = e.clientY;
  if (menuState.open) { handleMenuMouseMove(e.clientX, e.clientY, game); return; }
  if (game.state === STATES.BASE) handleBaseMouseMove(game, e.clientX, e.clientY);
});
canvas.addEventListener('mouseup', () => {
  if (menuState.open) handleMenuMouseUp();
});
canvas.addEventListener('wheel', (e) => {
  if (menuState.open) {
    if (handleMenuWheel(e.deltaY, e.clientX, e.clientY, game)) e.preventDefault();
  }
}, { passive: false });

// prevent right-click menu for cleaner feel (optional)
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- main loop ---
function frame(t) {
  const dt = Math.min(50, t - game.lastT || 16);
  game.lastT = t;
  game.time = t;
  game.frame++;

  // update
  if (!menuState.open) {
    if (game.state === STATES.OVERWORLD) updateOverworld(game, dt);
    else if (game.state === STATES.BATTLE) updateBattle(game, dt);
    // resource tick runs on overworld + base per gamedesign spec
    if (game.state === STATES.OVERWORLD || game.state === STATES.BASE) maybeTick(game, t);
  }

  // render
  switch (game.state) {
    case STATES.SPLASH: drawSplash(ctx, game); break;
    case STATES.OVERWORLD: drawOverworld(ctx, game); break;
    case STATES.BATTLE: drawBattle(ctx, game); break;
    case STATES.BASE: drawBaseScene(ctx, game); break;
  }

  if (menuState.open) drawMenu(ctx, game);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
