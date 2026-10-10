import { loadFleetGLTF, disposeShipTextures } from './texture-loader.js';
import { assetURL } from '../assets/url.js';
import { SHIPS, getShip } from './catalog.js';

const entries = new Map();
const listeners = new Set();
let generation = 0;

// Parsed sources live for the page session, never inside a world or renderer.
// createShip clones them before use, so disposing a preview cannot poison races.
function release(model) {
  const resources = new Set();
  model.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat()) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) resources.add(value);
    }
  });
  resources.forEach((resource) => resource.dispose());
}
function state() {
  const ready = [...entries.values()].filter((entry) => entry.model).length;
  const loading = [...entries.entries()].find(([, entry]) => entry.loading);
  const failed = [...entries.entries()]
    .filter(([, entry]) => entry.failed)
    .map(([id]) => id);
  return {
    ready,
    failed,
    loading: !!loading,
    total: SHIPS.length,
    fraction:
      [...entries.values()].reduce((sum, entry) => sum + entry.fraction, 0) /
      SHIPS.length,
    label: loading
      ? `Loading ${getShip(loading[0]).name}`
      : ready === SHIPS.length
        ? 'Fleet ready'
        : failed.length
          ? `${failed.map((id) => getShip(id).name).join(', ')} unavailable · retry preload`
          : `Ships ready · ${ready}/${SHIPS.length}`,
  };
}
function notify() {
  for (const listener of listeners) listener(state());
}
export function subscribeShipCache(listener) {
  listeners.add(listener);
  listener(state());
  return () => listeners.delete(listener);
}
export function loadShipModel(id) {
  const specification = getShip(id);
  const existing = entries.get(specification.id);
  if (existing?.promise) return existing.promise;
  const token = generation;
  const entry = {
    loading: true,
    failed: false,
    fraction: 0,
    model: null,
    promise: null,
  };
  entries.set(specification.id, entry);
  entry.promise = loadFleetGLTF(assetURL(specification.asset), (event) => {
    if (token !== generation || !event.total) return;
    // Reserve the last part for GLTF parsing, after the transfer has finished.
    entry.fraction = Math.min(0.9, (event.loaded / event.total) * 0.9);
    notify();
  })
    .then(({ scene }) => {
      if (token !== generation) {
        release(scene);
        throw new DOMException('Ship cache disposed', 'AbortError');
      }
      entry.model = scene;
      entry.loading = false;
      entry.fraction = 1;
      notify();
      return scene;
    })
    .catch((error) => {
      if (token === generation) {
        entry.loading = false;
        entry.failed = true;
        entry.fraction = 0;
        entry.promise = null; // The next selection can retry a failed request.
        notify();
      }
      throw error;
    });
  notify();
  return entry.promise;
}
export async function preloadShips() {
  const token = generation;
  // Kestrel first. Demand loads join the same promise if navigation is faster.
  for (const ship of SHIPS) {
    if (token !== generation) return;
    await loadShipModel(ship.id).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
export function disposeShipCache() {
  generation++;
  disposeShipTextures();
  for (const entry of entries.values()) if (entry.model) release(entry.model);
  entries.clear();
  listeners.clear();
}

// Direct test/art-pass launches also own a cache, without frontend preload.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', disposeShipCache);
