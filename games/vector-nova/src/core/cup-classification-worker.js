import { createCupClassificationSession } from './cup-classification-session.js';

let boot;
let queue = Promise.resolve();
const requests = new Map();
const message = (error) => error?.message ?? String(error);

self.addEventListener('message', ({ data }) => {
  if (data?.type === 'init') {
    if (boot) return;
    boot = createCupClassificationSession({
      levelId: data.levelId,
      settings: data.settings,
    });
    boot.then(
      () => self.postMessage({ type: 'ready' }),
      (error) => self.postMessage({ type: 'error', message: message(error) }),
    );
    return;
  }
  if (data?.type === 'cancel') {
    requests.get(data.requestId)?.abort();
    return;
  }
  if (data?.type !== 'resolve') return;
  const { requestId, checkpoint } = data;
  const controller = new AbortController();
  requests.set(requestId, controller);
  queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        if (!boot)
          throw new Error('Cup classification worker is not initialized.');
        const session = await boot;
        controller.signal.throwIfAborted();
        const result = await session.resolve(checkpoint, {
          signal: controller.signal,
        });
        self.postMessage({ type: 'result', requestId, result });
      } catch (error) {
        if (!controller.signal.aborted)
          self.postMessage({
            type: 'error',
            requestId,
            message: message(error),
          });
      } finally {
        requests.delete(requestId);
      }
    });
});
