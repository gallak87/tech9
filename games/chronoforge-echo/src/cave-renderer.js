import { artSurface, artContext, artPattern } from './rendering.js';
import { frameBounds } from './world-detail-art.js';

const sprites = new Map(),
  floors = new Map();
export function installCaveKit(image, entry) {
  for (const frame of entry.metadata.frames)
    sprites.set(`${frame.biome}:${frame.part}`, { image, frame });
}
export function installCaveFloor(image, entry) {
  for (const f of entry.metadata.frames) {
    const tile = artSurface(192, 192),
      c = tile.getContext('2d');
    artContext(c);
    c.drawImage(image, f.x, f.y, f.w, f.h, 0, 0, 192, 192);
    floors.set(f.biome, tile);
  }
}
export function caveFloorPattern(c, biome) {
  const tile = floors.get(biome);
  return tile ? artPattern(c, tile) : null;
}
export function drawCavePiece(c, biome, part, x, y, height) {
  const sprite = sprites.get(`${biome}:${part}`);
  if (!sprite) return false;
  const { image, frame: f } = sprite,
    b = frameBounds(f, x, y, height);
  c.drawImage(
    image,
    f.x,
    f.y,
    f.w,
    f.h,
    Math.round(b.left),
    Math.round(b.top),
    Math.round(b.width),
    Math.round(b.height),
  );
  return true;
}
export function caveArtMetrics() {
  return {
    sources: [...new Set([...sprites.values()].map((s) => s.image))],
    tiles: [...floors.values()],
  };
}

export function releaseCaveAsset(entry) {
  for (const frame of entry.metadata.frames) {
    if (entry.kind === 'caveFloor') {
      const tile = floors.get(frame.biome);
      if (tile) tile.width = tile.height = 0;
      floors.delete(frame.biome);
    } else {
      const key = `${frame.biome}:${frame.part}`,
        image = sprites.get(key)?.image;
      if (image) image.width = image.height = 0;
      sprites.delete(key);
    }
  }
}
