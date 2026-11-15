import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { createNightweirBasinMaterial } from './basin-material.js';

test('extracted basin finish preserves the approved campaign shader and borrowed uniforms exactly', () => {
  const clock = { value: 12 },
    ripple = new T.Texture();
  let disposed = 0;
  ripple.addEventListener('dispose', () => disposed++);
  const material = createNightweirBasinMaterial(clock, ripple);
  const shader = {
    uniforms: {},
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  // Captured from createNightweirWater before this extraction, using the same
  // standard shader. A finish drift requires an intentional campaign review.
  assert.equal(
    hash(shader.vertexShader),
    '0173ceb47ec0de1dc6cc5a7a62a4569e38c130b84aaa91adaa20bfbae2fe627f',
  );
  assert.equal(
    hash(shader.fragmentShader),
    '0484f050cadcc3b208f600eabd08f42f616e79c26ee7398e48610e9531ba7f22',
  );
  assert.equal(material.customProgramCacheKey(), 'nightweir-nacre-basin-v2');
  assert.equal(material.name, 'Nightweir / sheltered flowing basin');
  assert.equal(material.color.getHexString(), '29484b');
  assert.equal(material.roughness, 0.22);
  assert.equal(material.metalness, 0.12);
  assert.equal(shader.uniforms.waterTime, clock);
  assert.equal(shader.uniforms.basinRipples.value, ripple);
  clock.value = 30;
  assert.equal(shader.uniforms.waterTime.value, 30);
  material.dispose();
  assert.equal(
    disposed,
    0,
    'the finish borrows its caller-owned ripple texture',
  );
  ripple.dispose();
});
