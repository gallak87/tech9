// FIFO query sharing is bounded independently of race length and racer count.
// Cached frames stay private; callers receive their own mutable vectors.
export class SamplingCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new Error('A sampling cache needs a positive capacity.');
    this.capacity = capacity;
    this.values = new Map();
    this.keys = new Array(capacity);
    this.cursor = 0;
  }

  get(key) {
    return this.values.get(key);
  }

  set(key, value) {
    if (!this.values.has(key)) {
      if (this.values.size === this.capacity)
        this.values.delete(this.keys[this.cursor]);
      this.keys[this.cursor] = key;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.values.set(key, value);
    return value;
  }
}

export function copySample(frame) {
  return {
    ...frame,
    position: frame.position.clone(),
    tangent: frame.tangent.clone(),
    right: frame.right.clone(),
    up: frame.up.clone(),
    quaternion: frame.quaternion.clone(),
    ...(frame.bounds ? { bounds: { ...frame.bounds } } : {}),
  };
}
