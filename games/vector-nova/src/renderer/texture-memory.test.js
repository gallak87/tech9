import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CompressedTexture,
  RGBA_ASTC_4x4_Format,
  RGBAFormat,
  Texture,
} from 'three';
import { textureMemory } from './texture-memory.js';

test('compressed memory uses actual block payloads including tiny mip tails', () => {
  const map = new CompressedTexture(
    [
      { data: new Uint8Array(64), width: 8, height: 8 },
      { data: new Uint8Array(16), width: 4, height: 4 },
      { data: new Uint8Array(16), width: 2, height: 2 },
      { data: new Uint8Array(16), width: 1, height: 1 },
    ],
    8,
    8,
    RGBA_ASTC_4x4_Format,
  );
  assert.deepEqual(textureMemory(map), {
    bytes: 112,
    compressed: true,
    format: 'ASTC 4x4',
  });
});

test('Basis RGBA fallback is not reported as a compressed GPU allocation', () => {
  const map = new CompressedTexture(
    [{ data: new Uint8Array(256), width: 8, height: 8 }],
    8,
    8,
    RGBAFormat,
  );
  assert.deepEqual(textureMemory(map), {
    bytes: 256,
    compressed: false,
    format: 'uncompressed',
  });
  const png = new Texture({ width: 8, height: 8 });
  assert.equal(textureMemory(png).bytes, (256 * 4) / 3);
});
