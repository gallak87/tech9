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
    if (!Array.isArray(entries))
      throw new Error('Asset entries must be an array');
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error('Asset concurrency must be a finite positive integer');
    if (!Number.isFinite(budgetBytes) || budgetBytes < 0)
      throw new Error('Asset budgetBytes must be finite and nonnegative');
    if (!Number.isInteger(warmGroups) || warmGroups < 0)
      throw new Error('Asset warmGroups must be a finite nonnegative integer');
    if (typeof load !== 'function' || typeof release !== 'function')
      throw new Error('Asset load and release must be functions');
    this.entries = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim())
        throw new Error('Asset entries require nonempty string ids');
      if (this.entries.has(entry.id))
        throw new Error(`Duplicate asset ID: ${entry.id}`);
      this.entries.set(entry.id, entry);
    }
    if (
      !Array.isArray(commonIds) ||
      commonIds.some((id) => !this.entries.has(id))
    )
      throw new Error('Common asset ids must name registered entries');
    this.load = load;
    this.release = release;
    this.concurrency = concurrency;
    this.budgetBytes = budgetBytes;
    this.warmGroups = warmGroups;
    this.commonIds = new Set(commonIds);
    this.images = new Map();
    this.records = new Map();
    this.pending = new Map();
    this.queue = [];
    this.groups = new Map();
    this.reservations = new Map();
    this.requests = new Map();
    this.running = 0;
    this.generation = 0;
    this.clock = 0;
    this.active = null;
    this.disposed = false;
    this.peakBytes = 0;
  }
  async prepare(key, ids, { reservation = key } = {}) {
    if (this.disposed) throw new Error('Asset cache is disposed');
    if (typeof key !== 'string' || !key.trim())
      throw new Error('Asset group requires a nonempty string key');
    if (!Array.isArray(ids) && !(ids instanceof Set))
      throw new Error('Asset dependency ids must be an array or Set');
    const held = this.reservations.get(reservation);
    if (held && held.key !== key)
      throw new Error('An asset reservation cannot own different groups');
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
      if (!this.groups.has(key))
        this.groups.set(key, { ids: new Set(), used: ++this.clock });
      this.reservations.set(reservation, { key, ids: new Set(ids) });
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
  activate(key, { reservation = key } = {}) {
    const group = this.groups.get(key),
      held = this.reservations.get(reservation);
    if (held && held.key !== key)
      throw new Error('Asset reservation does not own this group');
    if (!group || (reservation !== key && !held))
      throw new Error('Prepare artwork before activation');
    const ids = held?.ids || group.ids;
    if ([...ids].some((id) => !this.images.has(id)))
      throw new Error('Prepare artwork before activation');
    group.ids = new Set(ids);
    group.used = ++this.clock;
    this.reservations.delete(reservation);
    this.active = key;
    this.trim();
  }
  hasReservation(key) {
    return [...this.reservations.values()].some((held) => held.key === key);
  }
  discard(key, { reservation = key } = {}) {
    const held = this.reservations.get(reservation);
    if (held?.key === key) this.reservations.delete(reservation);
    else if (reservation !== key) return false;
    if (key === this.active || this.hasReservation(key)) {
      this.releaseUnused();
      return Boolean(held);
    }
    const removed = this.groups.delete(key);
    this.releaseUnused();
    return removed;
  }
  trim() {
    if (this.disposed) return;
    const inactive = [...this.groups]
      .filter(([key]) => key !== this.active && !this.hasReservation(key))
      .sort((a, b) => a[1].used - b[1].used);
    while (
      inactive.length &&
      (inactive.length > this.warmGroups ||
        this.bytes > this.budgetBytes ||
        !inactive[0][1].ids.size)
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
    for (const held of this.reservations.values())
      for (const id of held.ids) retained.add(id);
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
    this.reservations.clear();
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
      reservationCount: this.reservations.size,
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
    this.reservations.clear();
    this.active = null;
  }
}
