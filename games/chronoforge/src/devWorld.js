// Pre-rendered map backdrop loader. Each map's `backdrop` field names a PNG
// at `assets/probe/world_<name>.png`; we lazy-load + stretch to world bounds.

import { TILE, MAP_W, MAP_H } from './world.js';

const WORLD_NAMES = [
  'proof', 'desert', 'alien', 'frozen', 'forest',
  'mire_bog', 'crater_ember', 'frost_canyon',
];

const images = Object.create(null);

function loadOne(name) {
  const img = new Image();
  img.onload = () => {
    images[name] = img;
    if (backdropCache[name]) backdropCache[name].dirty = true;
  };
  img.onerror = () => { images[name] = null; };
  img.src = `assets/probe/world_${name}.png`;
}
WORLD_NAMES.forEach(loadOne);

// Per-name backdrop canvas cache, stretched to world bounds.
const backdropCache = Object.create(null);

export function getMapBackdrop(name) {
  if (!name) return null;
  const img = images[name];
  if (!img) return null;
  let entry = backdropCache[name];
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W * TILE;
    canvas.height = MAP_H * TILE;
    entry = { canvas, dirty: true };
    backdropCache[name] = entry;
  }
  if (entry.dirty) {
    const ctx = entry.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.drawImage(img, 0, 0, entry.canvas.width, entry.canvas.height);
    entry.dirty = false;
  }
  return entry.canvas;
}
