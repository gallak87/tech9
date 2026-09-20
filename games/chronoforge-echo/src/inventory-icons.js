import { ITEMS } from './content.js';

const sprites = new Map();
const TEXTURE_SIZE = 256;

export const inventoryIconId = (id) => ITEMS[id]?.iconId ?? id;

export function installInventoryIcon(image, entry) {
  if (
    !Object.values(ITEMS).some(
      (item) => inventoryIconId(item.id) === entry.itemId,
    ) ||
    entry.id !== 'inventory_' + entry.itemId
  )
    throw Error(`Unknown inventory icon: ${entry.id}`);
  if (image.width !== entry.width || image.height !== entry.height)
    throw Error(`Inventory icon dimensions changed: ${entry.itemId}`);
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
    throw Error(`Invalid inventory icon crop: ${entry.itemId}`);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE)
      : document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = (TEXTURE_SIZE * 0.94) / Math.max(w, h);
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
  sprites.set(entry.itemId, canvas);
}

export function drawInventoryIcon(context, id, x, y, size) {
  const sprite = sprites.get(inventoryIconId(id));
  if (!sprite) throw Error(`Inventory icon not loaded: ${id}`);
  if (!(size > 0)) return;
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sprite, x, y, size, size);
  context.restore();
}
