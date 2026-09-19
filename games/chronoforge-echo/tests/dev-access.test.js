import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localDevHost,
  localDevPreviewRequested,
  devPreviewReady,
} from '../src/dev-access.js';

test('localhost allows manual opening without a flag, while automatic opening requires dev=1', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    for (const protocol of ['http', 'https'])
      assert.equal(
        localDevPreviewRequested(new URL(`${protocol}://${host}:4321/?dev=1`)),
        true,
      );
    for (const query of [
      '',
      '?dev=0',
      '?dev=true',
      '?dev',
      '?test=1',
      '?other=dev%3D1',
    ]) {
      const location = new URL(`http://${host}:4321/${query}`);
      assert.equal(
        localDevHost(location),
        true,
        'Backtick remains available without dev=1',
      );
      assert.equal(localDevPreviewRequested(location), false);
    }
  }
  assert.equal(
    localDevPreviewRequested(
      new URL('http://localhost:4321/tech9/chronoforge-echo/?test=1&dev=1'),
    ),
    true,
  );
  for (const url of [
    'https://example.com/?dev=1',
    'http://192.168.1.3:4321/?dev=1',
    'http://localhost.example.com/?dev=1',
    'http://example.com/localhost?dev=1',
    'http://localhost@example.com/?dev=1',
    'file:///tmp/index.html?dev=1',
  ]) {
    assert.equal(localDevPreviewRequested(new URL(url)), false, url);
    assert.equal(localDevHost(new URL(url)), false, url);
  }
});

test('automatic opening waits for exploration without blocking title, dialogue, battles, or transitions', () => {
  const game = {
    mode: 'world',
    ui: { blocked: false },
    transition: null,
    state: {},
  };
  assert.equal(devPreviewReady(game), true);
  for (const mode of ['title', 'battle'])
    assert.equal(devPreviewReady({ ...game, mode }), false);
  assert.equal(devPreviewReady({ ...game, ui: { blocked: true } }), false);
  assert.equal(devPreviewReady({ ...game, transition: { time: 0.1 } }), false);
  assert.equal(
    devPreviewReady({ ...game, state: { recruitmentWalk: { elapsed: 0 } } }),
    false,
  );
});
