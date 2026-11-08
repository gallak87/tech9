import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createCupFinish } from './cup-finish.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('the worker result latches once while the normal finish beat elapses', async () => {
  const task = deferred();
  let calls = 0;
  const finish = createCupFinish({
    resolve: () => {
      calls++;
      return task.promise;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(finish.advance(1), { complete: false, ready: false });
  const source = { standings: [{ id: 'player', totalTime: 100 }] };
  task.resolve(source);
  await flush();
  const progress = finish.advance(0);
  assert.equal(progress.complete, true);
  assert.equal(progress.ready, false);
  source.standings[0].totalTime = 999;
  assert.equal(progress.result.standings[0].totalTime, 100);
  assert.ok(Object.isFrozen(progress.result.standings[0]));
  assert.throws(() => {
    progress.result.standings[0].totalTime = 1;
  }, TypeError);
  const final = finish.advance(1.4);
  assert.equal(final.ready, true);
  assert.equal(final.result, progress.result);
  assert.equal(calls, 1);
});

test('a slow classifier never fabricates readiness or advances any simulation', async () => {
  const task = deferred();
  const finish = createCupFinish({ resolve: () => task.promise });
  assert.deepEqual(finish.advance(10), { complete: false, ready: false });
  task.resolve({ standings: [] });
  await flush();
  assert.equal(finish.advance(0).ready, true);
});

test('classification can arrive while the presentation clock is paused', async () => {
  const task = deferred();
  const finish = createCupFinish({ resolve: () => task.promise });
  for (let i = 0; i < 20; i++) finish.advance(0);
  task.resolve({ standings: [] });
  await flush();
  assert.equal(finish.advance(0).ready, false);
  assert.equal(finish.advance(2.4).ready, true);
});

test('completion publishes once without a frame or presentation advance', async () => {
  const task = deferred();
  const saved = [];
  const finish = createCupFinish({
    resolve: () => task.promise,
    onComplete: (result) => {
      assert.ok(Object.isFrozen(result.standings[0]));
      saved.push(result);
    },
  });
  const source = { standings: [{ id: 'player', totalTime: 100 }] };
  task.resolve(source);
  await flush();
  assert.equal(saved.length, 1, 'a hidden tab saves without waiting for RAF');
  source.standings[0].totalTime = 999;
  assert.equal(saved[0].standings[0].totalTime, 100);
  assert.equal(finish.advance(0).result, saved[0]);
  assert.equal(finish.advance(0).ready, false);
  assert.equal(finish.advance(2.4).ready, true);
  finish.advance(10);
  assert.equal(saved.length, 1);
});

test('failed completion callbacks are reported without a successful presentation', async () => {
  for (const asynchronous of [false, true]) {
    const failure = new Error('persistence failed');
    const notices = [];
    const finish = createCupFinish({
      resolve: () => Promise.resolve({ standings: [] }),
      onComplete: () => {
        if (asynchronous) return Promise.reject(failure);
        throw failure;
      },
      onError: (error) => notices.push(error),
    });
    await flush();
    assert.deepEqual(notices, [failure]);
    assert.deepEqual(finish.advance(5), {
      complete: false,
      ready: false,
      error: failure,
    });
  }
});

test('synchronous and asynchronous errors are stored and notified once', async () => {
  for (const synchronous of [false, true]) {
    const task = deferred(),
      notices = [];
    const failure = new Error('classification failed');
    const finish = createCupFinish({
      resolve: () => {
        if (synchronous) throw failure;
        return task.promise;
      },
      onError: (error) => notices.push(error),
    });
    if (!synchronous) task.reject(failure);
    await flush();
    assert.deepEqual(finish.advance(5), {
      complete: false,
      ready: false,
      error: failure,
    });
    finish.advance(10);
    assert.deepEqual(notices, [failure]);
  }
});

test('canceled and disposed owners ignore late results and errors', async () => {
  for (const outcome of ['resolve', 'reject', 'abort']) {
    const task = deferred(),
      notices = [],
      completed = [];
    const finish = createCupFinish({
      resolve: () => task.promise,
      onComplete: (result) => completed.push(result),
      onError: (error) => notices.push(error),
    });
    if (outcome !== 'abort') finish.dispose();
    if (outcome === 'resolve') task.resolve({ standings: [] });
    else
      task.reject(
        outcome === 'abort'
          ? new DOMException('canceled', 'AbortError')
          : new Error('late failure'),
      );
    await flush();
    assert.deepEqual(finish.advance(5), { complete: false, ready: false });
    assert.deepEqual(notices, []);
    assert.deepEqual(completed, []);
    finish.dispose();
  }
});

test('missing results and throwing error reporters cannot leak unhandled promises', async () => {
  let notices = 0;
  const finish = createCupFinish({
    resolve: () => Promise.resolve(null),
    onError: () => {
      notices++;
      throw new Error('reporter failed');
    },
  });
  await flush();
  assert.match(finish.advance(0).error.message, /no result/);
  assert.equal(notices, 1);
});

test('disposing a completed owner releases its result and prevents a stale award', async () => {
  const finish = createCupFinish({
    resolve: () => Promise.resolve({ standings: [] }),
  });
  await flush();
  assert.equal(finish.advance(2.4).ready, true);
  finish.dispose();
  finish.dispose();
  assert.deepEqual(finish.advance(10), { complete: false, ready: false });
});
