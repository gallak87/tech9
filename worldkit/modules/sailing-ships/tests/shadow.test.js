import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Color,
  Group,
  Scene,
  Object3D,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
} from 'three';
import { createShipShadow } from '../src/ShipShadow.js';

test('ship depth pass restores renderer and scene ownership even if rendering fails', () => {
  for (const fail of [false, true]) {
    const scene = new Scene();
    const root = new Group();
    const before = new Object3D(),
      after = new Object3D();
    scene.position.set(11, 4, -8);
    scene.rotation.set(0.1, 0.7, -0.2);
    root.position.set(3, 2, 7);
    scene.add(before, root, after);
    scene.updateMatrixWorld(true);
    const world = root.matrixWorld.clone();
    const material = new MeshStandardMaterial();
    const mesh = new Mesh(new BoxGeometry(), material);
    root.add(mesh);
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey;
    const previousTarget = {};
    const state = {
      target: previousTarget,
      color: new Color('#123456'),
      alpha: 0.6,
    };
    let calls = 0;
    const renderer = {
      isWebGLRenderer: true,
      autoClear: true,
      shadowMap: { enabled: true },
      xr: { enabled: true },
      getRenderTarget: () => state.target,
      getActiveCubeFace: () => 2,
      getActiveMipmapLevel: () => 1,
      getClearColor: (color) => color.copy(state.color),
      getClearAlpha: () => state.alpha,
      setRenderTarget: (target) => {
        state.target = target;
      },
      setClearColor: (color, alpha) => {
        state.color.set(color);
        state.alpha = alpha;
      },
      clear() {},
      render(isolatedScene) {
        calls++;
        isolatedScene.updateMatrixWorld(true);
        assert.deepEqual(root.matrixWorld.elements, world.elements);
        assert.equal(isolatedScene.children[0].children[0], root);
        assert.equal(scene.children.includes(root), false);
        if (fail) throw new Error('depth failure');
      },
    };
    const shadow = createShipShadow(renderer, root, [-130, 100, -90]);
    shadow.attach();
    assert.notEqual(material.onBeforeCompile, compile);
    assert.throws(() => shadow.setSunDirection([0, 0, 0]), /Sun direction/);
    shadow.setSunDirection([-1, 2, -1]);
    const render = () => shadow.render({ length: 18, mastHeight: 16 });
    if (fail) assert.throws(render, /depth failure/);
    else render();
    assert.equal(calls, 1);
    assert.deepEqual(scene.children, [before, root, after]);
    assert.equal(root.parent, scene);
    assert.equal(state.target, previousTarget);
    assert.equal(state.color.getHexString(), '123456');
    assert.equal(state.alpha, 0.6);
    assert.equal(renderer.autoClear, true);
    assert.equal(renderer.shadowMap.enabled, true);
    assert.equal(renderer.xr.enabled, true);
    shadow.dispose();
    shadow.dispose();
    render();
    assert.equal(calls, 1);
    assert.equal(material.onBeforeCompile, compile);
    assert.equal(material.customProgramCacheKey, cacheKey);
    assert.equal(material.userData.shipSelfShadow, undefined);
    material.dispose();
    mesh.geometry.dispose();
  }
});
