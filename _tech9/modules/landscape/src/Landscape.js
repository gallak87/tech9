import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
export const LANDSCAPE_ASSET_URL = new URL(
  '../assets/runtime/',
  import.meta.url,
);

/** Loaded finite landscape layer. Renderer, frame loop and weather are caller-owned. */
export function createLandscape({
  layout: createOptions = {},
  assetURL = LANDSCAPE_ASSET_URL,
  windMode = 'local',
  manageFog = true,
  quality = 'high',
} = {}) {
  if (!['local', 'weather'].includes(windMode))
    throw new RangeError('Unknown landscape wind mode.');
  if (!['balanced', 'high', 'ultra'].includes(quality))
    throw new RangeError('Unknown landscape quality.');
  const layout = createLandscapeLayout(createOptions);
  const rootURL = new URL(String(assetURL), import.meta.url);
  let context,
    render,
    kit,
    disposed = false;
  const disposeKit = () => {
    if (!kit) return;
    const resources = new Set();
    kit.traverse((o) => {
      if (o.geometry) resources.add(o.geometry);
      for (const m of Array.isArray(o.material)
        ? o.material
        : o.material
          ? [o.material]
          : []) {
        resources.add(m);
        for (const value of Object.values(m))
          if (value?.isTexture) resources.add(value);
      }
    });
    resources.forEach((r) => r.dispose());
    kit = null;
  };
  const layer = {
    id: 'landscape',
    bounds: layout.bounds,
    groundHeight: layout.groundHeight,
    obstacle: layout.obstacle,
    sampleSurface: layout.sampleSurface,
    async init(value) {
      if (context || disposed)
        throw new Error('Create a fresh landscape for each activation.');
      if (!value?.scene || !value?.renderer || !value?.camera)
        throw new TypeError('Landscape needs scene, renderer and camera.');
      context = value;
      try {
        kit = (
          await new GLTFLoader().loadAsync(
            new URL('forest-kit.glb', rootURL).href,
          )
        ).scene;
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
      }
    },
    configure(settings) {
      render?.configure(settings);
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
      disposeKit();
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
