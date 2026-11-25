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
  async function interruptible(work) {
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
          return work();
        }),
      ]);
      check();
    } catch (error) {
      throw normalize(error);
    } finally {
      waiting.delete(rejectPending);
    }
  }
  return {
    check,
    normalize,
    compile(scene, camera, targetScene) {
      return interruptible(() =>
        renderer.compileAsync(scene, camera, targetScene),
      );
    },
    async waitForGPU() {
      const gl = renderer.getContext();
      let fence, timer;
      try {
        await interruptible(() => {
          fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (!fence) throw new Error('Could not synchronize graphics warmup.');
          gl.flush();
          return new Promise((resolve, reject) => {
            function poll() {
              try {
                check();
                const status = gl.clientWaitSync(fence, 0, 0);
                if (status === gl.TIMEOUT_EXPIRED) timer = setTimeout(poll, 8);
                else if (
                  status === gl.ALREADY_SIGNALED ||
                  status === gl.CONDITION_SATISFIED
                )
                  resolve();
                else
                  reject(new Error('Graphics warmup synchronization failed.'));
              } catch (error) {
                reject(error);
              }
            }
            // A WebGL fence can signal once control has returned to the browser.
            timer = setTimeout(poll, 0);
          });
        });
      } finally {
        clearTimeout(timer);
        if (fence) gl.deleteSync(fence);
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
