import test from 'node:test';
import assert from 'node:assert/strict';
import { readArtView, artPassURL } from './art-pass.js';

test('art view accepts default framing, explicit position/target and optional field of view', () => {
  assert.deepEqual(readArtView(new URLSearchParams()), {
    position: undefined,
    target: undefined,
    fov: undefined,
  });
  assert.deepEqual(
    readArtView(new URLSearchParams('cam=-20,100,40&look=0,20,0&fov=55')),
    { position: [-20, 100, 40], target: [0, 20, 0], fov: 55 },
  );
  assert.equal(readArtView(new URLSearchParams('fov=64')).fov, 64);
});

test('malformed or degenerate views fail before reaching the camera', () => {
  for (const query of [
    'cam=1,2,3',
    'look=1,2,3',
    'cam=1,,3&look=0,0,0',
    'cam=1,2&look=0,0,0',
    'cam=1,2,Infinity&look=0,0,0',
    'cam=1000001,0,0&look=0,0,0',
    'cam=1,2,3&look=1,2,3',
    'fov=',
    'fov=0',
    'fov=NaN',
    'fov=121',
  ])
    assert.throws(
      () => readArtView(new URLSearchParams(query)),
      /Art view:/,
      query,
    );
});

test('copied views round-trip and replace conflicting runtime entry parameters', () => {
  const view = {
    position: [123.456789, 200, -50],
    target: [0, 30, 80],
    fov: 64,
  };
  const url = new URL(
    artPassURL(
      'https://example.org/game/?level=saffron&review=shape&test=jump&case=short-fall&capture=1&inspect=1&ship=shrike&music=1&foo=bar#scene',
      'vesper-forest',
      view,
    ),
  );
  const params = url.searchParams;
  assert.equal(url.pathname, '/game/');
  assert.equal(params.get('level'), 'vesper-forest');
  assert.equal(params.get('artPass'), '1');
  assert.equal(params.get('music'), '0');
  assert.equal(params.get('foo'), 'bar');
  for (const name of ['review', 'test', 'case', 'capture', 'inspect', 'ship'])
    assert.equal(params.has(name), false);
  assert.deepEqual(readArtView(params), {
    ...view,
    position: [123.4568, 200, -50],
  });
});
