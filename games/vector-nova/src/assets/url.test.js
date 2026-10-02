import assert from 'node:assert/strict';
import test from 'node:test';
import { assetURL } from './url.js';

test('canonical public assets respect root and deployment subdirectories', () => {
  const path = 'assets/levels/nacre/leviathan/nacre-leviathan-v2.glb';
  assert.equal(assetURL(path, '/'), `/${path}`);
  assert.equal(assetURL(path, '/nova/'), `/nova/${path}`);
  assert.equal(assetURL(`/${path}`, '/nova'), `/nova/${path}`);
});
