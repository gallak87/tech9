// Chronoforge — Sprite loader with procedural placeholder fallback.
// Contract (from art spec):
//  1. Try to load `/assets/<name>.png`.
//  2. On 404/error, draw a placeholder: filled rect in a hashed palette color,
//     1px accent border, centered uppercase first letter.
//  3. Settings toggle `forcePlaceholders` bypasses loaded PNGs for A/B beta.

const PALETTES = {
  // name prefix -> fill color (simple routing)
  kaida: '#ff2dd4', vex: '#22e3ff', rune: '#ffd23f',
  rust: '#a65a3a', drone: '#7682a8', mutant: '#8a4a2e',
  grav: '#5e6dad', neon: '#ff5ea8', sandworm: '#c89b6a',
  wraith: '#9b5cff', architect: '#22e3ff', void: '#ff2dd4',
  town: '#b08a5e', farm: '#3fc870', mine: '#8a83b8',
  energy: '#ffd23f', barracks: '#a05050', forge: '#ff7a3a',
  research: '#22e3ff', wall: '#7682a8',
  tile_grass: '#2f5a3a', tile_dirt: '#6a4a2e', tile_ruin: '#555262',
  tile_dead: '#3a2a20', tile_stream: '#22a0e3', tile_cracked: '#3c3c40',
  tile_sand: '#c89b6a', tile_rust: '#7a3a2a', tile_neon: '#ff2dd4',
  tile_barricade: '#666', tile_billboard: '#ff5ea8', tile_broken: '#44484f',
  tile_bio: '#3fc870', tile_crystal: '#ff5ea8', tile_alien: '#aa70ff',
  tile_growth: '#5fc870', tile_terraform: '#22c870',
  city: '#ff2dd4',
  vfx: '#e7e5ff', proj: '#ffd23f',
  icon: '#22e3ff', tab: '#8a83b8',
};

function hashColor(str) {
  for (const key of Object.keys(PALETTES)) {
    if (str.startsWith(key)) return PALETTES[key];
  }
  // fallback hash → hue
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

const cache = new Map();
const placeholderCache = new Map(); // "name|w|h" -> HTMLCanvasElement

// Bumps on every sprite load resolution (success or 404). Consumers that cache
// composited layers (e.g. tile atlas) can watch this to know when to invalidate.
let spriteVersion = 0;
export function getSpriteVersion() { return spriteVersion; }

export const TERRAIN_SETS = [
  'lush', 'wasteland', 'neon', 'ashen', 'terraform',
  'toxic', 'ember', 'void', 'radiant', 'glacial',
];

export const spriteSettings = {
  forcePlaceholders: false,
  terrainSet: null,  // null = use flat assets/; string = use assets/terrain/<set>/
};

// Tile names that have per-terrain-set variants.
const TERRAIN_TILE_NAMES = new Set([
  'tile_grass','tile_dirt','tile_cracked_road','tile_sand',
  'tile_rust_patch','tile_bio_moss','tile_growth_tile',
]);

export function setTerrainSet(setName) {
  if (spriteSettings.terrainSet === setName) return;
  spriteSettings.terrainSet = setName;
  // Evict terrain tile cache entries so they reload from the new path.
  for (const name of TERRAIN_TILE_NAMES) cache.delete(name);
  spriteVersion++;
}

function spritePath(name) {
  if (spriteSettings.terrainSet && TERRAIN_TILE_NAMES.has(name)) {
    return `assets/terrain/${spriteSettings.terrainSet}/${name}.png`;
  }
  return `assets/${name}.png`;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function getSprite(name, w, h) {
  if (spriteSettings.forcePlaceholders) return null;
  const key = `${name}`;
  if (cache.has(key)) {
    const entry = cache.get(key);
    return entry.img;
  }
  cache.set(key, { img: null, loading: true });
  loadImage(spritePath(name)).then((img) => {
    cache.set(key, { img, loading: false });
    spriteVersion++;
  });
  return null;
}

// Sprites whose prefix starts with one of these are treated as opaque and
// drawn with normal compositing. Everything else gets `screen` blend so the
// flux-generated black background drops out over dark scenes.
const OPAQUE_PREFIXES = ['tile_'];

function useScreenBlend(name) {
  return !OPAQUE_PREFIXES.some(p => name.startsWith(p));
}

export function drawSprite(ctx, name, x, y, w, h, opts = {}) {
  const img = getSprite(name, w, h);
  if (img) {
    const blend = opts.blend || (useScreenBlend(name) ? 'screen' : 'source-over');
    if (blend !== 'source-over') {
      ctx.save();
      ctx.globalCompositeOperation = blend;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
    return;
  }
  drawPlaceholder(ctx, name, x, y, w, h);
}

function drawPlaceholder(ctx, name, x, y, w, h) {
  const key = `${name}|${w}|${h}`;
  let canvas = placeholderCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const pctx = canvas.getContext('2d');
    const color = hashColor(name);
    pctx.fillStyle = color;
    pctx.fillRect(0, 0, w, h);
    pctx.strokeStyle = 'rgba(255,255,255,0.25)';
    pctx.lineWidth = 1;
    pctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    if (w >= 24 && h >= 24) {
      const letter = (name.match(/[a-z]/i) || ['?'])[0].toUpperCase();
      pctx.fillStyle = 'rgba(255,255,255,0.85)';
      pctx.font = `600 ${Math.floor(Math.min(w, h) * 0.5)}px system-ui, sans-serif`;
      pctx.textAlign = 'center';
      pctx.textBaseline = 'middle';
      pctx.fillText(letter, w / 2, h / 2 + 1);
    }
    placeholderCache.set(key, canvas);
  }
  ctx.drawImage(canvas, x, y);
}
