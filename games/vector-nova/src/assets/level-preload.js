import { LoaderUtils, LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const downloadSlots = 3;

async function fetchBytes(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not prefetch ${url}`);
  return response.arrayBuffer();
}

// Fetch selected scenery while the simulation is preparing. Parsing and scene
// ownership still belong to the level factory that consumes each model.
export function preloadLevelModels(
  urls,
  { signal, download = fetchBytes } = {},
) {
  const controller = new AbortController();
  const manager = new LoadingManager();
  const entries = new Map(
    [...new Set(urls)].map((url) => [url, Promise.withResolvers()]),
  );
  const queue = [...entries.keys()];
  let next = 0;

  function dispose() {
    signal?.removeEventListener('abort', dispose);
    controller.abort(signal?.reason);
    manager.abort();
    for (const entry of entries.values()) entry.resolve(null);
    entries.clear();
    queue.length = 0;
  }

  async function fillSlot() {
    while (!controller.signal.aborted && next < queue.length) {
      const url = queue[next++];
      const entry = entries.get(url);
      try {
        entry.resolve(await download(url, controller.signal));
      } catch {
        // The ordinary loader may retry when the owning environment asks.
        entry.resolve(null);
      }
    }
  }
  if (signal?.aborted) dispose();
  else {
    signal?.addEventListener('abort', dispose, { once: true });
    for (let i = 0; i < Math.min(downloadSlots, queue.length); i++)
      void fillSlot();
  }

  return {
    async loadAsset(url) {
      controller.signal.throwIfAborted();
      const data = await entries.get(url)?.promise;
      entries.delete(url);
      controller.signal.throwIfAborted();
      const loader = new GLTFLoader(manager);
      return data
        ? loader.parseAsync(data, LoaderUtils.extractUrlBase(url))
        : loader.loadAsync(url);
    },
    dispose,
  };
}
