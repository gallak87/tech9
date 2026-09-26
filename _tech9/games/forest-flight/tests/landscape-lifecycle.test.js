import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLandscape } from '../src/flight/Landscape.js';

test('landscape load failures release allocations and restore atlas renderer state', async () => {
  let counter = { created: 0, disposed: 0, targets: 0 };
  const kit = () => {
    const group = new THREE.Group();
    for (const name of [
      'pine_a',
      'pine_b',
      'pine_c',
      'pine_sapling',
      'rock_a',
      'rock_b',
      'fallen_log',
      'grass_short',
      'grass_tall',
      'fern_a',
      'fern_b',
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      );
      mesh.name = name;
      for (const resource of [mesh.geometry, mesh.material]) {
        const clone = resource.clone.bind(resource);
        resource.clone = () => {
          const copy = clone();
          counter.created++;
          copy.addEventListener('dispose', () => counter.disposed++);
          return copy;
        };
      }
      group.add(mesh);
    }
    return group;
  };
  const load = THREE.TextureLoader.prototype.loadAsync;
  const dispose = THREE.WebGLRenderTarget.prototype.dispose;
  const doc = globalThis.document;
  const texture = () => {
    const t = new THREE.Texture();
    counter.created++;
    t.addEventListener('dispose', () => counter.disposed++);
    return t;
  };
  try {
    THREE.TextureLoader.prototype.loadAsync = async () => texture();
    THREE.WebGLRenderTarget.prototype.dispose = function () {
      counter.targets++;
      dispose.call(this);
    };
    globalThis.document = {
      createElement: () => ({
        getContext: () => ({
          fillRect() {},
          drawImage() {},
          createRadialGradient: () => ({ addColorStop() {} }),
        }),
      }),
    };
    const original = {
      target: { name: 'original' },
      color: new THREE.Color('#123456'),
      alpha: 0.7,
      viewport: new THREE.Vector4(10, 20, 30, 40),
      scissor: new THREE.Vector4(5, 6, 7, 8),
      scissorTest: false,
    };
    const state = {
      ...original,
      color: original.color.clone(),
      viewport: original.viewport.clone(),
      scissor: original.scissor.clone(),
    };
    const renderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
      shadowMap: {},
      getRenderTarget: () => state.target,
      getClearColor: (v) => v.copy(state.color),
      getClearAlpha: () => state.alpha,
      getViewport: (v) => v.copy(state.viewport),
      getScissor: (v) => v.copy(state.scissor),
      getScissorTest: () => state.scissorTest,
      setRenderTarget: (t) => {
        state.target = t;
      },
      setClearColor: (c, a) => {
        state.color.set(c);
        state.alpha = a;
      },
      setScissorTest: (v) => {
        state.scissorTest = v;
      },
      clear() {},
      setViewport(...v) {
        if (v.length === 1) state.viewport.copy(v[0]);
        else state.viewport.set(...v);
      },
      setScissor(...v) {
        if (v.length === 1) state.scissor.copy(v[0]);
        else state.scissor.set(...v);
      },
      render() {
        assert.equal(state.target.scissorTest, true);
        assert.ok(state.target.viewport.equals(state.viewport));
        assert.ok(state.target.scissor.equals(state.scissor));
        throw new Error('injected bake failure');
      },
    };
    await assert.rejects(
      createLandscape({ renderer }, kit()),
      /injected bake failure/,
    );
    assert.equal(counter.created, counter.disposed);
    assert.equal(counter.targets, 1);
    assert.deepEqual(state, original);
    counter = { created: 0, disposed: 0, targets: 0 };
    THREE.TextureLoader.prototype.loadAsync = async (url) => {
      if (url.includes('normal')) throw new Error('injected HTTP failure');
      await new Promise((resolve) =>
        setTimeout(resolve, url.includes('path') ? 20 : 5),
      );
      return texture();
    };
    await assert.rejects(
      createLandscape({ renderer }, kit()),
      /injected HTTP failure/,
    );
    assert.equal(
      counter.created,
      counter.disposed,
      'late successful texture loads also release',
    );
  } finally {
    THREE.TextureLoader.prototype.loadAsync = load;
    THREE.WebGLRenderTarget.prototype.dispose = dispose;
    if (doc === undefined) delete globalThis.document;
    else globalThis.document = doc;
  }
});
