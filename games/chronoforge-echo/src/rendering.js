// World units stay fixed. A finer backing surface preserves the source art's
// small details instead of discarding them before the browser enlarges them.
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const RENDER_SCALE = 2;

export function artContext(context) {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

export function artSurface(width, height) {
  const surface = document.createElement('canvas');
  surface.width = width * RENDER_SCALE;
  surface.height = height * RENDER_SCALE;
  surface.logicalWidth = width;
  surface.logicalHeight = height;
  const context = artContext(surface.getContext('2d'));
  context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  return surface;
}

export function artPattern(context, surface) {
  const pattern = context.createPattern(surface, 'repeat');
  if (surface.logicalWidth)
    pattern.setTransform(
      new DOMMatrix().scale(
        surface.logicalWidth / surface.width,
        surface.logicalHeight / surface.height,
      ),
    );
  return pattern;
}
