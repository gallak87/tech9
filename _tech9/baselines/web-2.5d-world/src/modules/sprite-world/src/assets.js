import { validateFrames } from './frames.js';
const aborted = () =>
  Object.assign(new Error('Asset preparation was canceled.'), {
    name: 'AbortError',
  });
export function releaseImage(image) {
  if (typeof image.close === 'function') image.close();
  else if ('src' in image) image.src = '';
  else if ('width' in image) {
    image.width = 0;
    image.height = 0;
  }
}
export function loadImage(entry, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = image.onerror = null;
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(aborted());
    };
    image.onload = () => {
      cleanup();
      try {
        validateFrames(entry, image);
        resolve(image);
      } catch (error) {
        image.src = '';
        reject(error);
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Required artwork failed to load: ${entry.id}`));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    image.src = entry.url;
  });
}
/** Owns decoded sources. A group switches atomically; active and pending groups are protected. */
export class AssetCache {
  constructor({
    entries,
    load = loadImage,
    release = releaseImage,
    concurrency = 2,
    budgetBytes = 96 * 1024 ** 2,
    warmGroups = 1,
    commonIds = [],
  } = {}) {
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
    if (this.entries.size !== entries.length)
      throw new Error('Duplicate asset ID');
    this.load = load;
    this.release = release;
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.budgetBytes = Math.max(0, budgetBytes);
    this.warmGroups = Math.max(0, Math.floor(warmGroups));
    this.commonIds = new Set(commonIds);
    this.images = new Map();
    this.records = new Map();
    this.pending = new Map();
    this.queue = [];
    this.groups = new Map();
    this.requests = new Map();
    this.running = 0;
    this.generation = 0;
    this.clock = 0;
    this.active = null;
    this.disposed = false;
    this.peakBytes = 0;
  }
  async prepare(key, ids) {
    if (this.disposed) throw new Error('Asset cache is disposed');
    ids = [...new Set([...this.commonIds, ...ids])];
    for (const id of ids)
      if (!this.entries.has(id)) throw new Error(`Unknown asset: ${id}`);
    const token = {},
      generation = this.generation;
    this.requests.set(token, new Set(ids));
    try {
      const results = await Promise.allSettled(
        ids.map((id) => this.ensure(id, generation)),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (this.generation !== generation || this.disposed) throw aborted();
      this.groups.set(key, {
        ids: new Set(ids),
        used: ++this.clock,
        reserved: true,
      });
      return this.images;
    } finally {
      this.requests.delete(token);
      this.trim();
    }
  }
  ensure(id, generation) {
    if (this.images.has(id)) return Promise.resolve(this.images.get(id));
    const current = this.pending.get(id);
    if (current?.generation === generation) return current.promise;
    let resolve, reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const task = {
      id,
      generation,
      resolve,
      reject,
      promise,
      controller: new AbortController(),
    };
    this.pending.set(id, task);
    this.queue.push(task);
    this.drain();
    return promise;
  }
  drain() {
    while (
      !this.disposed &&
      this.running < this.concurrency &&
      this.queue.length
    ) {
      const task = this.queue.shift();
      if (task.generation !== this.generation) {
        task.reject(aborted());
        continue;
      }
      this.running++;
      this.run(task);
    }
  }
  async run(task) {
    let image;
    try {
      image = await this.load(this.entries.get(task.id), {
        signal: task.controller.signal,
      });
      if (this.disposed || task.generation !== this.generation) throw aborted();
      this.images.set(task.id, image);
      this.records.set(task.id, (image.width || 0) * (image.height || 0) * 4);
      this.peakBytes = Math.max(this.peakBytes, this.bytes);
      task.resolve(image);
      image = null;
    } catch (error) {
      if (image) this.release(image);
      task.reject(error);
    } finally {
      if (this.pending.get(task.id) === task) this.pending.delete(task.id);
      this.running--;
      this.drain();
    }
  }
  activate(key) {
    const group = this.groups.get(key);
    if (!group || [...group.ids].some((id) => !this.images.has(id)))
      throw new Error('Prepare artwork before activation');
    for (const g of this.groups.values()) g.reserved = false;
    group.used = ++this.clock;
    this.active = key;
    this.trim();
  }
  discard(key) {
    if (key === this.active) return false;
    this.groups.delete(key);
    this.releaseUnused();
    return true;
  }
  trim() {
    if (this.disposed) return;
    let inactive = [...this.groups]
      .filter(([key, g]) => key !== this.active && !g.reserved)
      .sort((a, b) => a[1].used - b[1].used);
    while (
      inactive.length &&
      (inactive.length > this.warmGroups || this.bytes > this.budgetBytes)
    ) {
      this.groups.delete(inactive.shift()[0]);
      this.releaseUnused();
    }
    this.releaseUnused();
  }
  releaseUnused() {
    const retained = new Set(this.commonIds);
    for (const group of this.groups.values())
      for (const id of group.ids) retained.add(id);
    for (const ids of this.requests.values())
      for (const id of ids) retained.add(id);
    for (const [id, image] of this.images)
      if (!retained.has(id)) {
        this.release(image);
        this.images.delete(id);
        this.records.delete(id);
      }
  }
  resetSession() {
    if (this.disposed) return;
    this.generation++;
    for (const task of this.pending.values()) task.controller.abort();
    for (const task of this.queue) task.reject(aborted());
    this.queue = [];
    this.pending.clear();
    this.requests.clear();
    for (const group of this.groups.values()) group.reserved = false;
    this.trim();
  }
  get bytes() {
    return [...this.records.values()].reduce((sum, value) => sum + value, 0);
  }
  diagnostics() {
    return {
      assetCount: this.images.size,
      assetBytes: this.bytes,
      peakAssetBytes: this.peakBytes,
      budgetBytes: this.budgetBytes,
      running: this.running,
      queued: this.queue.length,
      activeGroup: this.active,
      groups: [...this.groups.keys()],
      disposed: this.disposed,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.resetSession();
    this.disposed = true;
    for (const image of this.images.values()) this.release(image);
    this.images.clear();
    this.records.clear();
    this.groups.clear();
    this.active = null;
  }
}
