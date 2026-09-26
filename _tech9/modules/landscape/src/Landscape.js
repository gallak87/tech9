import { loadForestKit, disposeForestKit } from './forestAssets.js';
import { createLandscapeLayout } from './layout.js';
import { buildLandscape } from './render.js';
export {
  createLandscapeLayout,
  DEFAULT_BOUNDS,
  DEFAULT_TRAIL,
  defaultGroundHeight,
  defaultForestCover,
} from './layout.js';
export { AtmospherePass } from './AtmospherePass.js';
export { LANDSCAPE_ASSETS } from './forestAssets.js';
export { createComposedLandscape } from './ComposedLandscape.js';

/** Loaded finite landscape layer. Renderer, frame loop and weather are caller-owned. */
export function createLandscape({
  layout: createOptions = {},
  assetURL,
  windMode = 'local',
  manageFog = true,
  quality = 'high',
} = {}) {
  if (!['local', 'weather'].includes(windMode))
    throw new RangeError('Unknown landscape wind mode.');
  if (!['balanced', 'high', 'ultra'].includes(quality))
    throw new RangeError('Unknown landscape quality.');
  const layout = createLandscapeLayout(createOptions);
  const rootURL = assetURL ? new URL(String(assetURL), import.meta.url) : null;
  let context,
    render,
    kit,
    disposed = false,
    initializing = false;
  const disposeKit = () => {
    if (!kit) return;
    disposeForestKit(kit);
    kit = null;
  };
  const layer = {
    id: 'landscape',
    bounds: layout.bounds,
    surfaceBounds: layout.terrainBounds,
    groundHeight: layout.groundHeight,
    obstacle: layout.obstacle,
    sampleSurface: layout.sampleSurface,
    async init(value) {
      if (context || disposed)
        throw new Error('Create a fresh landscape for each activation.');
      if (!value?.scene || !value?.renderer || !value?.camera)
        throw new TypeError('Landscape needs scene, renderer and camera.');
      context = value;
      initializing = true;
      try {
        kit = await loadForestKit(rootURL);
        if (disposed) {
          disposeKit();
          return;
        }
        const built = await buildLandscape(
          { ...value, manageFog },
          kit,
          layout,
          { assetURL: rootURL, windMode },
        );
        if (disposed) {
          built.dispose();
          disposeKit();
          return;
        }
        render = built;
        render.configure({ quality });
        layer.update(0, 0);
      } catch (error) {
        layer.dispose();
        throw error;
      } finally {
        initializing = false;
        if (disposed) disposeKit();
      }
    },
    configure(settings = {}) {
      if (settings.quality === undefined) return;
      if (!['balanced', 'high', 'ultra'].includes(settings.quality))
        throw new RangeError('Unknown landscape quality.');
      quality = settings.quality;
      render?.configure({ quality });
    },
    update(_dt, elapsed = 0) {
      if (!disposed && render) render.update(context.camera.position, elapsed);
    },
    getWeatherTargets() {
      if (!render || disposed)
        throw new Error('Initialize landscape before attaching weather.');
      return render.getWeatherTargets();
    },
    get stats() {
      return render
        ? { ...render.stats }
        : { trees: layout.trees.length, ready: false };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      render?.dispose();
      if (!initializing) disposeKit();
    },
  };
  return layer;
}

/** Moving shadow window; fog/light color and weather styling remain caller-owned. */
export function followLandscapeSun(sun, position, groundHeight) {
  sun.target.position.set(
    position.x,
    groundHeight(position.x, position.z),
    position.z,
  );
  sun.position.copy(sun.target.position).add({ x: 100, y: 180, z: -120 });
  sun.target.updateMatrixWorld();
}
