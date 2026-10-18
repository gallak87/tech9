import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsContext } from './graphics-context.js';

function fixture(compileAsync = async () => {}) {
  let lost = false;
  const renderer = {
    domElement: new EventTarget(),
    getContext: () => ({ isContextLost: () => lost }),
    compileAsync,
  };
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
