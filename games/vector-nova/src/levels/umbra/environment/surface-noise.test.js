import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshStandardMaterial, RepeatWrapping, RedFormat } from 'three';
import {
  createUmbraSurfaceNoise,
  leaseUmbraSurfaceNoise,
} from './surface-noise.js';

test('Umbra surface noise is seeded, filtered and bounded to a small periodic volume', () => {
  const a = createUmbraSurfaceNoise(),
    b = createUmbraSurfaceNoise();
  assert.equal(a.image.data.byteLength, 64 ** 3);
  assert.deepEqual(a.image.data, b.image.data);
  assert.equal(a.format, RedFormat);
  assert.equal(a.wrapR, RepeatWrapping);
  assert.equal(a.generateMipmaps, true);
  const mean =
    a.image.data.reduce((sum, value) => sum + value, 0) / a.image.data.length;
  assert.ok(mean > 125 && mean < 130);
  assert.ok(new Set(a.image.data).size > 250);
  a.dispose();
  b.dispose();
});
test('material leases share one volume and release it exactly once after the last owner', () => {
  const a = new MeshStandardMaterial(),
    b = new MeshStandardMaterial();
  const volume = leaseUmbraSurfaceNoise(a);
  assert.equal(leaseUmbraSurfaceNoise(a), volume);
  assert.equal(leaseUmbraSurfaceNoise(b), volume);
  assert.equal(a.umbraNoise, volume);
  let releases = 0;
  volume.addEventListener('dispose', () => releases++);
  a.dispose();
  assert.equal(releases, 0);
  a.dispose();
  assert.equal(releases, 0);
  b.dispose();
  assert.equal(releases, 1);
  const c = new MeshStandardMaterial(),
    next = leaseUmbraSurfaceNoise(c);
  assert.notEqual(next, volume);
  c.dispose();
});
