import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExhaustHeatPass } from './exhaust-heat-pass.js';

// Exercise pass ownership and visibility without a GPU; the real GLSL/depth
// result is verified in the browser using matched haze-on/off captures.
test('heat pass follows visible nozzle transforms and releases all borrowed ship references', () => {
  const scene = new THREE.Scene();
  const hull = new THREE.Group();
  hull.userData.bounds = { min: [-2, 0, -3.5], max: [2, 1.8, 3.7] };
  hull.position.set(40, 8, 70);
  hull.rotation.set(0.2, 0.7, 1.1);
  scene.add(hull);
  const sources = [-1, 1].map((x) => {
    const source = new THREE.Object3D();
    source.position.set(x, 0.5, -3.4);
    source.scale.set(1.3, 1.3, 5);
    source.userData.exhaustHeat = { pressure: 1, velocity: 0.7, time: 4 };
    hull.add(source);
    return source;
  });
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 20000);
  camera.position.set(38, 9, 55);
  camera.lookAt(hull.position);
  camera.updateMatrixWorld(true);
  const pass = new ExhaustHeatPass(scene, camera);
  pass.setSize(1920, 1080);
  assert.equal(pass.field.width, 960);
  assert.equal(pass.field.height, 540);
  const submissions = [];
  let target;
  const renderer = {
    autoClear: true,
    getClearAlpha: () => 1,
    getClearColor: (color) => color.set(0x123456),
    getPixelRatio: () => 1.25,
    setClearColor() {},
    clear() {},
    setRenderTarget(value) {
      target = value;
    },
    render(world) {
      world.updateMatrixWorld(true);
      world.traverseVisible((object) => {
        if (!object.isMesh) return;
        object.onBeforeRender();
        submissions.push(object.matrixWorld.clone());
      });
    },
  };
  pass.quad.render = () => {};
  const read = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const write = new THREE.WebGLRenderTarget(1, 1);
  pass.render(renderer, write, read);
  assert.equal(submissions.length, 2);
  assert.ok(
    submissions[0].equals(
      sources[0].matrixWorld.clone().multiply(pass.expansion),
    ),
  );
  assert.equal(pass.material.uniforms.sceneDepth.value, read.depthTexture);
  assert.equal(pass.composite.uniforms.sceneDepth.value, read.depthTexture);
  assert.equal(pass.composite.uniforms.protectHull.value, 1);
  assert.equal(target, write);
  assert.equal(renderer.autoClear, true);
  assert.ok(pass.proxies.every((proxy) => proxy.userData.source === null));
  assert.equal(pass.sources.length, 0);

  sources[1].userData.exhaustHeat.enabled = false;
  submissions.length = 0;
  pass.render(renderer, write, read);
  assert.equal(submissions.length, 1);
  hull.removeFromParent();
  submissions.length = 0;
  pass.render(renderer, write, read);
  assert.equal(submissions.length, 0);
  assert.equal(pass.composite.uniforms.protectHull.value, 0);
  assert.ok(pass.proxies.every((proxy) => !proxy.visible));
  pass.dispose();
  assert.equal(pass.fieldScene.children.length, 0);
  assert.equal(pass.proxies.length, 0);
  read.dispose();
  write.dispose();
});
