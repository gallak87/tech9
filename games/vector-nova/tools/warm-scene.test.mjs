import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { drawUnculledScene } from '../src/renderer/warm-scene.js';

for (const fails of [false, true]) {
  test(`warmup reveals off-camera and hidden meshes without adding lights; restores state on ${fails ? 'failure' : 'success'}`, () => {
    const scene = new T.Scene();
    const hidden = new T.Group();
    hidden.visible = false;
    const effect = new T.Mesh();
    effect.visible = false;
    const hiddenLight = new T.PointLight();
    hidden.add(effect, hiddenLight);
    const offCamera = new T.Mesh();
    offCamera.position.set(100000, 0, 0);
    const visibleLight = new T.DirectionalLight();
    const disabledLight = new T.PointLight();
    disabledLight.visible = false;
    disabledLight.frustumCulled = false;
    scene.add(hidden, offCamera, visibleLight, disabledLight);
    const before = [];
    scene.traverse((object) =>
      before.push([object, object.visible, object.frustumCulled]),
    );
    const error = new Error('GPU draw failed');
    let draws = 0;
    const warm = () =>
      drawUnculledScene(scene, () => {
        draws++;
        const visible = [];
        scene.traverseVisible((object) => visible.push(object));
        assert.ok(visible.includes(effect));
        assert.ok(visible.includes(offCamera));
        assert.deepEqual(
          visible.filter((object) => object.isLight),
          [visibleLight],
        );
        assert.equal(effect.frustumCulled, false);
        assert.equal(offCamera.frustumCulled, false);
        if (fails) throw error;
        return 'submitted';
      });
    if (fails) assert.throws(warm, (failure) => failure === error);
    else assert.equal(warm(), 'submitted');
    assert.equal(draws, 1);
    for (const [object, visible, frustumCulled] of before) {
      assert.equal(object.visible, visible);
      assert.equal(object.frustumCulled, frustumCulled);
    }
    effect.geometry.dispose();
    effect.material.dispose();
    offCamera.geometry.dispose();
    offCamera.material.dispose();
  });
}
