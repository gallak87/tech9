import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsContext } from './graphics-context.js';

function fixture(compileAsync = async () => {}, context = {}) {
  let lost = false;
  const renderer = {
    domElement: new EventTarget(),
    getContext: () => gl,
    compileAsync,
  };
  const gl = { isContextLost: () => lost, ...context };
  const controller = new AbortController();
  const graphics = createGraphicsContext(renderer, controller.signal);
  return {
    graphics,
    controller,
    lose(deliver = true) {
      lost = true;
      if (deliver)
        renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
    },
  };
}

test('loss during shader creation is recognized before the context event', async () => {
  const shaderError = new TypeError(
    'shader must be an instance of WebGLShader',
  );
  const f = fixture(() => {
    f.lose(false);
    throw shaderError;
  });
  await assert.rejects(f.graphics.compile(), (error) => {
    assert.equal(error.name, 'GraphicsContextLostError');
    assert.equal(error.cause, shaderError);
    return true;
  });
  f.graphics.dispose();
});

test('context loss interrupts a compiler that never reports readiness', async () => {
  const f = fixture(() => new Promise(() => {}));
  const compiling = f.graphics.compile();
  await Promise.resolve();
  f.lose();
  await assert.rejects(compiling, { name: 'GraphicsContextLostError' });
  f.graphics.dispose();
});

test('cancel interrupts compilation and stays a cancellation after teardown', async () => {
  const f = fixture(() => new Promise(() => {}));
  const compiling = f.graphics.compile();
  await Promise.resolve();
  f.controller.abort();
  f.graphics.dispose();
  f.lose(false);
  await assert.rejects(compiling, { name: 'AbortError' });
});

test('real compiler failures are not misclassified as context loss', async () => {
  const error = new Error('Invalid shader');
  const f = fixture(() => {
    throw error;
  });
  await assert.rejects(f.graphics.compile(), (failure) => failure === error);
  f.graphics.dispose();
});

function fenceFixture(...statuses) {
  const fence = {};
  const calls = [];
  return {
    ...fixture(undefined, {
      SYNC_GPU_COMMANDS_COMPLETE: 'commands complete',
      ALREADY_SIGNALED: 'signaled',
      CONDITION_SATISFIED: 'satisfied',
      TIMEOUT_EXPIRED: 'waiting',
      fenceSync(condition, flags) {
        calls.push(['fence', condition, flags]);
        return fence;
      },
      flush: () => calls.push(['flush']),
      clientWaitSync(sync, flags, timeout) {
        calls.push(['poll', sync, flags, timeout]);
        return statuses.shift() ?? 'waiting';
      },
      deleteSync: (sync) => calls.push(['delete', sync]),
    }),
    fence,
    calls,
  };
}

test('graphics warmup waits for submitted work with zero-timeout polling', async () => {
  const f = fenceFixture('waiting', 'satisfied');
  const ready = f.graphics.waitForGPU();
  // Creating and flushing the fence does not poll within the submission turn.
  await Promise.resolve();
  assert.deepEqual(f.calls, [['fence', 'commands complete', 0], ['flush']]);
  await ready;
  assert.deepEqual(f.calls.slice(2), [
    ['poll', f.fence, 0, 0],
    ['poll', f.fence, 0, 0],
    ['delete', f.fence],
  ]);
  f.graphics.dispose();
});

test('graphics warmup disposes the fence after an unsuccessful GPU wait', async () => {
  const f = fenceFixture('failed');
  await assert.rejects(f.graphics.waitForGPU(), /synchronization failed/);
  assert.deepEqual(f.calls.at(-1), ['delete', f.fence]);
  f.graphics.dispose();
});

test('cancel, dispose and context loss interrupt a pending GPU wait and free its fence', async (t) => {
  const cases = [
    ['cancel', (f) => f.controller.abort(), 'AbortError'],
    ['dispose', (f) => f.graphics.dispose(), 'AbortError'],
    ['context loss', (f) => f.lose(), 'GraphicsContextLostError'],
  ];
  for (const [label, stop, name] of cases)
    await t.test(label, async () => {
      const f = fenceFixture();
      const ready = f.graphics.waitForGPU();
      await Promise.resolve();
      stop(f);
      await assert.rejects(ready, { name });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepEqual(f.calls, [
        ['fence', 'commands complete', 0],
        ['flush'],
        ['delete', f.fence],
      ]);
      f.graphics.dispose();
    });
});
