const staleError = () =>
  Object.assign(new Error('Asset preparation was replaced by a new session.'), {
    name: 'AbortError',
  });

// Browser-independent lifetime controller. Loaded sources belong to the art
// importers; this registry retains IDs and byte counts, not duplicate canvases.
export class AssetCache {
  constructor({
    entries,
    dependencies,
    load,
    install,
    release,
    measure = () => 0,
    profile = 'full',
    concurrency = 2,
    budgetBytes = 320 * 1024 * 1024,
    onProgress = () => {},
  }) {
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
    this.dependencies = dependencies;
    this.load = load;
    this.install = install;
    this.release = release;
    this.measure = measure;
    this.profile = profile === 'mobile' ? 'mobile' : 'full';
    this.concurrency =
      this.profile === 'full' ? entries.length : Math.max(1, concurrency);
    this.budgetBytes = budgetBytes;
    this.onProgress = onProgress;
    this.loaded = new Map();
    this.inflight = new Map();
    this.groups = new Map();
    this.requests = new Map();
    this.queue = [];
    this.running = 0;
    this.generation = 0;
    this.clock = 0;
    this.active = null;
    this.peakBytes = 0;
    this.peakSourceBytes = 0;
    this.peakWorkingBytes = 0;
    this.workingBytes = 0;
    this.errors = [];
  }
  specification(destination) {
    return this.profile === 'full'
      ? { key: 'all', ids: [...this.entries.keys()] }
      : this.dependencies(destination);
  }
  isReady(destination) {
    return this.specification(destination).ids.every((id) =>
      this.loaded.has(id),
    );
  }
  async prepare(destination, { speculative = false } = {}) {
    const generation = this.generation,
      spec = this.specification(destination),
      token = {};
    for (const id of spec.ids)
      if (!this.entries.has(id))
        throw new Error(`Unregistered asset dependency: ${id}`);
    this.requests.set(token, new Set(spec.ids));
    try {
      const results = await Promise.allSettled(
        spec.ids.map((id) => this.ensure(id, generation, speculative)),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (generation !== this.generation) throw staleError();
      this.groups.set(spec.key, {
        ids: new Set(spec.ids),
        used: ++this.clock,
        reserved: !speculative,
      });
      return { key: spec.key, loaded: spec.ids.length };
    } finally {
      this.requests.delete(token);
      this.trim();
    }
  }
  ensure(id, generation, speculative) {
    if (this.loaded.has(id)) return Promise.resolve();
    const pending = this.inflight.get(id);
    if (pending?.generation === generation) {
      if (!speculative) pending.priority = 0;
      return pending.promise;
    }
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
      task = {
        id,
        generation,
        priority: speculative ? 1 : 0,
        promise,
        resolve,
        reject,
        controller: new AbortController(),
      };
    this.inflight.set(id, task);
    this.queue.push(task);
    this.drain();
    return promise;
  }
  drain() {
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.running < this.concurrency && this.queue.length) {
      const task = this.queue.shift();
      if (task.generation !== this.generation) {
        task.reject(staleError());
        continue;
      }
      this.running++;
      this.run(task);
    }
  }
  async run(task) {
    let source = null,
      bytes = 0;
    try {
      const entry = this.entries.get(task.id);
      task.started = true;
      this.onProgress(this.diagnostics());
      source = await this.load(entry, { signal: task.controller.signal });
      bytes = (source.width || 0) * (source.height || 0) * 4;
      this.workingBytes += bytes;
      this.peakWorkingBytes = Math.max(
        this.peakWorkingBytes,
        this.workingBytes,
      );
      if (task.generation !== this.generation) throw staleError();
      await this.install(entry, source);
      // Installation is synchronous in production. The second check also makes
      // injected asynchronous importers safe to use in lifecycle tests.
      if (task.generation !== this.generation) {
        this.release(entry);
        throw staleError();
      }
      this.loaded.set(task.id, { bytes });
      source = null;
      this.sample();
      this.trim();
      this.onProgress(this.diagnostics());
      task.resolve();
    } catch (error) {
      if (error.name !== 'AbortError')
        this.errors.push({ id: task.id, message: error.message });
      task.reject(error);
    } finally {
      this.workingBytes -= bytes;
      // A canceled decode must not keep an uninstalled full-size canvas alive.
      if (source) {
        source.width = 0;
        source.height = 0;
      }
      if (this.inflight.get(task.id) === task) this.inflight.delete(task.id);
      this.running--;
      this.drain();
    }
  }
  activate(destination) {
    const spec = this.specification(destination);
    if (!this.isReady(destination))
      throw new Error('Cannot activate artwork before preparation completes.');
    for (const group of this.groups.values()) group.reserved = false;
    const prepared = this.groups.get(spec.key);
    this.groups.set(spec.key, {
      ids: new Set([...(prepared?.ids || []), ...spec.ids]),
      used: ++this.clock,
      reserved: false,
    });
    this.active = spec.key;
    this.trim();
  }
  resetSession() {
    this.generation++;
    for (const task of this.inflight.values()) task.controller.abort();
    for (const task of this.queue) {
      task.reject(staleError());
      if (this.inflight.get(task.id) === task) this.inflight.delete(task.id);
    }
    this.queue.length = 0;
    this.requests.clear();
    for (const group of this.groups.values()) group.reserved = false;
    // Keep the valid source and its art until a successfully prepared replacement
    // activates. Failed/canceled loads never strand the current scene.
    this.trim();
  }
  protectedIds() {
    const ids = new Set(this.dependencies().ids);
    for (const group of this.groups.values())
      if (group.reserved || this.groups.get(this.active) === group)
        for (const id of group.ids) ids.add(id);
    for (const request of this.requests.values())
      for (const id of request) ids.add(id);
    return ids;
  }
  trim() {
    if (this.profile === 'full') return;
    const candidates = [...this.groups.entries()]
      .filter(
        ([key, group]) =>
          key !== this.active && key !== 'common' && !group.reserved,
      )
      .sort((a, b) => a[1].used - b[1].used);
    for (const [key] of candidates) {
      const regionCount = [...this.groups.keys()].filter(
        (id) => id !== 'common',
      ).length;
      if (regionCount <= 2 && this.currentBytes() <= this.budgetBytes) break;
      this.groups.delete(key);
      this.releaseUnused();
    }
    this.releaseUnused();
    this.sample();
  }
  releaseUnused() {
    const retained = this.protectedIds();
    for (const group of this.groups.values())
      for (const id of group.ids) retained.add(id);
    for (const id of this.loaded.keys()) {
      if (retained.has(id)) continue;
      this.release(this.entries.get(id));
      this.loaded.delete(id);
    }
  }
  currentBytes() {
    const measured = this.measure();
    return Number.isFinite(measured) && measured > 0
      ? measured
      : [...this.loaded.values()].reduce(
          (total, record) => total + record.bytes,
          0,
        );
  }
  sample() {
    this.peakBytes = Math.max(this.peakBytes, this.currentBytes());
    this.peakSourceBytes = Math.max(
      this.peakSourceBytes,
      [...this.loaded.values()].reduce(
        (total, record) => total + record.bytes,
        0,
      ),
    );
  }
  diagnostics() {
    this.sample();
    return {
      profile: this.profile,
      loadedCount: this.loaded.size,
      // One active source describes current work without listing queued files
      // or exposing filenames. Completed sources no longer own the label.
      loadingId:
        [...this.inflight.values()].find(
          (task) =>
            task.started &&
            task.generation === this.generation &&
            !this.loaded.has(task.id),
        )?.id ?? null,
      totalCount: this.entries.size,
      activeGroup: this.active,
      retainedGroups: [...this.groups.keys()],
      retainedBytes: this.currentBytes(),
      peakRetainedBytes: this.peakBytes,
      sourcePixelBytes: [...this.loaded.values()].reduce(
        (total, record) => total + record.bytes,
        0,
      ),
      peakSourcePixelBytes: this.peakSourceBytes,
      peakWorkingSourceBytes: this.peakWorkingBytes,
      budgetBytes: this.budgetBytes,
      running: this.running,
      queued: this.queue.length,
      generation: this.generation,
      errors: this.errors.slice(-10),
    };
  }
}
