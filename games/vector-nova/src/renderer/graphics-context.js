export class GraphicsContextLostError extends Error {
  constructor(cause) {
    super(
      'The browser lost its graphics context. Close other tabs, or choose Low graphics, then retry.',
      { cause },
    );
    this.name = 'GraphicsContextLostError';
  }
}

// Install before the first shader/PMREM draw, not after the world is built.
// A lost context can return null from createShader before its event is delivered.
export function createGraphicsContext(renderer, signal) {
  const canvas = renderer.domElement;
  const waiting = new Set();
  let lost = false,
    disposed = false;
  const normalize = (error) =>
    error?.name !== 'AbortError' &&
    (lost || renderer.getContext().isContextLost())
      ? new GraphicsContextLostError(error)
      : error;
  function check() {
    signal?.throwIfAborted();
    if (disposed) throw new DOMException('Cancelled', 'AbortError');
    if (lost || renderer.getContext().isContextLost())
      throw new GraphicsContextLostError();
  }
  function cancel(error) {
    for (const reject of waiting) reject(error);
    waiting.clear();
  }
  function onLost(event) {
    event.preventDefault();
    lost = true;
    cancel(new GraphicsContextLostError());
  }
  const onAbort = () => cancel(signal.reason);
  canvas.addEventListener('webglcontextlost', onLost);
  signal?.addEventListener('abort', onAbort);
  return {
    check,
    normalize,
    async compile(scene, camera, targetScene) {
      check();
      let rejectPending;
      const interrupted = new Promise((_, reject) => {
        rejectPending = reject;
        waiting.add(reject);
      });
      try {
        await Promise.race([
          interrupted,
          Promise.resolve().then(() => {
            check();
            return renderer.compileAsync(scene, camera, targetScene);
          }),
        ]);
        check();
      } catch (error) {
        throw normalize(error);
      } finally {
        waiting.delete(rejectPending);
      }
    },
    dispose() {
      disposed = true;
      cancel(new DOMException('Cancelled', 'AbortError'));
      canvas.removeEventListener('webglcontextlost', onLost);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}
