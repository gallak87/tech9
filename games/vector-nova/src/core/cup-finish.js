const immutable = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
};

// The worker owns classification. This owner only latches its result and keeps
// the normal finish beat, while the visible race continues at its own clock.
export function createCupFinish({ resolve, onComplete, onError } = {}) {
  let elapsed = 0;
  let result;
  let error;
  let disposed = false;
  const reject = (failure) => {
    if (disposed || error) return;
    result = undefined;
    if (failure?.name === 'AbortError') return;
    error = failure instanceof Error ? failure : new Error(String(failure));
    try {
      onError?.(error);
    } catch {
      /* Reporting cannot leak an unhandled classification rejection. */
    }
  };
  try {
    void Promise.resolve(resolve())
      .then((value) => {
        if (disposed) return;
        if (!value || typeof value !== 'object')
          throw new Error('Cup classification returned no result.');
        result = immutable(structuredClone(value));
        // Persistence must not wait for RAF in a hidden or suspended view.
        return onComplete?.(result);
      })
      .catch(reject);
  } catch (failure) {
    reject(failure);
  }
  return {
    advance(dt) {
      if (!disposed) elapsed += dt;
      const complete = !disposed && result !== undefined;
      return {
        complete,
        ready: complete && elapsed >= 2.4,
        ...(complete ? { result } : {}),
        ...(!disposed && error ? { error } : {}),
      };
    },
    dispose() {
      disposed = true;
      result = undefined;
      error = undefined;
    },
  };
}
