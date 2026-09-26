import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Group, Scene, Object3D } from 'three';
import { createShipShadow } from '../src/world/ShipShadow.js';

test('ship depth pass restores renderer and scene ownership even if rendering fails', () => {
  for (const fail of [false, true]) {
    const scene = new Scene();
    const root = new Group();
    const before = new Object3D(),
      after = new Object3D();
    scene.add(before, root, after);
    const previousTarget = {};
    const state = {
      target: previousTarget,
      color: new Color('#123456'),
      alpha: 0.6,
    };
    let calls = 0;
    const renderer = {
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
        assert.equal(isolatedScene.children[0], root);
        assert.equal(scene.children.includes(root), false);
        if (fail) throw new Error('depth failure');
      },
    };
    const shadow = createShipShadow(renderer, root, [-130, 100, -90]);
    shadow.attach();
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
  }
});
