import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, PlaneGeometry, Scene } from 'three';
import { Water } from '../src/WaterSurface.js';

test('reflection invalidation refreshes immediately and failures restore borrowed renderer state', () => {
  const geometry = new PlaneGeometry(),
    water = new Water(geometry),
    camera = new PerspectiveCamera();
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  water.updateMatrixWorld();
  const original = {},
    scene = new Scene();
  let target = original,
    frames = 0,
    fail = false;
  const renderer = {
    xr: { enabled: true },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (value) => {
      target = value;
    },
    state: { buffers: { depth: { setMask() {} } } },
    render() {
      frames++;
      if (fail) throw new Error('render failed');
    },
  };
  water.onBeforeRender(renderer, scene, camera);
  assert.equal(frames, 1);
  water.onBeforeRender(renderer, scene, camera);
  assert.equal(frames, 1);
  water.invalidateReflection();
  water.onBeforeRender(renderer, scene, camera);
  assert.equal(frames, 2);
  fail = true;
  water.invalidateReflection();
  assert.throws(() => water.onBeforeRender(renderer, scene, camera), /failed/);
  assert.equal(target, original);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(water.visible, true);
  water.dispose();
  geometry.dispose();
  water.invalidateReflection();
  water.onBeforeRender(renderer, scene, camera);
  assert.equal(frames, 3);
});

test('surface hook contract rejects malformed shaders before allocating a render target', () => {
  const geometry = new PlaneGeometry();
  assert.throws(
    () => new Water(geometry, { surface: { declarations: '' } }),
    /GLSL/,
  );
  geometry.dispose();
});
