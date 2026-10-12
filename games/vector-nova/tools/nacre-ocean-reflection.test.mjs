import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createNacreOceanReflection } from '../src/levels/nacre/environment/ocean-reflection.js';

function fixture(waterY = 12) {
  const mesh = new T.Mesh(
    new T.PlaneGeometry(20, 20),
    new T.ShaderMaterial({ uniforms: {} }),
  );
  const scene = new T.Scene();
  const excluded = new T.Group();
  excluded.userData.nacreReflectionExclude = true;
  const alreadyHidden = excluded.clone();
  alreadyHidden.visible = false;
  scene.add(mesh, excluded, alreadyHidden);
  const source = new T.PerspectiveCamera(65, 1.6, 0.2, 6000);
  source.position.set(40, waterY + 60, 100);
  source.lookAt(0, waterY, -200);
  source.viewport = new T.Vector4(3, 7, 1200, 750);
  source.updateMatrixWorld();
  const previousTarget = new T.WebGLRenderTarget(16, 16);
  const renderer = {
    target: previousTarget,
    xr: { enabled: true },
    shadowMap: { autoUpdate: true },
    autoClear: false,
    captures: [],
    targets: [],
    clears: 0,
    depthMasks: [],
    viewports: [],
    state: {
      buffers: {
        depth: { setMask: (value) => renderer.depthMasks.push(value) },
      },
      viewport: (value) => renderer.viewports.push(value.clone()),
    },
    getRenderTarget() {
      return this.target;
    },
    setRenderTarget(target) {
      this.target = target;
      this.targets.push(target);
    },
    clear() {
      this.clears++;
    },
    render(renderScene, camera) {
      assert.equal(renderScene, scene);
      assert.equal(mesh.visible, false);
      assert.equal(excluded.visible, false);
      assert.equal(alreadyHidden.visible, false);
      assert.equal(this.xr.enabled, false);
      assert.equal(this.shadowMap.autoUpdate, false);
      // A reflective child must not recurse into another capture.
      mesh.onBeforeRender(this, renderScene, camera);
      this.captures.push(camera.clone());
      this.renderHook?.(camera);
    },
  };
  const reflection = createNacreOceanReflection(mesh, waterY);
  return {
    waterY,
    mesh,
    scene,
    source,
    excluded,
    alreadyHidden,
    previousTarget,
    renderer,
    reflection,
    draw: (camera = source) => mesh.onBeforeRender(renderer, scene, camera),
    dispose() {
      reflection.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      previousTarget.dispose();
    },
  };
}

function cameraSnapshot(camera) {
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    up: camera.up.toArray(),
    matrix: camera.matrix.toArray(),
    matrixWorld: camera.matrixWorld.toArray(),
    projectionMatrix: camera.projectionMatrix.toArray(),
    projectionMatrixInverse: camera.projectionMatrixInverse.toArray(),
    matrixAutoUpdate: camera.matrixAutoUpdate,
    matrixWorldAutoUpdate: camera.matrixWorldAutoUpdate,
  };
}

test('Nacre reflection restores visibility, target, viewport, XR and shadows after a failed render', () => {
  const f = fixture();
  try {
    const snapshot = cameraSnapshot(f.source);
    f.renderer.renderHook = () => {
      throw new Error('simulated reflection render failure');
    };
    assert.throws(f.draw, /simulated reflection render failure/);
    assert.equal(f.renderer.target, f.previousTarget);
    assert.equal(f.renderer.xr.enabled, true);
    assert.equal(f.renderer.shadowMap.autoUpdate, true);
    assert.equal(f.mesh.visible, true);
    assert.equal(f.excluded.visible, true);
    assert.equal(f.alreadyHidden.visible, false);
    assert.deepEqual(f.renderer.viewports.at(-1), f.source.viewport);
    assert.deepEqual(cameraSnapshot(f.source), snapshot);
    assert.equal(f.mesh.material.uniforms.reflectionReady.value, 0);
    assert.equal(f.reflection.getPresentation().captures, 0);
    f.renderer.renderHook = null;
    f.draw();
    assert.equal(f.reflection.getPresentation().captures, 1);
    assert.equal(f.mesh.material.uniforms.reflectionReady.value, 1);
    assert.equal(f.renderer.clears, 2);
    assert.deepEqual(f.renderer.depthMasks, [true, true]);
  } finally {
    f.dispose();
  }
});

test('Nacre reflection is throttled between captures and invalidates promptly for camera movement or quality changes', () => {
  const f = fixture();
  try {
    const count = () => f.reflection.getPresentation().captures;
    f.draw();
    assert.equal(count(), 1);
    f.draw();
    f.draw();
    assert.equal(
      count(),
      1,
      'The two frames after capture should reuse the image',
    );
    f.draw();
    assert.equal(count(), 2);
    f.source.position.x += 25;
    f.draw();
    assert.equal(
      count(),
      3,
      'A large translation must capture without waiting',
    );
    f.source.rotateY(0.3);
    f.draw();
    assert.equal(
      count(),
      4,
      'A changed view direction must capture without waiting',
    );
    f.reflection.configure('low');
    assert.equal(f.reflection.getPresentation().enabled, false);
    assert.equal(f.mesh.material.uniforms.reflectionReady.value, 0);
    for (let i = 0; i < 6; i++) f.draw();
    assert.equal(count(), 4);
    f.reflection.configure('high');
    f.draw();
    assert.equal(
      count(),
      5,
      'Re-enabling must replace a possibly stale capture',
    );
    f.source.position.y = f.waterY + 4;
    f.draw();
    assert.equal(count(), 5);
    assert.equal(f.mesh.material.uniforms.reflectionReady.value, 0);
    f.source.position.y = f.waterY - 20;
    f.draw();
    assert.equal(
      count(),
      5,
      'Submerged views must never render a planar capture',
    );
    f.draw(new T.OrthographicCamera(-5, 5, 5, -5, 0.2, 100));
    assert.equal(count(), 5);
  } finally {
    f.dispose();
  }
});

test('Nacre reflection mirrors banked parented cameras without changing their transforms or projection', () => {
  for (const manualMatrices of [false, true]) {
    const f = fixture(37);
    try {
      const parent = new T.Group();
      parent.position.set(-70, 20, 200);
      parent.rotation.set(0.05, 0.7, 0.1);
      parent.add(f.source);
      f.source.rotateZ(0.55);
      parent.updateMatrixWorld(true);
      if (manualMatrices) {
        f.source.matrixAutoUpdate = false;
        f.source.matrixWorldAutoUpdate = false;
      }
      const snapshot = cameraSnapshot(f.source);
      const position = f.source.getWorldPosition(new T.Vector3());
      const direction = f.source.getWorldDirection(new T.Vector3());
      f.draw();
      assert.equal(f.reflection.getPresentation().captures, 1);
      const reflected = f.renderer.captures.at(-1);
      const expectedPosition = position.clone();
      expectedPosition.y = 2 * f.waterY - position.y;
      const expectedDirection = direction.clone();
      expectedDirection.y *= -1;
      assert.ok(
        reflected
          .getWorldPosition(new T.Vector3())
          .distanceTo(expectedPosition) < 1e-7,
        `Reflected world position, manual matrices: ${manualMatrices}`,
      );
      assert.ok(
        reflected
          .getWorldDirection(new T.Vector3())
          .distanceTo(expectedDirection) < 1e-7,
        `Reflected world direction, manual matrices: ${manualMatrices}`,
      );
      for (const matrix of [
        reflected.matrixWorld,
        reflected.matrixWorldInverse,
        reflected.projectionMatrix,
        reflected.projectionMatrixInverse,
        f.mesh.material.uniforms.reflectionMatrix.value,
      ])
        assert.ok(matrix.elements.every(Number.isFinite));
      const product = reflected.projectionMatrix
        .clone()
        .multiply(reflected.projectionMatrixInverse);
      const identity = new T.Matrix4();
      for (let i = 0; i < 16; i++)
        assert.ok(Math.abs(product.elements[i] - identity.elements[i]) < 1e-7);
      assert.deepEqual(cameraSnapshot(f.source), snapshot);
    } finally {
      f.dispose();
    }
  }
});

test('Nacre reflection owns one bounded render target and releases it once', () => {
  const f = fixture();
  try {
    f.draw();
    const target = f.renderer.targets.find(
      (value) => value !== f.previousTarget,
    );
    assert.equal(target.width, 512);
    assert.equal(target.height, 512);
    assert.equal(target.texture.type, T.HalfFloatType);
    assert.equal(
      f.mesh.material.uniforms.sceneReflection.value,
      target.texture,
    );
    let disposals = 0;
    target.addEventListener('dispose', () => disposals++);
    f.reflection.dispose();
    f.reflection.dispose();
    f.reflection.configure('high');
    f.draw();
    assert.equal(disposals, 1);
    assert.equal(f.mesh.material.uniforms.reflectionReady.value, 0);
    assert.equal(f.reflection.getPresentation().captures, 1);
  } finally {
    f.dispose();
  }
});
