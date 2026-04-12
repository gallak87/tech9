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

export const spriteSettings = {
  forcePlaceholders: false,
};

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
  loadImage(`assets/${name}.png`).then((img) => {
    cache.set(key, { img, loading: false });
  });
  return null;
}

export function drawSprite(ctx, name, x, y, w, h) {
  const img = getSprite(name, w, h);
  if (img) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  drawPlaceholder(ctx, name, x, y, w, h);
}

function drawPlaceholder(ctx, name, x, y, w, h) {
  const color = hashColor(name);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // only show letter on non-tiny sprites
  if (w >= 24 && h >= 24) {
    const letter = (name.match(/[a-z]/i) || ['?'])[0].toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${Math.floor(Math.min(w, h) * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + w / 2, y + h / 2 + 1);
  }
}
