import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DirectionalLight,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
} from 'three';
import { createStaticSunShadows } from './static-sun-shadows.js';

function fixture() {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const sun = new DirectionalLight();
  const { shadow } = sun;
  const liveCamera = shadow.camera;
  const liveMap = new WebGLRenderTarget(16, 16);
  shadow.map = liveMap;
  shadow.mapSize.setScalar(16);
  Object.assign(liveCamera, { left: -8, right: 8, top: 8, bottom: -8 });
  const scenery = new Object3D();
  scenery.castShadow = true;
  const ship = new Object3D();
  ship.castShadow = true;
  scene.add(sun, sun.target, scenery, ship);

  const passes = [],
    copies = [],
    checks = [],
    captures = [];
  const beauty = new WebGLRenderTarget();
  let target = beauty,
    read = beauty;
  let complete = true;
  let bound;
  const gl = {
    FRAMEBUFFER: 1,
    FRAMEBUFFER_COMPLETE: 2,
    READ_FRAMEBUFFER: 3,
    DEPTH_BUFFER_BIT: 4,
    NEAREST: 5,
    DRAW_FRAMEBUFFER_BINDING: 6,
    checkFramebufferStatus() {
      checks.push(target);
      return complete ? this.FRAMEBUFFER_COMPLETE : 0;
    },
    bindFramebuffer(binding, framebuffer) {
      assert.equal(binding, this.READ_FRAMEBUFFER);
      read = framebuffer;
    },
    getParameter(parameter) {
      assert.equal(parameter, this.DRAW_FRAMEBUFFER_BINDING);
      captures.push(target);
      return target === bound ? null : target;
    },
    blitFramebuffer(...bounds) {
      copies.push({ read, draw: target, bounds });
    },
  };
  function clear() {}
  function render() {
    const previous = target;
    renderer.setRenderTarget(shadow.map);
    renderer.clear();
    assert.equal(read, target);
    passes.push({
      camera: shadow.camera,
      scenery: scenery.castShadow,
      ship: ship.castShadow,
    });
    renderer.setRenderTarget(previous);
    this.needsUpdate = false;
  }
  const renderer = {
    domElement: new EventTarget(),
    capabilities: { maxTextureSize: 128 },
    shadowMap: { enabled: true, type: PCFShadowMap, render },
    getContext: () => gl,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget(next) {
      target = read = next;
    },
    clear,
  };
  const cache = createStaticSunShadows(renderer, scene, sun);
  cache.register(scenery);
  return {
    cache,
    renderer,
    passes,
    copies,
    checks,
    captures,
    liveCamera,
    liveMap,
    rejectCache() {
      complete = false;
    },
    withholdLiveBinding() {
      bound = liveMap;
    },
    resizeLiveMap(size) {
      bound = undefined;
      shadow.mapSize.setScalar(size);
      liveMap.setSize(size, size);
    },
    draw(x = 0) {
      sun.position.set(x, 0, 10);
      sun.target.position.set(x, 0, 0);
      scene.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
      cache.draw(true, () => renderer.shadowMap.render([sun], scene, camera));
      assert.equal(renderer.shadowMap.render, render);
      assert.equal(renderer.clear, clear);
      assert.equal(target, beauty);
      assert.equal(read, beauty);
      assert.equal(scenery.castShadow, true);
      assert.equal(ship.castShadow, true);
    },
  };
}

test('static sun shadows reuse in-bounds depth and keep moving casters in the live pass', () => {
  const { draw, cache, passes, copies, captures, liveCamera, liveMap } =
    fixture();
  draw();
  draw(1);
  draw(2);

  assert.equal(passes.length, 5);
  assert.notEqual(passes[0].camera, liveCamera);
  assert.deepEqual(
    passes.map(({ camera, scenery, ship }) => [
      camera === liveCamera,
      scenery,
      ship,
    ]),
    [
      [false, true, false],
      [true, false, true],
      [true, false, true],
      [false, true, false],
      [true, false, true],
    ],
  );
  assert.deepEqual(captures, [liveMap, copies[0].read]);
  assert.deepEqual(
    copies.map(({ read, draw, bounds }) => [
      read.width,
      draw === liveMap,
      bounds.slice(0, 4),
    ]),
    [
      [20, true, [2, 2, 18, 18]],
      [20, true, [3, 2, 19, 18]],
      [20, true, [2, 2, 18, 18]],
    ],
  );
  assert.deepEqual(cache.metrics, {
    cachedFrames: 3,
    refreshes: 2,
    bytes: 2000,
  });
  cache.dispose();
});

test('missing live bindings fall back and target resize recaptures both bindings', () => {
  const {
    draw,
    cache,
    passes,
    copies,
    captures,
    liveMap,
    withholdLiveBinding,
    resizeLiveMap,
  } = fixture();
  withholdLiveBinding();
  draw();
  draw(1);
  assert.deepEqual(captures, [liveMap]);
  assert.equal(copies.length, 0);
  assert.ok(passes.every(({ scenery, ship }) => scenery && ship));

  resizeLiveMap(24);
  draw(2);
  assert.equal(copies[0].read.width, 30);
  assert.deepEqual(captures, [liveMap, liveMap, copies[0].read]);
  assert.equal(cache.metrics.cachedFrames, 1);
  cache.dispose();
});

test('unsupported framebuffers leave the ordinary sun pass intact and retry after restoration', () => {
  const {
    draw,
    cache,
    renderer,
    passes,
    copies,
    checks,
    rejectCache,
    liveCamera,
  } = fixture();
  rejectCache();
  draw();
  draw(1);
  assert.equal(checks.length, 1);
  renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
  draw(2);
  assert.equal(checks.length, 2);
  assert.equal(copies.length, 0);
  assert.deepEqual(
    passes,
    Array.from({ length: 3 }, () => ({
      camera: liveCamera,
      scenery: true,
      ship: true,
    })),
  );
  assert.deepEqual(cache.metrics, { cachedFrames: 0, refreshes: 0, bytes: 0 });
  cache.dispose();
});
