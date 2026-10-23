import { FileLoader, Loader, LoadingManager, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { assetURL } from './url.js';

let current, support;
let retiring = Promise.resolve();
const TIMEOUT_MS = 30000;
const aborted = () => new DOMException('Texture loader disposed', 'AbortError');

export function configureKTX2Support(renderer) {
  if (support) return;
  // Capability detection allocates no workers or transcoder resources.
  support = { ...new KTX2Loader().detectSupport(renderer).workerConfig };
}

function ensureSupport() {
  if (support) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const probe = new WebGLRenderer({ canvas, antialias: false });
  try {
    configureKTX2Support(probe);
  } finally {
    probe.dispose();
    probe.forceContextLoss();
  }
}

function retire(entry, reason) {
  if (entry.abort.signal.aborted) return;
  if (current === entry) current = null;
  entry.abort.abort(reason);
  entry.manager.abort();
  // Initialization may still be creating its worker URL. Finish its cleanup
  // before a replacement starts, including after an aborted WASM transfer.
  retiring = entry.ready
    .catch(() => {})
    .then(() => {
      if (entry.loader.transcoderPending) entry.loader.dispose();
    });
}

function acquire(client) {
  client.abort.signal.throwIfAborted();
  if (client.entry && !client.entry.abort.signal.aborted) return client.entry;
  ensureSupport();
  if (!current) {
    const manager = new LoadingManager();
    const loader = new KTX2Loader(manager)
      .setTranscoderPath(assetURL('assets/ships/decoder/'))
      .setWorkerLimit(2);
    loader.workerConfig = { ...support };
    const entry = {
      manager,
      loader,
      abort: new AbortController(),
      clients: new Set(),
      ready: null,
    };
    const timer = setTimeout(
      () =>
        retire(entry, new Error('Texture decoder timed out; retry loading')),
      TIMEOUT_MS,
    );
    entry.ready = retiring
      .then(() => {
        entry.abort.signal.throwIfAborted();
        return loader.init();
      })
      .catch((error) => {
        retire(entry, error);
        throw error;
      })
      .finally(() => clearTimeout(timer));
    current = entry;
  }
  client.entry = current;
  current.clients.add(client);
  return current;
}

function cancellable(work, signal, releaseLate = false) {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
    work
      .then((value) => {
        if (signal.aborted) {
          if (releaseLate) value.dispose();
        } else resolve(value);
      }, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}

/** Request ownership stays local; only the two-worker decoder is shared.
 * Returned textures are independent and remain owned by their caller. */
export class SharedKTX2Loader extends Loader {
  constructor(manager) {
    super(manager);
    this.abort = new AbortController();
    this.entry = null;
  }

  detectSupport(renderer) {
    configureKTX2Support(renderer);
    return this;
  }

  async init() {
    const entry = acquire(this);
    await cancellable(
      entry.ready,
      AbortSignal.any([this.abort.signal, entry.abort.signal]),
    );
    return this;
  }

  load(url, onLoad, onProgress, onError) {
    const signal = AbortSignal.any([
      this.abort.signal,
      this.manager.abortController.signal,
    ]);
    const work = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return new FileLoader(this.manager)
          .setPath(this.path)
          .setCrossOrigin(this.crossOrigin)
          .setWithCredentials(this.withCredentials)
          .setRequestHeader(this.requestHeader)
          .setResponseType('arraybuffer')
          .loadAsync(url, onProgress);
      })
      .then((buffer) => {
        signal.throwIfAborted();
        return this.decode(buffer);
      });
    cancellable(work, signal, true).then(onLoad, onError);
  }

  async decode(buffer) {
    const entry = acquire(this);
    const signal = AbortSignal.any([this.abort.signal, entry.abort.signal]);
    const timer = setTimeout(
      () =>
        retire(entry, new Error('Texture decoder timed out; retry loading')),
      TIMEOUT_MS,
    );
    const work = entry.ready.then(() => {
      signal.throwIfAborted();
      // FileLoader deduplicates simultaneous fetches. Give each consumer its
      // own transferable bytes and texture, avoiding shared sampler/disposal state.
      return new Promise((resolve, reject) =>
        entry.loader.parse(buffer.slice(0), resolve, reject),
      );
    });
    try {
      return await cancellable(work, signal, true);
    } finally {
      clearTimeout(timer);
    }
  }

  invalidate(reason) {
    if (this.entry) retire(this.entry, reason);
  }

  dispose() {
    if (this.abort.signal.aborted) return;
    this.abort.abort(aborted());
    const entry = this.entry;
    if (!entry) return;
    entry.clients.delete(this);
    if (!entry.clients.size) retire(entry, aborted());
    this.entry = null;
  }
}
