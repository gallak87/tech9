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

export const spriteSettings = {
  forcePlaceholders: false,
};

function spritePath(name) {
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
    const final = (img && shouldKeyBlack(name)) ? keyBlackToAlpha(img) : img;
    cache.set(key, { img: final, loading: false });
    spriteVersion++;
  });
  return null;
}

// Sprites whose prefix starts with one of these keep their original opaque
// pixels (terrain tiles). Everything else has its flux-black background keyed
// out to alpha at load time so it draws crisply over bright backdrops instead
// of being washed out by `screen` blend.
const OPAQUE_PREFIXES = ['tile_'];

function shouldKeyBlack(name) {
  return !OPAQUE_PREFIXES.some(p => name.startsWith(p));
}

// Key out the pure black background from AI-generated sprites.
// Uses a hard threshold (true black → transparent) + small anti-alias ramp.
// Preserves original pixel colors at full opacity — no unmultiply, which was
// washing out dark-colored sprites (e.g. a dark gray rat body → ghostly smear).
function keyBlackToAlpha(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const LO = 12, HI = 50;
  for (let i = 0; i < px.length; i += 4) {
    const maxC = Math.max(px[i], px[i + 1], px[i + 2]);
    if (maxC < LO) { px[i + 3] = 0; continue; }
    // smooth anti-alias ramp in [LO, HI], fully opaque above HI
    px[i + 3] = maxC < HI ? Math.round((maxC - LO) * 255 / (HI - LO)) : 255;
  }
  cx.putImageData(data, 0, 0);
  return c;
}

export function drawSprite(ctx, name, x, y, w, h, opts = {}) {
  const img = getSprite(name, w, h);
  if (img) {
    if (opts.blend && opts.blend !== 'source-over') {
      ctx.save();
      ctx.globalCompositeOperation = opts.blend;
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
