import {frameBounds} from './world-detail-art.js';

const sprites = new Map();
export function installWorldEnvironmentDetail(image, entry) {
  for (const frame of entry.metadata.frames) sprites.set(`${entry.biome}:${frame.part}`, {image, frame});
}

export function drawWorldEnvironmentDetail(c, biome, part, x, y, height) {
  const sprite = sprites.get(`${biome}:${part}`);
  if (!sprite) return false;
  const {image, frame: f} = sprite, b = frameBounds(f, x, y, height);
  c.drawImage(image, f.x, f.y, f.w, f.h, Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height));
  return true;
}

export function worldEnvironmentDetailSources() {
  return [...new Set([...sprites.values()].map(s => s.image))];
}
