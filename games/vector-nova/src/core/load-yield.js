export const simulationLoadStages = Object.freeze({
  collision: 'Building collision geometry',
  boundaries: 'Preparing track boundaries',
  dynamics: 'Initializing physics',
});

// The task after requestAnimationFrame lets the browser paint the current
// stage and process input before a synchronous constructor starts.
export function waitForLoadPaint(signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let frame;
    let task;
    function finish() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(task);
      signal?.removeEventListener('abort', finish);
      if (signal?.aborted) reject(signal.reason);
      else resolve();
    }
    if (
      globalThis.document?.visibilityState === 'visible' &&
      typeof requestAnimationFrame === 'function'
    ) {
      // A backgrounded or throttled tab might not send the scheduled frame.
      task = setTimeout(finish, 100);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        clearTimeout(task);
        task = setTimeout(finish, 0);
      });
    } else task = setTimeout(finish, 0);
    signal?.addEventListener('abort', finish, { once: true });
  });
}
