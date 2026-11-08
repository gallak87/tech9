import { RACE_ORDER } from '../race/roster.js';

const immutable = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
};
const canceled = () =>
  new DOMException('Cup classification canceled.', 'AbortError');
const errorFrom = (value) =>
  value instanceof Error
    ? value
    : new Error(
        value?.message || String(value || 'Cup classification failed.'),
      );
function finalResult(value) {
  const rows = value?.standings;
  const player = Array.isArray(rows)
    ? rows.find((row) => row?.id === 'player')
    : null;
  if (
    !Array.isArray(rows) ||
    rows.length !== RACE_ORDER.length ||
    new Set(rows.map((row) => row?.id)).size !== RACE_ORDER.length ||
    !rows.every(
      (row) =>
        row &&
        RACE_ORDER.includes(row.id) &&
        typeof row.finished === 'boolean' &&
        typeof row.valid === 'boolean' &&
        (row.finished
          ? Number.isFinite(row.totalTime) && row.totalTime > 0
          : row.totalTime === null),
    ) ||
    !player?.finished ||
    !Number.isFinite(value.playerTotalTime) ||
    value.playerTotalTime !== player.totalTime ||
    value.playerValid !== player.valid
  )
    throw new Error('Cup classification returned an incomplete result.');
  return immutable(structuredClone(value));
}

// Warm an isolated simulation during the race. Only a single finish checkpoint
// crosses to the worker; the live world never swaps or advances for scoring.
export function createCupClassification({
  levelId,
  settings,
  createWorker,
} = {}) {
  let worker,
    disposed = false,
    terminated = false,
    failure,
    nextId = 0,
    readyResolve,
    readyReject;
  const requests = new Map();
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  // Warming is opportunistic; its failure is reported when classification is
  // requested instead of leaking an unhandled rejection during the race.
  void ready.catch(() => {});
  function settle(id, value, error) {
    const request = requests.get(id);
    if (!request) return;
    requests.delete(id);
    request.signal?.removeEventListener('abort', request.onAbort);
    if (error) request.reject(error);
    else request.resolve(value);
  }
  function stop() {
    if (terminated) return;
    terminated = true;
    worker?.removeEventListener('message', onMessage);
    worker?.removeEventListener('error', onError);
    worker?.removeEventListener('messageerror', onError);
    worker?.terminate();
  }
  function fail(error) {
    if (disposed || failure) return;
    failure = errorFrom(error);
    readyReject(failure);
    for (const id of requests.keys()) settle(id, null, failure);
    stop();
  }
  function onMessage({ data }) {
    if (disposed || failure) return;
    if (data?.type === 'ready') {
      readyResolve();
    } else if (data?.type === 'result') {
      if (!requests.has(data.requestId)) return;
      try {
        settle(data.requestId, finalResult(data.result));
      } catch (error) {
        settle(data.requestId, null, errorFrom(error));
      }
    } else if (data?.type === 'error') {
      const error = new Error(data.message || 'Cup classification failed.');
      if (data.requestId != null) settle(data.requestId, null, error);
      else fail(error);
    } else fail(new Error('Invalid cup classification worker response.'));
  }
  function onError(event) {
    event.preventDefault?.();
    fail(
      event.error ||
        new Error(event.message || 'Cup classification worker failed.'),
    );
  }
  try {
    worker = createWorker
      ? createWorker()
      : new Worker(new URL('./cup-classification-worker.js', import.meta.url), {
          type: 'module',
        });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
    worker.postMessage({
      type: 'init',
      levelId,
      settings: structuredClone(settings ?? {}),
    });
  } catch (error) {
    fail(error);
  }
  return {
    ready,
    resolve(checkpoint, { signal } = {}) {
      if (disposed || signal?.aborted) return Promise.reject(canceled());
      if (failure) return Promise.reject(failure);
      let retained;
      try {
        retained = structuredClone(checkpoint);
      } catch (error) {
        return Promise.reject(error);
      }
      return new Promise((resolve, reject) => {
        const requestId = ++nextId;
        const request = {
          resolve,
          reject,
          signal,
          posted: false,
          onAbort() {
            if (request.posted) {
              try {
                worker.postMessage({ type: 'cancel', requestId });
              } catch {
                /* A stopped worker already owns no live request. */
              }
            }
            settle(requestId, null, canceled());
          },
        };
        requests.set(requestId, request);
        signal?.addEventListener('abort', request.onAbort, { once: true });
        ready.then(
          () => {
            if (!requests.has(requestId) || disposed || failure) return;
            try {
              worker.postMessage({
                type: 'resolve',
                requestId,
                checkpoint: retained,
              });
              request.posted = true;
            } catch (error) {
              settle(requestId, null, errorFrom(error));
            }
          },
          (error) => settle(requestId, null, error),
        );
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const error = canceled();
      readyReject(error);
      for (const id of requests.keys()) settle(id, null, error);
      stop();
    },
  };
}
