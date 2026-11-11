import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperSapEffects, withVesperSapEffects } from './sap-effects.js';

function fixture() {
  const geometry = new T.BoxGeometry(4, 2, 7);
  const material = new T.MeshStandardMaterial();
  const ship = { group: new T.Group() };
  ship.group.add(new T.Mesh(geometry, material));
  ship.group.position.set(250, 32, -180);
  ship.group.rotation.set(0.1, 0.6, -0.2);
  ship.group.userData.bounds = { min: [-2, -0.2, -3.5], max: [2, 1.8, 3.5] };
  const track = {
    sample(distance) {
      return {
        position: new T.Vector3(241.5, 30, distance - 210),
        up: new T.Vector3(0, 1, 0),
        right: new T.Vector3(1, 0, 0),
        tangent: new T.Vector3(0, 0, 1),
      };
    },
  };
  return {
    track,
    frame: {
      ship,
      mode: 'racing',
      time: 2.7,
      state: { speed: 90, distance: 30, lateral: 8.5 },
      motion: { motion: { mode: 'magnetic', surface: { id: 'sap' } } },
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

test('dark sap hangs down to its road-following collecting pool, freezes paused and remains legible on Low/reduced motion', () => {
  const f = fixture();
  const effect = createVesperSapEffects({ track: f.track });
  effect.update(f.frame);
  assert.equal(effect.group.visible, true);
  const pool = effect.group.getObjectByName(
    'Vesper sap / road-following collecting puddle',
  );
  const strands = effect.group.getObjectByName(
    'Vesper sap / attached downward rivulets',
  );
  const droplets = effect.group.getObjectByName(
    'Vesper sap / pendant falling drips',
  );
  const film = f.frame.ship.group.getObjectByName(
    'Vesper sap / lower hull wet resin',
  );
  assert.equal(film.visible, true);
  assert.equal(
    f.frame.ship.group.children[0].material.color.getHex(),
    0xffffff,
    'borrowed hull finish is unchanged',
  );
  assert.equal(strands.count, 12);
  assert.equal(droplets.count, 12);
  const matrices = Array.from(droplets.instanceMatrix.array);
  assert.ok(matrices.every(Number.isFinite));
  const matrix = new T.Matrix4(),
    size = new T.Vector3(),
    rotation = new T.Quaternion(),
    point = new T.Vector3();
  for (let i = 0; i < strands.count; i++) {
    strands.getMatrixAt(i, matrix);
    matrix.decompose(point, rotation, size);
    assert.ok(
      new T.Vector3(0, 1, 0)
        .applyQuaternion(rotation)
        .dot(new T.Vector3(0, 1, 0)) > 0.999999,
      'pendant strands follow world gravity instead of outward ship spray',
    );
    assert.ok(size.y > size.x * 0.2, 'a cohesive vertical rivulet, not a bead');
  }
  const p = pool.geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    assert.ok(
      p.getY(i) > 30.074 && p.getY(i) < 30.131,
      'thin resin volume stays above the actual road plane',
    );
  const poolBounds = new T.Box3().setFromBufferAttribute(p);
  assert.ok(
    poolBounds.max.x - poolBounds.min.x <= 5.51 &&
      poolBounds.max.z - poolBounds.min.z <= 8.13,
    'larger pool remains bounded to a modest hull-sized footprint',
  );
  assert.equal(
    film.children[0].geometry,
    f.frame.ship.group.children[0].geometry,
    'wet film borrows hull geometry',
  );
  assert.ok(
    film.children[0].material.emissiveIntensity > 0 &&
      film.children[0].material.emissiveIntensity < 0.25,
    'wet lower hull has only a faint warm resin glow',
  );
  const phaseAttributes = () =>
    ['sapBend', 'sapReach', 'sapPinch'].map((name) =>
      Array.from(strands.geometry.attributes[name].array),
    );
  const initialPhase = phaseAttributes();
  effect.update({ ...f.frame, mode: 'paused' });
  assert.deepEqual(Array.from(droplets.instanceMatrix.array), matrices);
  assert.deepEqual(
    phaseAttributes(),
    initialPhase,
    'pause freezes stretch/curve/pinch as well as tears',
  );
  const phases = [];
  for (const time of [0.2, 0.7, 1.1]) {
    effect.update({ ...f.frame, time });
    phases.push(phaseAttributes());
  }
  assert.notDeepEqual(
    phases[0],
    phases[1],
    'resin visibly stretches with simulation time',
  );
  assert.notDeepEqual(
    phases[1],
    phases[2],
    'stretch reaches a distinct thin/release phase',
  );
  effect.update({ ...f.frame, settings: { quality: 'low' } });
  assert.equal(strands.count, 6);
  assert.equal(droplets.count, 6);
  assert.equal(effect.group.visible, true);
  effect.update({ ...f.frame, settings: { reducedMotion: true } });
  const frozen = Array.from(droplets.instanceMatrix.array);
  const frozenPhase = phaseAttributes();
  effect.update({ ...f.frame, time: 18, settings: { reducedMotion: true } });
  assert.deepEqual(Array.from(droplets.instanceMatrix.array), frozen);
  assert.deepEqual(
    phaseAttributes(),
    frozenPhase,
    'reduced motion retains a static viscous silhouette',
  );
  assert.equal(
    pool.visible,
    true,
    'reduced motion retains static collected sap',
  );
  for (const change of [
    { motion: { mode: 'magnetic', surface: { id: 'resin' } } },
    { motion: { mode: 'flight', surface: { id: 'sap' } } },
    { mode: 'inspection' },
    { reviewing: true },
  ]) {
    effect.update({ ...f.frame, ...change });
    assert.equal(effect.group.visible, false);
    assert.equal(film.visible, false);
  }
  effect.update(f.frame);
  effect.reset();
  assert.equal(effect.group.visible, false);
  assert.equal(film.visible, false);
  effect.dispose();
  f.dispose();
});

test('collecting pool follows changing road grade and bank without changing native state', () => {
  const f = fixture();
  const angle = 0.18;
  f.track.sample = (distance) => ({
    position: new T.Vector3(241.5, 30 + distance * 0.06, distance - 210),
    up: new T.Vector3(Math.sin(angle), Math.cos(angle), 0),
    right: new T.Vector3(Math.cos(angle), -Math.sin(angle), 0),
    tangent: new T.Vector3(0, 0, 1),
  });
  const original = structuredClone(f.frame.state);
  const effect = createVesperSapEffects({ track: f.track });
  effect.update(f.frame);
  const pool = effect.group.children[0];
  const p = pool.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const along = (pool.geometry.attributes.uv.getY(i) - 0.5) * 7 * 1.16;
    const frame = f.track.sample(30 + along);
    const delta = new T.Vector3().fromBufferAttribute(p, i).sub(frame.position);
    assert.ok(
      delta.dot(frame.up) > 0.074 && delta.dot(frame.up) < 0.131,
      'every pool row and meniscus follows the local road',
    );
  }
  assert.deepEqual(f.frame.state, original);
  effect.update({ ...f.frame, state: { ...f.frame.state, lateral: 13 } });
  for (let i = 0; i < p.count; i++) {
    const along = (pool.geometry.attributes.uv.getY(i) - 0.5) * 7 * 1.16;
    const frame = f.track.sample(30 + along);
    const delta = new T.Vector3().fromBufferAttribute(p, i).sub(frame.position);
    assert.ok(
      Math.abs(delta.dot(frame.right)) < 13.841,
      'collecting resin remains within the authored deck near curbs',
    );
  }
  effect.dispose();
  f.dispose();
});

test('sap wrapper releases every owned effect once before environment disposal and preserves borrowed hull geometry', () => {
  const group = new T.Group();
  let released = 0;
  const f = fixture();
  const wrapped = withVesperSapEffects(
    {
      group,
      dispose() {
        assert.equal(group.children.length, 0);
        released++;
      },
    },
    { track: f.track },
  );
  let hullReleased = 0;
  f.frame.ship.group.children[0].geometry.addEventListener(
    'dispose',
    () => hullReleased++,
  );
  wrapped.update(f.frame);
  const resources = new Set();
  group.traverse((node) => {
    if (node.isInstancedMesh) resources.add(node);
    if (node.geometry) resources.add(node.geometry);
    if (node.material) resources.add(node.material);
  });
  const film = f.frame.ship.group.getObjectByName(
    'Vesper sap / lower hull wet resin',
  );
  resources.add(film.children[0].material);
  const counts = new Map([...resources].map((r) => [r, 0]));
  for (const r of resources)
    r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  wrapped.dispose();
  wrapped.dispose();
  assert.equal(released, 1);
  assert.equal(hullReleased, 0);
  assert.equal(film.parent, null);
  for (const n of counts.values()) assert.equal(n, 1);
  f.dispose();
});
