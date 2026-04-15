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
import { WORLD_NAMES, devWorld, reloadAllWorlds } from './devWorld.js';

// --- DEV: floating terrain picker + biome-probe viewer ---
const PROBE = { active: false, feather: 0, images: null, mode: 'world' };
const PROBE_SIZES = [100, 400, 900];
const FEATHER_PRESETS = [0, 10, 30, 60];

function loadProbeImages() {
  if (PROBE.images) return PROBE.images;
  const load = (src) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
  PROBE.images = Promise.all(
    PROBE_SIZES.flatMap((s) => [
      load(`assets/probe/grassland_east_${s}.png`),
      load(`assets/probe/wastes_west_${s}.png`),
    ])
  ).then((arr) => {
    const pairs = [];
    for (let i = 0; i < PROBE_SIZES.length; i++) {
      pairs.push({ size: PROBE_SIZES[i], a: arr[i * 2], b: arr[i * 2 + 1] });
    }
    return pairs;
  });
  return PROBE.images;
}

let probePairsCached = null;
loadProbeImages().then((p) => { probePairsCached = p; });

function drawProbeWorld(ctx, game) {
  ctx.fillStyle = '#0b0a12';
  ctx.fillRect(0, 0, game.width, game.height);
  const name = WORLD_NAMES[devWorld.selectedIdx];
  const img = devWorld.images[name];
  if (!img) {
    ctx.fillStyle = '#faa';
    ctx.font = '14px ui-monospace,monospace';
    ctx.fillText(`no world_${name}. run:`, 20, 30);
    ctx.fillText(`node ../../tools/sprite-gen.js sprites-manifest-world-proof.json --sprite world_${name}`, 20, 54);
    return;
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(game.width / iw, game.height / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, (game.width - dw) / 2, (game.height - dh) / 2, dw, dh);
  ctx.fillStyle = '#888';
  ctx.font = '12px ui-monospace,monospace';
  ctx.fillText(`world_${name}  ${devWorld.selectedIdx + 1}/${WORLD_NAMES.length}  ${iw}×${ih}`, 12, game.height - 12);
}

function drawProbe(ctx, game) {
  if (PROBE.mode === 'world') {
    drawProbeWorld(ctx, game);
    return;
  }
  ctx.fillStyle = '#0b0a12';
  ctx.fillRect(0, 0, game.width, game.height);

  if (!probePairsCached) {
    ctx.fillStyle = '#888';
    ctx.font = '14px ui-monospace,monospace';
    ctx.fillText('loading probe plates...', 20, 30);
    return;
  }

  const missing = probePairsCached.filter((p) => !p.a || !p.b);
  if (missing.length === probePairsCached.length) {
    ctx.fillStyle = '#faa';
    ctx.font = '14px ui-monospace,monospace';
    ctx.fillText('no probe plates found. run:', 20, 30);
    ctx.fillText('node ../../tools/sprite-gen.js sprites-manifest-biome-probe.json', 20, 54);
    return;
  }

  const totalSrcW = Math.max(...PROBE_SIZES) * 2;
  const totalSrcH = PROBE_SIZES.reduce((a, b) => a + b, 0) + 40 * (PROBE_SIZES.length - 1);
  const scale = Math.min((game.width - 40) / totalSrcW, (game.height - 60) / totalSrcH);

  let y = 20;
  for (const pair of probePairsCached) {
    const s = pair.size;
    const plateW = s * scale;
    const plateH = s * scale;
    const feather = PROBE.feather * scale;
    const totalW = 2 * plateW - feather;
    const x0 = (game.width - totalW) / 2;

    ctx.fillStyle = '#555';
    ctx.font = '12px ui-monospace,monospace';
    ctx.fillText(`${s}px  feather=${PROBE.feather}px`, x0, y - 4);

    if (pair.a && pair.b) {
      const xA = x0;
      const xB = x0 + plateW - feather;
      ctx.drawImage(pair.a, xA, y, plateW, plateH);
      ctx.drawImage(pair.b, xB, y, plateW, plateH);
      if (feather > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createLinearGradient(xB, 0, xB + feather, 0);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(xB, y, feather, plateH);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#331';
      ctx.fillRect(x0, y, 2 * plateW - feather, plateH);
      ctx.fillStyle = '#faa';
      ctx.fillText(`missing ${s}px pair`, x0 + 8, y + 16);
    }

    y += plateH + 40;
  }
}

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

  function btnStyle(b) {
    b.style.cssText = `
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

  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px; background:#333; margin:4px 0;';

  const probeLabel = document.createElement('div');
  probeLabel.style.cssText = 'text-align:center; font-size:9px; letter-spacing:1px; color:#888;';
  probeLabel.textContent = 'PROBE';

  const probeToggle = document.createElement('button');
  btnStyle(probeToggle);
  function refreshToggle() {
    probeToggle.textContent = PROBE.active ? 'ON' : 'OFF';
    probeToggle.style.color = PROBE.active ? '#6f6' : '#adf';
  }
  refreshToggle();
  probeToggle.onclick = () => {
    PROBE.active = !PROBE.active;
    if (PROBE.active) {
      const stale = probePairsCached && probePairsCached.every((p) => !p.a || !p.b);
      if (stale || !probePairsCached) {
        PROBE.images = null;
        probePairsCached = null;
        loadProbeImages().then((p) => { probePairsCached = p; });
      }
      reloadAllWorlds();
    }
    refreshToggle();
  };

  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex; gap:3px;';
  const modes = [['pairs', 'PAIRS'], ['world', 'WORLD']];
  const modeBtns = modes.map(([v, lbl]) => {
    const b = document.createElement('button');
    btnStyle(b);
    b.style.padding = '3px 5px';
    b.style.fontSize = '10px';
    b.textContent = lbl;
    b.onclick = () => { PROBE.mode = v; refreshMode(); };
    modeRow.appendChild(b);
    return { v, el: b };
  });
  function refreshMode() {
    for (const m of modeBtns) {
      m.el.style.background = (m.v === PROBE.mode) ? '#444' : '#222';
      m.el.style.color = (m.v === PROBE.mode) ? '#fff' : '#adf';
    }
  }
  refreshMode();

  const worldRow = document.createElement('div');
  worldRow.style.cssText = 'display:flex; gap:3px; align-items:center;';
  const worldPrev = document.createElement('button');
  btnStyle(worldPrev); worldPrev.textContent = '◀'; worldPrev.style.padding = '3px 6px'; worldPrev.style.fontSize = '10px';
  const worldName = document.createElement('div');
  worldName.style.cssText = 'flex:1; text-align:center; font-size:10px; color:#fff;';
  const worldNext = document.createElement('button');
  btnStyle(worldNext); worldNext.textContent = '▶'; worldNext.style.padding = '3px 6px'; worldNext.style.fontSize = '10px';
  function refreshWorld() {
    worldName.textContent = WORLD_NAMES[devWorld.selectedIdx].toUpperCase();
  }
  worldPrev.onclick = () => { devWorld.selectedIdx = (devWorld.selectedIdx - 1 + WORLD_NAMES.length) % WORLD_NAMES.length; refreshWorld(); };
  worldNext.onclick = () => { devWorld.selectedIdx = (devWorld.selectedIdx + 1) % WORLD_NAMES.length; refreshWorld(); };
  worldRow.append(worldPrev, worldName, worldNext);
  refreshWorld();

  const featherRow = document.createElement('div');
  featherRow.style.cssText = 'display:flex; gap:3px;';
  const featherBtns = FEATHER_PRESETS.map((v) => {
    const b = document.createElement('button');
    btnStyle(b);
    b.style.padding = '3px 5px';
    b.style.fontSize = '11px';
    b.textContent = String(v);
    b.onclick = () => { PROBE.feather = v; refreshFeather(); };
    featherRow.appendChild(b);
    return { v, el: b };
  });
  function refreshFeather() {
    for (const f of featherBtns) {
      f.el.style.background = (f.v === PROBE.feather) ? '#444' : '#222';
      f.el.style.color = (f.v === PROBE.feather) ? '#fff' : '#adf';
    }
  }
  refreshFeather();

  const sep2 = document.createElement('div');
  sep2.style.cssText = 'height:1px; background:#333; margin:4px 0;';

  const rewardsBtn = document.createElement('button');
  btnStyle(rewardsBtn);
  rewardsBtn.textContent = 'REPLAY REWARDS';
  rewardsBtn.style.fontSize = '10px';
  rewardsBtn.onclick = () => {
    game.showRewards([
      { icon: 'icon_renown',      label: 'Renown', amount: 4 },
      { icon: 'icon_ore',         label: 'Ore',    amount: 4 },
      { icon: 'icon_skill_point', label: 'XP',     amount: 40 },
    ]);
  };

  el.append(label, prev, name, next, sep, probeLabel, probeToggle, modeRow, worldRow, featherRow, sep2, rewardsBtn);
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

  if (PROBE.active) {
    drawProbe(ctx, game);
  } else {
    switch (game.state) {
      case STATES.SPLASH:    drawSplash(ctx, game); break;
      case STATES.OVERWORLD: drawOverworld(ctx, game); break;
      case STATES.BATTLE:    drawBattle(ctx, game); break;
      case STATES.BASE:      drawBaseScene(ctx, game); break;
    }
    if (menuState.open) drawMenu(ctx, game);
  }

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
})();
