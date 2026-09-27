const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positive = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** CSS stage, logical world and backing pixels are deliberately independent. */
export function createViewport({
  cssWidth = 960,
  cssHeight = 540,
  logicalWidth = 960,
  logicalHeight = 540,
  mobile = false,
  pixelRatio = 1,
  zoom = 1,
  pixelBudget = 1500000,
  maxDimension = 2048,
  maxScale = 2,
  mobileScale = 0.8,
  fit = 'aspect',
  scene,
} = {}) {
  cssWidth = positive(cssWidth, logicalWidth);
  cssHeight = positive(cssHeight, logicalHeight);
  const portrait = cssHeight > cssWidth;
  const cssScale = mobile
    ? Math.max(
        mobileScale * (portrait ? clamp(positive(zoom, 1), 0.75, 1.25) : 1),
        scene ? cssWidth / scene.width : 0,
        scene ? cssHeight / scene.height : 0,
      )
    : cssWidth / logicalWidth;
  const width = mobile ? cssWidth / cssScale : logicalWidth;
  const height = mobile
    ? cssHeight / cssScale
    : fit === 'fixed'
      ? logicalHeight
      : (logicalWidth * cssHeight) / cssWidth;
  const renderScale = Math.min(
    mobile ? positive(pixelRatio, 1) * cssScale : maxScale,
    maxScale,
    Math.sqrt(positive(pixelBudget, 1500000) / (width * height)),
    positive(maxDimension, 2048) / Math.max(width, height),
  );
  return {
    width,
    height,
    cssWidth,
    cssHeight,
    cssScale,
    renderScale,
    mobile,
    portrait,
  };
}
export function clampCamera(point, scene, viewport) {
  return {
    x: clamp(point.x, 0, Math.max(0, scene.width - viewport.width)),
    y: clamp(point.y, 0, Math.max(0, scene.height - viewport.height)),
  };
}
export function followCamera(
  camera,
  actor,
  scene,
  viewport,
  dt,
  { speed = 9, immediate = false, anchorX = 0.5, anchorY = 0.57 } = {},
) {
  anchorX = Number.isFinite(anchorX) ? clamp(anchorX, 0, 1) : 0.5;
  anchorY = Number.isFinite(anchorY) ? clamp(anchorY, 0, 1) : 0.57;
  speed = positive(speed, 9);
  const target = clampCamera(
    {
      x: actor.x - viewport.width * anchorX,
      y: actor.y - viewport.height * anchorY,
    },
    scene,
    viewport,
  );
  const t = immediate ? 1 : 1 - Math.exp(-speed * Math.max(0, dt));
  return clampCamera(
    {
      x: camera.x + (target.x - camera.x) * t,
      y: camera.y + (target.y - camera.y) * t,
    },
    scene,
    viewport,
  );
}
export function clientToWorld(point, camera, viewport, rect) {
  return {
    x:
      camera.x +
      ((point.x - rect.left) * viewport.width) / positive(rect.width, 1),
    y:
      camera.y +
      ((point.y - rect.top) * viewport.height) / positive(rect.height, 1),
  };
}
export function worldToClient(point, camera, viewport, rect) {
  return {
    x: rect.left + ((point.x - camera.x) * rect.width) / viewport.width,
    y: rect.top + ((point.y - camera.y) * rect.height) / viewport.height,
  };
}
