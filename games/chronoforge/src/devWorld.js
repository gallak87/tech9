// Dev-only: pre-rendered world map as the overworld backdrop.
// Picker UI (in game.js) writes selectedIdx; scenes.js reads getActiveBackdrop().

import { TILE, MAP_W, MAP_H } from './world.js';

export const WORLD_NAMES = ['proof', 'desert', 'alien', 'frozen', 'forest'];

export const devWorld = {
  enabled: true,
  selectedIdx: 0,
  images: Object.create(null),
};

function loadOne(name) {
  const img = new Image();
  img.onload = () => { devWorld.images[name] = img; backdropFor = null; };
  img.onerror = () => { devWorld.images[name] = null; };
  img.src = `assets/probe/world_${name}.png?t=${Date.now()}`;
}
WORLD_NAMES.forEach(loadOne);

export function reloadAllWorlds() {
  for (const n of WORLD_NAMES) loadOne(n);
}

let backdropCanvas = null;
let backdropFor = null;

export function getActiveBackdrop() {
  if (!devWorld.enabled) return null;
  const name = WORLD_NAMES[devWorld.selectedIdx];
  const img = devWorld.images[name];
  if (!img) return null;
  if (backdropFor === name && backdropCanvas) return backdropCanvas;
  if (!backdropCanvas) {
    backdropCanvas = document.createElement('canvas');
    backdropCanvas.width = MAP_W * TILE;
    backdropCanvas.height = MAP_H * TILE;
  }
  const ctx = backdropCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, backdropCanvas.width, backdropCanvas.height);
  ctx.drawImage(img, 0, 0, backdropCanvas.width, backdropCanvas.height);
  backdropFor = name;
  return backdropCanvas;
}
