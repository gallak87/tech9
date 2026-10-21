/** Only the latest scene request may commit; each owns its preparation reservation. */
export class SceneTransition {
  constructor(cache) {
    this.cache = cache;
    this.sequence = 0;
    this.disposed = false;
  }
  async run(key, ids, { validate = () => {}, commit = () => {} } = {}) {
    if (this.disposed) throw new Error('Scene transition is disposed');
    const ticket = ++this.sequence,
      reservation = {};
    await this.cache.prepare(key, ids, { reservation });
    if (ticket !== this.sequence || this.disposed) {
      this.cache.discard(key, { reservation });
      return false;
    }
    try {
      validate();
    } catch (error) {
      this.cache.discard(key, { reservation });
      throw error;
    }
    this.cache.activate(key, { reservation });
    commit();
    return true;
  }
  dispose() {
    this.disposed = true;
    this.sequence++;
  }
}
