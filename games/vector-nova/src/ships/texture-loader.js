import { FileLoader, LoaderUtils, LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetURL } from '../assets/url.js';

let current, support;
const DECODE_TIMEOUT_MS = 30000;
function state() {
  if (current) return current;
  let ready;
  const capability = new Promise((resolve) => {
    ready = resolve;
  });
  const owner = {
    abort: new AbortController(),
    manager: new LoadingManager(),
    capability,
    ready,
    loader: null,
    blobs: new Set(),
  };
  owner.manager.setURLModifier((url) => {
    if (owner.abort.signal.aborted) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      throw owner.abort.signal.reason;
    }
    if (url.startsWith('blob:')) owner.blobs.add(url);
    return url;
  });
  if (support) ready();
  return (current = owner);
}

// Preloading can precede any renderer. Wait for a real preview/race renderer;
// ordinary PNG models never need this gate or the Basis decoder.
export function configureShipTextures(renderer) {
  if (support) return;
  const owner = state();
  owner.loader = new KTX2Loader(owner.manager)
    .setTranscoderPath(assetURL('assets/ships/decoder/'))
    .setWorkerLimit(2)
    .detectSupport(renderer);
  support = { ...owner.loader.workerConfig };
  owner.ready();
}

async function decoder(owner) {
  if (!owner.loader) {
    owner.loader = new KTX2Loader(owner.manager)
      .setTranscoderPath(assetURL('assets/ships/decoder/'))
      .setWorkerLimit(2);
    owner.loader.workerConfig = { ...support };
  }
  await owner.loader.init();
  owner.abort.signal.throwIfAborted();
  return owner.loader;
}

function retire(owner, reason) {
  if (owner.abort.signal.aborted) return;
  if (current === owner) current = null;
  owner.abort.abort(reason);
  owner.manager.abort();
  // init() is just abortable JS/WASM transfer. Worker startup or transcode can
  // hang independently; never wait on raw parse promises to terminate workers.
  const loader = owner.loader;
  if (loader?.transcoderPending) {
    void loader.transcoderPending.catch(() => {}).then(() => loader.dispose());
  }
  // GLTFLoader normally revokes these; also reclaim them on failed workers.
  for (const url of owner.blobs) URL.revokeObjectURL(url);
  owner.blobs.clear();
}

export function loadFleetGLTF(url, onProgress) {
  const owner = state();
  let rejectAbort, timer;
  const cancelled = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(owner.abort.signal.reason);
  owner.abort.signal.addEventListener('abort', onAbort, { once: true });
  const work = (async () => {
    const buffer = await new FileLoader(owner.manager)
      .setResponseType('arraybuffer')
      .loadAsync(url, onProgress);
    owner.abort.signal.throwIfAborted();
    const view = new DataView(buffer);
    const json = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(buffer, 20, view.getUint32(12, true)),
      ),
    );
    const compressed = json.extensionsUsed?.includes('KHR_texture_basisu');
    if (compressed) {
      await Promise.race([owner.capability, cancelled]);
      owner.abort.signal.throwIfAborted();
      timer = setTimeout(
        () =>
          retire(
            owner,
            new Error('Ship texture decoder timed out; retry loading'),
          ),
        DECODE_TIMEOUT_MS,
      );
    }
    try {
      const loader = new GLTFLoader(owner.manager);
      if (compressed) loader.setKTX2Loader(await decoder(owner));
      owner.abort.signal.throwIfAborted();
      const gltf = await loader.parseAsync(
        buffer,
        LoaderUtils.extractUrlBase(url),
      );
      // GLTFLoader substitutes null for texture failures. Reject incomplete
      // models so a failed decoder can never poison the shared model cache.
      const textures = await gltf.parser.getDependencies('texture');
      if (textures.some((texture) => !texture) || owner.abort.signal.aborted) {
        disposeModel(gltf.scene, textures);
        owner.abort.signal.throwIfAborted();
        throw new Error('Ship texture decoding failed; retry loading');
      }
      return gltf;
    } catch (error) {
      if (compressed) retire(owner, error);
      throw error;
    }
  })();
  return Promise.race([work, cancelled]).finally(() => {
    clearTimeout(timer);
    owner.abort.signal.removeEventListener('abort', onAbort);
  });
}

function disposeModel(model, textures = []) {
  const resources = new Set(textures.filter(Boolean));
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

export function disposeShipTextures() {
  if (current)
    retire(current, new DOMException('Ship loader disposed', 'AbortError'));
}
