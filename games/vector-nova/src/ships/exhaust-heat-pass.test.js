import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExhaustHeatPass } from './exhaust-heat-pass.js';
import { createShipHeatEffects } from '../effects/ship-heat.js';

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

test('thermal hull refraction shares the nozzle field and draws first without changing depth/hull guards', () => {
  const scene = new THREE.Scene(),
    hull = new THREE.Group();
  hull.userData.bounds = { min: [-2, 0, -3.5], max: [2, 1.8, 3.7] };
  hull.position.set(40, 8, 70);
  hull.rotation.set(0.2, 0.7, 1.1);
  scene.add(hull);
  const nozzle = new THREE.Object3D();
  nozzle.position.set(1, 0.5, -3.4);
  nozzle.scale.set(1.3, 1.3, 5);
  nozzle.userData.exhaustHeat = { pressure: 1, velocity: 0.7, time: 4 };
  hull.add(nozzle);
  const feedback = { contact: 1, envelope: 1, smoke: 0.96, flame: 0.37 };
  const effects = createShipHeatEffects(() => feedback);
  scene.add(effects.group);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 20000);
  camera.position.set(38, 9, 55);
  camera.lookAt(hull.position);
  camera.updateMatrixWorld(true);
  effects.update({
    ship: { group: hull },
    camera,
    time: 4,
    mode: 'racing',
    settings: { quality: 'high' },
  });
  scene.updateMatrixWorld(true);
  const pass = new ExhaustHeatPass(scene, camera);
  const field = pass.field,
    geometry = pass.geometry,
    submissions = [];
  let fieldDraws = 0,
    composites = 0;
  const renderer = {
    autoClear: true,
    getClearAlpha: () => 1,
    getClearColor: (color) => color.set(0x123456),
    getPixelRatio: () => 1.25,
    setClearColor() {},
    clear() {},
    setRenderTarget() {},
    render(world) {
      fieldDraws++;
      world.updateMatrixWorld(true);
      const meshes = [];
      world.traverseVisible((object) => {
        if (object.isMesh) meshes.push(object);
      });
      for (const mesh of meshes.sort((a, b) => a.renderOrder - b.renderOrder)) {
        mesh.onBeforeRender();
        submissions.push({
          matrix: mesh.matrixWorld.clone(),
          order: mesh.renderOrder,
          kind: pass.material.uniforms.hullHeat.value,
          strength: pass.material.uniforms.thermalStrength.value,
          flow: pass.material.uniforms.flowTime.value,
          pressure: pass.material.uniforms.pressure.value,
          min: pass.material.uniforms.hullMin.value.toArray(),
          max: pass.material.uniforms.hullMax.value.toArray(),
        });
      }
    },
  };
  pass.quad.render = () => composites++;
  const read = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const write = new THREE.WebGLRenderTarget(1, 1);
  pass.render(renderer, write, read);
  assert.equal(fieldDraws, 1);
  assert.equal(
    composites,
    1,
    'one existing field/composite handles both source types',
  );
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].kind, 1);
  assert.equal(submissions[1].kind, 0);
  assert.ok(
    submissions[0].order < submissions[1].order,
    'NoBlending hull heat cannot overwrite the stronger nozzle field',
  );
  assert.ok(submissions[0].matrix.equals(effects.heatSource.matrixWorld));
  assert.ok(
    submissions[1].matrix.equals(
      nozzle.matrixWorld.clone().multiply(pass.expansion),
    ),
  );
  assert.equal(submissions[0].strength, 1);
  assert.equal(submissions[0].flow, 4);
  assert.ok(
    submissions[1].pressure > 1,
    'original boosted nozzle heat remains intact',
  );
  assert.deepEqual(submissions[0].min, submissions[1].min);
  assert.deepEqual(submissions[0].max, submissions[1].max);
  assert.equal(pass.composite.uniforms.protectHull.value, 1);
  assert.ok(
    pass.composite.uniforms.viewToHull.value.equals(
      hull.matrixWorld.clone().invert().multiply(camera.matrixWorld),
    ),
  );
  assert.equal(pass.material.uniforms.sceneDepth.value, read.depthTexture);
  assert.equal(pass.composite.uniforms.sceneDepth.value, read.depthTexture);
  assert.ok(
    pass.proxies.every(
      (proxy) => proxy.geometry === geometry && proxy.userData.source === null,
    ),
  );
  assert.equal(pass.sources.length, 0);
  effects.reset();
  submissions.length = 0;
  pass.render(renderer, write, read);
  assert.equal(submissions.length, 1);
  assert.equal(
    submissions[0].kind,
    0,
    'inactive thermal source adds no field draw',
  );
  assert.equal(pass.field, field);
  assert.equal(pass.geometry, geometry);
  effects.dispose();
  pass.dispose();
  read.dispose();
  write.dispose();
});

test('thermal source follows actual hull bounds and envelope while Low, reduced motion and inactive/reset paths suppress its draw', () => {
  const ship = new THREE.Group(),
    next = new THREE.Group(),
    camera = new THREE.PerspectiveCamera();
  ship.userData.bounds = { min: [-2, 0, -3.5], max: [2, 1.8, 3.7] };
  next.userData.bounds = { min: [-1, -0.1, -5], max: [1, 2, 5] };
  const geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshBasicMaterial();
  ship.add(new THREE.Mesh(geometry, material));
  const feedback = { contact: 1, envelope: 1, smoke: 0.96, flame: 0.37 };
  const effects = createShipHeatEffects(() => feedback),
    source = effects.heatSource;
  const frame = {
    ship: { group: ship },
    camera,
    time: 2,
    mode: 'title',
    settings: { quality: 'high' },
  };
  effects.update(frame);
  assert.equal(source.parent, ship);
  assert.equal(source.isMesh, undefined);
  assert.equal(source.userData.exhaustHeat.enabled, false);
  effects.update({ ...frame, mode: 'racing' });
  const heat = source.userData.exhaustHeat;
  assert.equal(heat.kind, 'thermal');
  assert.equal(heat.enabled, true);
  assert.equal(heat.strength, 1);
  assert.equal(
    ship.getObjectByName('Thermal contact / lava-red hull envelope').children
      .length,
    1,
    'a child heat source does not exclude the hull coat',
  );
  const min = new THREE.Vector3(-0.36, -0.36, -1).applyMatrix4(source.matrix);
  const max = new THREE.Vector3(0.36, 0.36, 0).applyMatrix4(source.matrix);
  assert.ok(
    min.x < ship.userData.bounds.min[0] &&
      min.y < ship.userData.bounds.min[1] &&
      min.z < ship.userData.bounds.min[2],
  );
  assert.ok(
    max.x > ship.userData.bounds.max[0] &&
      max.y > ship.userData.bounds.max[1] &&
      max.z > ship.userData.bounds.max[2],
  );
  feedback.contact = 0;
  feedback.envelope = 0.5;
  effects.update({ ...frame, mode: 'paused' });
  assert.equal(heat.strength, 0.5);
  assert.equal(heat.enabled, true);
  const clock = heat.time,
    transform = source.matrixWorld.clone();
  effects.update({ ...frame, mode: 'paused' });
  assert.equal(heat.time, clock);
  assert.ok(
    source.matrixWorld.equals(transform),
    'pause holds the same refraction wave',
  );
  effects.update({ ...frame, mode: 'racing', settings: { quality: 'low' } });
  assert.equal(heat.enabled, false);
  assert.equal(heat.strength, 0);
  effects.update({
    ...frame,
    mode: 'racing',
    settings: { quality: 'high', reducedMotion: true },
  });
  assert.equal(heat.enabled, false);
  effects.update({ ...frame, mode: 'racing', reviewing: true });
  assert.equal(heat.enabled, false);
  effects.update({ ...frame, ship: { group: next }, mode: 'racing' });
  assert.equal(source.parent, next);
  assert.equal(ship.children.includes(source), false);
  assert.equal(heat.bounds, next.userData.bounds);
  effects.reset();
  assert.equal(heat.enabled, false);
  assert.equal(heat.strength, 0);
  effects.update({ ...frame, ship: null, mode: 'racing' });
  assert.equal(source.parent, null);
  assert.equal(heat.enabled, false);
  effects.dispose();
  effects.dispose();
  assert.equal(source.parent, null);
  geometry.dispose();
  material.dispose();
});
