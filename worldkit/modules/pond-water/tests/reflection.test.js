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

test('normal and depth prepasses never overwrite a mirror or advance its beauty cadence', () => {
  const geometry = new PlaneGeometry(),
    water = new Water(geometry),
    scene = new Scene(),
    camera = new PerspectiveCamera();
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  water.updateMatrixWorld();
  const original = {};
  let target = original,
    mirrorWrites = 0,
    beautyRenders = 0;
  const renderer = {
    xr: { enabled: false },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget(value) {
      target = value;
      if (value === water.renderTarget) mirrorWrites++;
    },
    state: { buffers: { depth: { setMask() {} } } },
    render() {
      beautyRenders++;
    },
  };
  try {
    for (const type of ['MeshNormalMaterial', 'MeshDepthMaterial']) {
      scene.overrideMaterial = { type };
      for (let i = 0; i < 12; i++)
        water.onBeforeRender(renderer, scene, camera);
    }
    assert.equal(mirrorWrites, 0);
    assert.equal(beautyRenders, 0);
    assert.equal(water.reflectionFrame, 0);
    scene.overrideMaterial = null;
    water.onBeforeRender(renderer, scene, camera);
    assert.equal(beautyRenders, 1);
    scene.overrideMaterial = { type: 'MeshNormalMaterial' };
    for (let i = 0; i < 7; i++) water.onBeforeRender(renderer, scene, camera);
    assert.equal(
      water.reflectionFrame,
      1,
      'override passes do not alias the refresh cadence',
    );
    scene.overrideMaterial = null;
    camera.position.x = 4;
    camera.updateMatrixWorld();
    water.onBeforeRender(renderer, scene, camera);
    assert.equal(
      water.material.uniforms.eye.value.x,
      4,
      'view-dependent shading updates between mirror refreshes',
    );
    water.onBeforeRender(renderer, scene, camera);
    assert.equal(beautyRenders, 1);
    water.onBeforeRender(renderer, scene, camera);
    assert.equal(beautyRenders, 2);
    assert.equal(mirrorWrites, 2);
    assert.equal(target, original);
  } finally {
    water.dispose();
    geometry.dispose();
  }
});
