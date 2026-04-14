// Chronoforge — main entry.
// Renderer: PixiJS v8 wrapping an offscreen Canvas 2D that all scene draw
// functions target. Pixi owns the WebGL context on #canvas, blits the offscreen
// as a Sprite, and applies the filter stack (color-grade + bloom + CRT + RGB
// split). Scene draw code remains Canvas 2D so we can port one layer at a time.

import { Application, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, CRTFilter } from 'pixi-filters';

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
import { TERRAIN_SETS, setTerrainSet, spriteSettings } from './sprites.js';
import { initHeroes, initInventory, initQuests } from './progression.js';

// --- DEV: floating terrain picker ---
(function mountTerrainPicker() {
  const sets = [null, ...TERRAIN_SETS];
  const el = document.createElement('div');
  el.id = 'terrain-picker';
  el.style.cssText = `
    position:fixed; left:12px; top:50%; transform:translateY(-50%);
    background:rgba(0,0,0,0.82); border:1px solid #555; border-radius:6px;
    padding:8px 10px; display:flex; flex-direction:column; gap:6px;
    font:700 11px ui-monospace,monospace; color:#ccc; z-index:9999;
    user-select:none;
  `;
  const label = document.createElement('div');
  label.style.cssText = 'text-align:center; font-size:9px; letter-spacing:1px; color:#888;';
  label.textContent = 'TERRAIN';

  const name = document.createElement('div');
  name.style.cssText = 'text-align:center; color:#fff; min-width:72px;';

  function refresh() {
    name.textContent = spriteSettings.terrainSet ? spriteSettings.terrainSet.toUpperCase() : 'DEFAULT';
  }

  function btnStyle(el) {
    el.style.cssText = `
      background:#222; border:1px solid #555; border-radius:3px;
      color:#adf; padding:3px 0; cursor:pointer; font:700 13px system-ui;
      text-align:center;
    `;
  }

  const prev = document.createElement('button');
  btnStyle(prev); prev.textContent = '▲';
  prev.onclick = () => {
    const i = sets.indexOf(spriteSettings.terrainSet);
    setTerrainSet(sets[(i - 1 + sets.length) % sets.length]);
    refresh();
  };

  const next = document.createElement('button');
  btnStyle(next); next.textContent = '▼';
  next.onclick = () => {
    const i = sets.indexOf(spriteSettings.terrainSet);
    setTerrainSet(sets[(i + 1) % sets.length]);
    refresh();
  };

  el.append(label, prev, name, next);
  document.body.appendChild(el);
  refresh();
})();

const fxSettings = { grade: true, bloom: true, rgb: false, crt: false };

const STATES = Object.freeze({
  SPLASH: 'splash',
  OVERWORLD: 'overworld',
  BATTLE: 'battle',
  BASE: 'base',
});

const htmlCanvas = document.getElementById('canvas');

// Offscreen canvas — target for all existing Canvas 2D draw code.
const offscreen = document.createElement('canvas');
const ctx = offscreen.getContext('2d');

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
  heroes: initHeroes(),
  inventory: initInventory(),
  quests: initQuests(),
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
  const stack = [];
  if (fxSettings.grade) stack.push(filterColorGrade);
  if (fxSettings.bloom) stack.push(filterBloom);
  if (fxSettings.rgb) stack.push(filterRGB);
  if (fxSettings.crt) stack.push(filterCRT);
  sceneSprite.filters = stack;
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

htmlCanvas.addEventListener('mousedown', (e) => {
  game.mouseX = e.clientX; game.mouseY = e.clientY;
  if (menuState.open) { handleMenuMouseDown(e.clientX, e.clientY, game); return; }
  if (game.state === STATES.BASE) handleBaseMouseDown(game, e.clientX, e.clientY);
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
    else if (game.state === STATES.BATTLE) updateBattle(game, dt);
    if (game.state === STATES.OVERWORLD || game.state === STATES.BASE) maybeTick(game, t);
  }

  switch (game.state) {
    case STATES.SPLASH:    drawSplash(ctx, game); break;
    case STATES.OVERWORLD: drawOverworld(ctx, game); break;
    case STATES.BATTLE:    drawBattle(ctx, game); break;
    case STATES.BASE:      drawBaseScene(ctx, game); break;
  }
  if (menuState.open) drawMenu(ctx, game);

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
})();
