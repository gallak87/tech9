import { VIEW_WIDTH, VIEW_HEIGHT, RENDER_SCALE } from './rendering.js';

const positive = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// CSS layout owns the usable stage rectangle; the world never inherits the
// command dock or thumb zone. Rendering resolution is separate from world zoom.
export function createViewport({
  cssWidth = VIEW_WIDTH,
  cssHeight = VIEW_HEIGHT,
  mobile = false,
  pixelRatio = 1,
  quality = 'balanced',
  zoom = 1,
  scene = null,
  portrait = cssHeight > cssWidth,
} = {}) {
  cssWidth = positive(cssWidth, VIEW_WIDTH);
  cssHeight = positive(cssHeight, VIEW_HEIGHT);
  if (!mobile)
    return {
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      renderScale: RENDER_SCALE,
      cssWidth,
      cssHeight,
      cssScale: cssWidth / VIEW_WIDTH,
      mobile: false,
      portrait: false,
    };
  const requestedScale =
    0.8 * (portrait ? clamp(positive(zoom, 1), 0.75, 1.25) : 1);
  // A small room still fills the view; this is a visual fit, not a world resize.
  const cssScale = Math.max(
    requestedScale,
    scene ? cssWidth / positive(scene.width, Infinity) : 0,
    scene ? cssHeight / positive(scene.height, Infinity) : 0,
  );
  const width = cssWidth / cssScale,
    height = cssHeight / cssScale;
  const pixelBudget = quality === 'high' ? 1_500_000 : 750_000;
  const renderScale = Math.min(
    positive(pixelRatio, 1) * cssScale,
    quality === 'high' ? RENDER_SCALE : 1.5,
    Math.sqrt(pixelBudget / (width * height)),
    2048 / Math.max(width, height),
  );
  return {
    width,
    height,
    renderScale,
    cssWidth,
    cssHeight,
    cssScale,
    mobile: true,
    portrait,
  };
}

export function clampCamera(
  point,
  scene,
  viewport = { width: VIEW_WIDTH, height: VIEW_HEIGHT },
) {
  return {
    x: clamp(point.x, 0, Math.max(0, scene.width - viewport.width)),
    y: clamp(point.y, 0, Math.max(0, scene.height - viewport.height)),
  };
}

export function clientToView(point, viewport, rect) {
  return {
    x: ((point.x - rect.left) * viewport.width) / positive(rect.width, 1),
    y: ((point.y - rect.top) * viewport.height) / positive(rect.height, 1),
  };
}

export function clientToWorld(point, camera, viewport, rect) {
  const view = clientToView(point, viewport, rect);
  return { x: view.x + Math.round(camera.x), y: view.y + Math.round(camera.y) };
}

export function worldToClient(point, camera, viewport, rect) {
  return {
    x:
      rect.left +
      ((point.x - Math.round(camera.x)) * rect.width) / viewport.width,
    y:
      rect.top +
      ((point.y - Math.round(camera.y)) * rect.height) / viewport.height,
  };
}

export function cameraViewport(camera = {}) {
  return {
    width: camera.width || VIEW_WIDTH,
    height: camera.height || VIEW_HEIGHT,
  };
}
