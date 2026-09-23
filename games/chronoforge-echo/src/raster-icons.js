import { RASTER_ICON_ASSETS } from './raster-icon-manifest.js';

const sprites = new Map();
const TEXTURE_SIZE = 256;

// Keep a compact UI texture, not twenty full 1254px canvases. Resampling uses
// the generated alpha directly; pale scoring, glass and metal are never keyed.
export function installRasterIcon(image, entry) {
  if (!RASTER_ICON_ASSETS.some((asset) => asset.id === entry.id))
    throw Error(`Unknown icon: ${entry.id}`);
  if (image.width !== entry.width || image.height !== entry.height)
    throw Error(`Icon dimensions changed: ${entry.id}`);
  const [x, y, w, h] = entry.bounds;
  if (
    ![x, y, w, h].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > image.width ||
    y + h > image.height
  )
    throw Error(`Invalid icon crop: ${entry.id}`);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE)
      : document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = (TEXTURE_SIZE * (entry.prepared ? 1 : 0.94)) / Math.max(w, h);
  context.drawImage(
    image,
    x,
    y,
    w,
    h,
    (TEXTURE_SIZE - w * scale) / 2,
    (TEXTURE_SIZE - h * scale) / 2,
    w * scale,
    h * scale,
  );
  sprites.set(entry.id, canvas);
}

export function drawRasterIcon(context, id, x, y, size) {
  const sprite = sprites.get(id);
  if (!sprite) return false;
  if (!(size > 0)) return true;
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sprite, x, y, size, size);
  context.restore();
  return true;
}

export function rasterIconMetrics() {
  return {
    loaded: [...sprites.keys()],
    textureSize: TEXTURE_SIZE,
    retainedBytes: sprites.size * TEXTURE_SIZE * TEXTURE_SIZE * 4,
  };
}
