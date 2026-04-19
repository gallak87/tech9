// Chronoforge — main entry.
// Renderer: PixiJS v8 wrapping an offscreen Canvas 2D that all scene draw
// functions target. Pixi owns the WebGL context on #canvas, blits the offscreen
// as a Sprite, and applies the filter stack (color-grade + bloom + CRT + RGB
// split). Scene draw code remains Canvas 2D so we can port one layer at a time.

import { Application, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, CRTFilter } from 'pixi-filters';

import {
  drawSplash, drawOverworld, drawMapScene,
  initParty, initExplored, updateOverworld,
} from './scenes.js';
import { updateTravel, drawTravel } from './travel.js';
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
import { updateCity, drawCityScene, handleCityMouseDown, handleCityKey } from './city.js';
import { initAudio, resumeAudio, playSfx } from './audio.js';
import { PLAYER_START, MAP_W, MAP_H, MAPS } from './world.js';
import { initHeroes, initInventory, initQuests, ITEM_DEFS, hasSave, loadGame, saveGame } from './progression.js';
// --- DEV: floating panel (bottom-right). Speed toggle, fog reveal, rewards replay. ---
function mountDevPanel() {
  const el = document.createElement('div');
  el.id = 'dev-panel';
  el.style.cssText = `
    position:fixed; right:12px; bottom:12px;
    background:rgba(0,0,0,0.82); border:1px solid #555; border-radius:6px;
    padding:8px 10px; display:flex; flex-direction:column; gap:6px;
    font:700 11px ui-monospace,monospace; color:#ccc; z-index:9999;
    user-select:none; min-width:132px;
  `;

  const label = document.createElement('div');
  label.style.cssText = 'text-align:center; font-size:9px; letter-spacing:1px; color:#888;';
  label.textContent = 'DEV';

  function btnStyle(b) {
    b.style.cssText = `
      background:#222; border:1px solid #555; border-radius:3px;
      color:#adf; padding:4px 6px; cursor:pointer; font:700 10px ui-monospace,monospace;
      text-align:center;
    `;
  }

  // battle speed 1x / 3x
  const speedRow = document.createElement('div');
  speedRow.style.cssText = 'display:flex; gap:3px; align-items:center;';
  const speedLbl = document.createElement('div');
  speedLbl.style.cssText = 'font-size:9px; color:#888; flex:1;';
  speedLbl.textContent = 'BATTLE';
  const speedBtns = [1, 3].map((v) => {
    const b = document.createElement('button');
    btnStyle(b);
    b.textContent = `${v}x`;
    b.onclick = () => { game.battleSpeed = v; refreshSpeed(); };
    speedRow.appendChild(b);
    return { v, el: b };
  });
  function refreshSpeed() {
    for (const s of speedBtns) {
      const active = (game.battleSpeed || 1) === s.v;
      s.el.style.background = active ? '#444' : '#222';
      s.el.style.color = active ? '#fff' : '#adf';
    }
  }
  speedRow.prepend(speedLbl);

  // fog reveal toggle
  const fogBtn = document.createElement('button');
  btnStyle(fogBtn);
  function refreshFog() {
    fogBtn.textContent = `FOG: ${game.devFogReveal ? 'OFF (revealed)' : 'ON'}`;
    fogBtn.style.color = game.devFogReveal ? '#6f6' : '#adf';
  }
  fogBtn.onclick = () => { game.devFogReveal = !game.devFogReveal; refreshFog(); };

  // minimap hud toggle
  const minimapBtn = document.createElement('button');
  btnStyle(minimapBtn);
  function refreshMinimap() {
    minimapBtn.textContent = `MINIMAP: ${game.devMinimap ? 'ON' : 'OFF'}`;
    minimapBtn.style.color = game.devMinimap ? '#6f6' : '#adf';
  }
  minimapBtn.onclick = () => { game.devMinimap = !game.devMinimap; refreshMinimap(); };

  // replay rewards
  const rewardsBtn = document.createElement('button');
  btnStyle(rewardsBtn);
  rewardsBtn.textContent = 'REPLAY REWARDS';
  rewardsBtn.onclick = () => {
    game.showRewards([
      { icon: 'icon_renown',      label: 'Renown', amount: 4 },
      { icon: 'icon_ore',         label: 'Ore',    amount: 4 },
      { icon: 'icon_skill_point', label: 'XP',     amount: 40 },
    ]);
  };

  el.append(label, speedRow, fogBtn, minimapBtn, rewardsBtn);
  document.body.appendChild(el);
  refreshSpeed();
  refreshFog();
  refreshMinimap();
}

const fxSettings = { grade: true, bloom: true, rgb: false, crt: false };

const STATES = Object.freeze({
  SPLASH: 'splash',
  OVERWORLD: 'overworld',
  BATTLE: 'battle',
  BASE: 'base',
  TRAVEL: 'travel',
  CITY: 'city',
});

const htmlCanvas = document.getElementById('canvas');

// Offscreen canvas — target for all existing Canvas 2D draw code.
const offscreen = document.createElement('canvas');
const ctx = offscreen.getContext('2d');

const game = {
  state: STATES.SPLASH,
  splashCursor: 0, // 0 = CONTINUE, 1 = NEW GAME (only relevant when hasSave())
  time: 0,
  frame: 0,
  lastT: 0,
  width: 0, height: 0,
  keys: new Set(),
  mouseX: 0, mouseY: 0,

  party: initParty(),
  explored: initExplored(),
  resources: { food: 10, ore: 150, energy: 0, renown: 0, skillPoints: 0 },
  heroes: initHeroes(),
  inventory: initInventory(),
  quests: initQuests(),
  toastMsg: null,
  toastExpire: 0,
  devFogReveal: false,
  devMinimap: true,
  battleSpeed: 1,
  rewards: null,
  rewardsExpire: 0,
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
  showRewards(items) {
    this.rewards = items.filter(it => it.amount > 0);
    this.rewardsExpire = this.time + 3000;
  },
  pickUpWorldDrop(drop) {
    const def = ITEM_DEFS[drop.itemId];
    if (!def) return;
    this.inventory.push({ id: drop.itemId });
    this.showRewards([{ icon: `icon_${drop.itemId}`, label: def.name, amount: 1 }]);
  },
};

(function seedExplored() {
  const r = 9;
  const start = game.explored[PLAYER_START.mapId];
  for (let y = PLAYER_START.y - r; y <= PLAYER_START.y + r; y++) {
    for (let x = PLAYER_START.x - r; x <= PLAYER_START.x + r; x++) {
      if ((x - PLAYER_START.x) ** 2 + (y - PLAYER_START.y) ** 2 <= r * r) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) start.add(`${x},${y}`);
      }
    }
  }
})();

// --- Pixi app + filter stack ---
const app = new Application();
let sceneTexture = null;
let sceneSprite = null;
let filterColorGrade = null;
let filterBloom = null;
let filterRGB = null;
let filterCRT = null;

async function initPixi() {
  await app.init({
    canvas: htmlCanvas,
    width: window.innerWidth,
    height: window.innerHeight,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: false,
    background: 0x07060d,
    preference: 'webgl',
  });
  app.canvas.style.display = 'block';
  app.canvas.style.imageRendering = 'auto'; // let the filters dictate the look

  sceneTexture = Texture.from(offscreen);
  sceneSprite = new Sprite(sceneTexture);
  app.stage.addChild(sceneSprite);

  // Neon/synthwave grade — slight saturation + subtle magenta bias
  filterColorGrade = new ColorMatrixFilter();
  filterColorGrade.saturate(0.25, true);

  // Bloom on bright pixels for the neon glow
  filterBloom = new AdvancedBloomFilter({
    threshold: 0.82,
    bloomScale: 0.45,
    brightness: 1.0,
    blur: 5,
    quality: 6,
  });

  // Chromatic aberration — very subtle
  filterRGB = new RGBSplitFilter({ red: [-1, 0], green: [0, 1], blue: [1, 0] });

  // Scanlines + curvature for the CRT vibe
  filterCRT = new CRTFilter({
    curvature: 1.2,
    lineWidth: 1.0,
    lineContrast: 0.12,
    verticalLine: false,
    noise: 0.04,
    noiseSize: 1.0,
    vignetting: 0.25,
    vignettingAlpha: 0.5,
    vignettingBlur: 0.3,
    seed: 0,
  });

  applyFx();
}

function applyFx() {
  if (!sceneSprite) return;
  // menu open → bypass all filters so UI text stays crisp (bloom blurs it).
  if (menuState.open) { sceneSprite.filters = []; return; }
  const stack = [];
  if (fxSettings.grade) stack.push(filterColorGrade);
  if (fxSettings.bloom) stack.push(filterBloom);
  if (fxSettings.rgb) stack.push(filterRGB);
  if (fxSettings.crt) stack.push(filterCRT);
  sceneSprite.filters = stack;
}

let _lastMenuOpen = false;
function syncMenuFilters() {
  if (menuState.open !== _lastMenuOpen) {
    _lastMenuOpen = menuState.open;
    applyFx();
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  offscreen.width = Math.floor(w * dpr);
  offscreen.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.width = w;
  game.height = h;

  if (app.renderer) {
    app.renderer.resize(w, h);
  }
  if (sceneTexture) {
    sceneTexture.source.resize(offscreen.width, offscreen.height, 1);
  }
  if (sceneSprite) {
    sceneSprite.width = w;
    sceneSprite.height = h;
  }
}

// --- input (attached to the HTML canvas — same element Pixi renders into) ---
window.addEventListener('keydown', (e) => {
  const k = e.key;
  game.keys.add(k);

  initAudio(); resumeAudio();

  if (k === 'Escape' || k === 'Tab') {
    e.preventDefault();
    if (k === 'Escape' && (game.base?.pickerOpen || game.base?.upgradeOpen)) {
      game.base.pickerOpen = false;
      game.base.upgradeOpen = false;
      playSfx('ui_menu_close', { gain: 0.5 });
      return;
    }
    const wasOpen = menuState.open;
    toggleMenu();
    playSfx(wasOpen ? 'ui_menu_close' : 'ui_menu_open', { gain: 0.5 });
    return;
  }

  if (menuState.open) {
    handleMenuKey(k, game);
    return;
  }

  if (game.state === STATES.SPLASH) {
    if (hasSave()) {
      if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'w' || k === 'a') {
        game.splashCursor = 0; return;
      }
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 's' || k === 'd') {
        game.splashCursor = 1; return;
      }
      if (k === 'Enter' || k === ' ') {
        if (game.splashCursor === 0) {
          loadGame(game);
        }
        // cursor === 1: new game — keep default state, just transition
        game.setState(STATES.OVERWORLD);
      }
    } else if (k === 'Enter' || k === ' ') {
      game.setState(STATES.OVERWORLD);
    }
    playSfx('ui_click');
    return;
  }

  if (game.state === STATES.BATTLE) {
    handleBattleKey(game, k);
    return;
  }

  if (game.state === STATES.BASE) {
    if (handleBaseKey(game, k)) { e.preventDefault(); return; }
  } else if (game.state === STATES.OVERWORLD && (game.base?.pickerOpen || game.base?.upgradeOpen)) {
    if (handleBaseKey(game, k)) { e.preventDefault(); return; }
  } else if (game.state === STATES.OVERWORLD && (k === 'c' || k === 'C') && game.party.currentPlot) {
    const slot = game.base.slots[game.party.currentPlot.slotIdx];
    game.base.activeSlot = game.party.currentPlot.slotIdx;
    if (slot?.building) { game.base.upgradeOpen = true; game.base.upgradeCursor = 0; }
    else { game.base.pickerOpen = true; game.base.pickerCursor = 0; }
    playSfx('ui_click', { gain: 0.5 });
    e.preventDefault();
    return;
  } else if (game.state === STATES.CITY) {
    if (handleCityKey(game, k)) { e.preventDefault(); return; }
  } else if (game.state === STATES.TRAVEL) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => { game.keys.delete(e.key); });

htmlCanvas.addEventListener('mousedown', (e) => {
  game.mouseX = e.clientX; game.mouseY = e.clientY;
  if (menuState.open) { handleMenuMouseDown(e.clientX, e.clientY, game); return; }
  if (game.state === STATES.BASE) handleBaseMouseDown(game, e.clientX, e.clientY);
  else if (game.state === STATES.CITY) handleCityMouseDown(game, e.clientX, e.clientY);
  else if (game.state === STATES.OVERWORLD && (game.base?.pickerOpen || game.base?.upgradeOpen)) handleBaseMouseDown(game, e.clientX, e.clientY);
});
htmlCanvas.addEventListener('mousemove', (e) => {
  game.mouseX = e.clientX; game.mouseY = e.clientY;
  if (menuState.open) { handleMenuMouseMove(e.clientX, e.clientY, game); return; }
  if (game.state === STATES.BASE) handleBaseMouseMove(game, e.clientX, e.clientY);
});
htmlCanvas.addEventListener('mouseup', (e) => {
  if (menuState.open) handleMenuMouseUp(e.clientX, e.clientY, game);
});
htmlCanvas.addEventListener('wheel', (e) => {
  if (menuState.open) {
    if (handleMenuWheel(e.deltaY, e.clientX, e.clientY, game)) e.preventDefault();
  }
}, { passive: false });
htmlCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- main loop (driven by Pixi's ticker) ---
function tick(ticker) {
  const t = performance.now();
  const dt = Math.min(50, ticker.deltaMS);
  game.lastT = t;
  game.time = t;
  game.frame++;

  if (!menuState.open) {
    if (game.state === STATES.OVERWORLD) updateOverworld(game, dt);
    else if (game.state === STATES.BATTLE) updateBattle(game, dt * (game.battleSpeed || 1));
    else if (game.state === STATES.TRAVEL) updateTravel(game, dt);
    else if (game.state === STATES.CITY) updateCity(game, dt);
    if (game.state === STATES.OVERWORLD || game.state === STATES.BASE || game.state === STATES.CITY) maybeTick(game, t);
  }

  // Auto-save every 10s while on the overworld or traveling
  if (game.state === STATES.OVERWORLD || game.state === STATES.TRAVEL) {
    if (!game.lastAutoSave || t - game.lastAutoSave >= 10_000) {
      saveGame(game);
      game.lastAutoSave = t;
    }
  }

  switch (game.state) {
    case STATES.SPLASH:    drawSplash(ctx, game); break;
    case STATES.OVERWORLD: drawOverworld(ctx, game); break;
    case STATES.BATTLE:    drawBattle(ctx, game); break;
    case STATES.BASE:      drawBaseScene(ctx, game); break;
    case STATES.CITY:      drawCityScene(ctx, game); break;
    case STATES.TRAVEL:
      drawMapScene(ctx, game, game.party.mapId);
      drawTravel(ctx, game);
      break;
  }
  if (menuState.open) drawMenu(ctx, game);

  syncMenuFilters();

  // animate subtle per-frame filter drift so noise/CA don't look static
  if (fxSettings.crt && filterCRT) {
    filterCRT.time = (filterCRT.time || 0) + 0.08;
    filterCRT.seed = Math.random();
  }

  // push updated offscreen canvas to the GPU
  if (sceneTexture) sceneTexture.source.update();
}

// --- kickoff ---
(async () => {
  await initPixi();
  resize();
  window.addEventListener('resize', resize);
  app.ticker.add(tick);
  mountDevPanel();
})();
