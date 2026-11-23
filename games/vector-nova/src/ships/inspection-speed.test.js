import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import {
  createInspectionSpeedPreview,
  INSPECTION_DRIVING_SPEED,
} from './inspection-speed.js';

function harness(t) {
  const floor = new Mesh(
    new CylinderGeometry(7, 7, 0.4, 8),
    new MeshStandardMaterial(),
  );
  floor.position.y = -0.7;
  const scene = new Scene();
  scene.add(floor);
  const preview = createInspectionSpeedPreview({ floor, scene });
  const ship = new Group();
  ship.userData.bounds = { min: [-2, 0, -3.6], max: [2, 1.3, 3.6] };
  scene.add(ship);
  preview.attach(ship);
  const trail = scene.getObjectByName('Inspector / road glide trail');
  t.after(() => {
    preview.dispose();
    floor.material.dispose();
    floor.geometry.dispose();
  });
  const heading = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 3,
  );
  let time = 0;
  function update({ dt = 0.05, ...overrides } = {}) {
    time += dt;
    preview.update({
      active: true,
      driving: true,
      boost: false,
      time,
      dt,
      heading,
      accent: 0x40e3dc,
      settings: { quality: 'high' },
      ...overrides,
    });
  }
  return { preview, update, heading, floor, ship, trail };
}

function drawnWidth({ index, attributes, drawRange }) {
  const x = Array.from(index.array.subarray(0, drawRange.count), (vertex) =>
    attributes.position.getX(vertex),
  );
  return Math.max(...x) - Math.min(...x);
}

function visiblePulses(trail) {
  return trail.material.uniforms.boostPulses.value.filter(
    ({ z: strength }) => strength > 0,
  ).length;
}

test('Driving previews early blur with one wide floor imprint', (t) => {
  const { preview, update, heading, floor, ship, trail } = harness(t);
  update({ driving: false });
  assert.deepEqual(preview.getSnapshot(), {
    speed: 0,
    blur: 0,
    trail: false,
  });
  update();
  const early = preview.getSnapshot();
  assert.ok(early.speed * 3.6 > 80 && early.speed * 3.6 < 150);
  assert.ok(early.blur > 0);
  assert.equal(ship.children.length, 0);
  for (let i = 0; i < 20; ++i) update();
  assert.ok(trail.visible);
  assert.ok(Math.abs(trail.position.y - (floor.position.y + 0.225)) < 1e-12);
  assert.ok(trail.quaternion.angleTo(heading) < 1e-7);
  const width = drawnWidth(trail.geometry);
  assert.ok(width > 2, 'the impression spans most of the hull width');
  ship.userData.bounds = { min: [-1.1, 0, -3.3], max: [1.1, 1.2, 3.3] };
  update();
  assert.ok(drawnWidth(trail.geometry) < width);
});

test('Boost, graphics quality and inactive auditions update the same effects', (t) => {
  const { preview, update } = harness(t);
  for (let i = 0; i < 30; ++i) update();
  const cruise = preview.getSnapshot();
  assert.ok(cruise.speed > INSPECTION_DRIVING_SPEED * 0.99);
  for (let i = 0; i < 6; ++i) update({ boost: true });
  assert.ok(preview.getSnapshot().blur > cruise.blur);
  update({ boost: true, settings: { quality: 'low' } });
  assert.equal(preview.getSnapshot().blur, 0);
  assert.ok(preview.getSnapshot().trail);
  for (const overrides of [
    { settings: { quality: 'high', reducedMotion: true } },
    { active: false },
  ]) {
    update({ boost: true, ...overrides });
    assert.deepEqual(preview.getSnapshot(), {
      speed: 0,
      blur: 0,
      trail: false,
    });
  }
  for (let i = 0; i < 10; ++i) update({ driving: false, boost: true });
  assert.ok(
    preview.getSnapshot().blur > 0 && preview.getSnapshot().trail,
    'Boost can audition by itself',
  );
  for (let i = 0; i < 20; ++i) update({ driving: false });
  assert.ok(!preview.getSnapshot().trail);
  assert.equal(preview.getSnapshot().blur, 0);
});

test('The last impression fades without moving if the hull rotates after release', (t) => {
  const { update, trail, heading } = harness(t);
  for (let i = 0; i < 20; ++i) update({ boost: true });
  const { position, fade } = trail.geometry.attributes;
  const footprint = position.array.slice();
  const opacity = Math.max(...fade.array);
  const turned = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
  update({ driving: false, heading: turned });
  assert.ok(trail.visible);
  assert.ok(trail.quaternion.angleTo(heading) < 1e-7);
  assert.deepEqual(position.array, footprint);
  assert.ok(Math.max(...fade.array) < opacity);
  for (let i = 0; i < 6; ++i) update({ driving: false, heading: turned });
  assert.ok(!trail.visible);
});

test('Each Boost press previews one short diamond over the smooth wake', (t) => {
  const { update, trail } = harness(t);
  for (let i = 0; i < 20; ++i) update();
  assert.ok(trail.visible);
  assert.equal(visiblePulses(trail), 0);

  for (let i = 0; i < 3; ++i) update({ boost: true });
  assert.equal(visiblePulses(trail), 1);
  for (let i = 0; i < 20; ++i) update({ boost: true });
  assert.ok(trail.visible);
  assert.equal(visiblePulses(trail), 0);

  for (let i = 0; i < 20; ++i) update({ driving: false });
  assert.ok(!trail.visible);
  const fromRest = { driving: false, boost: true, dt: 1 / 60 };
  update(fromRest);
  assert.ok(!trail.visible);
  for (let i = 0; i < 6; ++i) update(fromRest);
  assert.ok(trail.visible);
  assert.equal(visiblePulses(trail), 1);
});

test('Restoring the preview with Boost held does not trigger a diamond', (t) => {
  const { update, trail } = harness(t);
  for (const suppressed of [
    { active: false },
    { settings: { quality: 'high', reducedMotion: true } },
  ]) {
    update();
    for (let i = 0; i < 3; ++i) update({ boost: true });
    assert.equal(visiblePulses(trail), 1);
    update({ boost: true, ...suppressed });
    assert.ok(!trail.visible);
    assert.equal(visiblePulses(trail), 0);
    for (let i = 0; i < 3; ++i) update({ boost: true });
    assert.ok(trail.visible);
    assert.equal(visiblePulses(trail), 0);
  }
});
