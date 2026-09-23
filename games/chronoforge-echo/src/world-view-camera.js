import { VIEW_WIDTH as W, VIEW_HEIGHT as H } from './rendering.js';

// Fit the map beneath the overview header, preserving its proportions.
export function worldViewCamera(
  scene,
  start,
  progress,
  { width = W, height = H } = {},
) {
  const t = Math.max(0, Math.min(1, progress)),
    ease = 1 - (1 - t) ** 3;
  const fit = Math.min(
    1,
    (width - 48) / scene.width,
    (height - 82) / scene.height,
  );
  const zoom = 1 + (fit - 1) * ease;
  const centerX = (start.x + width / 2) * (1 - ease) + (scene.width / 2) * ease;
  const centerY =
    (start.y + height / 2) * (1 - ease) + (scene.height / 2 - 13 / fit) * ease;
  return {
    x: centerX - width / 2 / zoom,
    y: centerY - height / 2 / zoom,
    zoom,
  };
}

export function worldViewSurfaceSize(scene) {
  // One temporary map image at native density, bounded even for future maps.
  // It is released on close and never exported or stored.
  const scale = Math.min(
    1,
    Math.sqrt(16_777_216 / (scene.width * scene.height)),
  );
  return {
    width: Math.max(1, Math.floor(scene.width * scale)),
    height: Math.max(1, Math.floor(scene.height * scale)),
  };
}

export function* worldViewTiles(scene) {
  for (let y = 0; y < scene.height; y += H)
    for (let x = 0; x < scene.width; x += W)
      yield {
        x,
        y,
        width: Math.min(W, scene.width - x),
        height: Math.min(H, scene.height - y),
      };
}
