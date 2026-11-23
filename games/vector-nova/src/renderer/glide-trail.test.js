import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, NormalBlending, Scene, Vector3 } from 'three';
import { createGlideTrail } from './glide-trail.js';

const track = {
  closed: false,
  length: 1200,
  width: 14,
  sample(distance) {
    return {
      position: new Vector3(0, 0, distance),
      right: new Vector3(0.8, 0.6, 0),
      up: new Vector3(-0.6, 0.8, 0),
    };
  },
};

function update(trail, time, distance, lateral = 0, options = {}) {
  const { resetCount = 0, ...effects } = options;
  trail.update({
    active: true,
    grounded: true,
    tail: -3,
    state: { time, distance, lateral, heading: 0, speed: 100, resetCount },
    ...effects,
  });
}

function stripVertices(mesh) {
  const { drawRange, attributes, index } = mesh.geometry;
  const { position, fade, trailSurface } = attributes;
  const vertices = [];
  for (let strip = 0; strip < drawRange.count; strip += 6) {
    for (const corner of [0, 1, 2, 4]) {
      const id = index.getX(strip + corner);
      vertices.push({
        x: position.getX(id),
        y: position.getY(id),
        z: position.getZ(id),
        fade: fade.getX(id),
        across: trailSurface.getX(id),
        phase: trailSurface.getY(id),
        age: trailSurface.getZ(id),
        lattice: trailSurface.getW(id),
      });
    }
  }
  return vertices;
}

function spanAt(points, target) {
  const row = points.filter(({ z }) => Math.abs(z - target) < 1e-4);
  assert.ok(row.length > 1);
  const start = row.reduce((a, b) => (a.x < b.x ? a : b));
  const end = row.reduce((a, b) => (a.x > b.x ? a : b));
  return {
    width: Math.hypot(end.x - start.x, end.y - start.y),
    center: (start.x + end.x) / 2,
    fade: start.fade,
  };
}

test('the film is broad over the banked road and fades within a bounded distance', (t) => {
  const trail = createGlideTrail({ track, surfaceStep: 4 });
  t.after(() => trail.dispose());
  for (let frame = 0; frame <= 30; frame++)
    update(trail, frame / 60, 20 + (frame * 100) / 60, frame / 12, {
      accent: 0x40e3dc,
      hullWidth: 4.6,
    });

  const { mesh } = trail;
  assert.equal(mesh.visible, true);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.forceSinglePass, true);
  assert.equal(mesh.material.blending, NormalBlending);
  assert.deepEqual(mesh.material.uniforms.accent.value, new Color(0x40e3dc));
  const points = stripVertices(mesh);
  assert.ok(points.length > 4);
  assert.ok(points[0].y < points[1].y, 'width follows road bank');
  const front = points[0].z;
  const end = points.at(-1).z;
  assert.ok(Math.abs(front - 68.86) < 1e-4, 'head starts under the hull');
  const head = spanAt(points, front);
  const tail = spanAt(points, end);
  const travelled = Math.hypot(front - end, (head.center - tail.center) / 0.8);
  assert.ok(Math.abs(travelled - 30) < 1e-4, 'history stays bounded to 30 m');
  assert.ok(Math.abs(head.width - 4.6 * 0.6) < 1e-4);
  assert.ok(Math.abs(head.width - tail.width) < 1e-4, 'film fades in place');
  assert.ok(head.center > tail.center, 'older trace stays on the driven path');
  assert.equal(head.fade, 0, 'the leading edge is feathered');
  assert.ok(points.some(({ fade }) => fade > 0.26) && tail.fade < 1e-6);
});

test('the trail reaches 20 m at 80 km/h, 25 m at 100, and 30 m at 120+', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  for (const [kmh, length, visibleDepth] of [
    [80, 20, 15],
    [100, 25, 19],
    [120, 30, 23],
    [240, 30, 23],
  ]) {
    const speed = kmh / 3.6;
    for (let frame = 0; frame <= 140; frame++) {
      const time = frame / 120;
      update(trail, time, 20 + time * speed, 0, { speed });
    }
    const points = stripVertices(trail.mesh);
    const front = points[0].z;
    assert.ok(Math.abs(front - points.at(-1).z - length) < 1e-4);
    assert.ok(
      points.some(({ z, fade }) => z <= front - visibleDepth && fade > 0.01),
    );
    assert.ok(points.at(-1).fade < 1e-6);
  }
});

test('boost increases the fresh mark without resizing or brightening old deposits', (t) => {
  const cruise = createGlideTrail({ track });
  const surge = createGlideTrail({ track });
  t.after(() => {
    cruise.dispose();
    surge.dispose();
  });
  for (const trail of [cruise, surge]) {
    update(trail, 0, 20);
    update(trail, 0.02, 22);
    update(trail, 0.04, 24);
  }
  update(cruise, 0.06, 26);
  update(surge, 0.06, 26, 0, { boost: 1 });
  const normal = stripVertices(cruise.mesh);
  const boosted = stripVertices(surge.mesh);
  assert.deepEqual(
    normal.filter(({ z }) => z < 22.861),
    boosted.filter(({ z }) => z < 22.861),
  );
  const ordinaryHead = spanAt(normal, 24.36);
  const boostedHead = spanAt(boosted, 24.36);
  assert.ok(boostedHead.width > ordinaryHead.width);
  assert.ok(boostedHead.fade > ordinaryHead.fade);
});

test('diamond coordinates stay on the deposited path as trail age advances', (t) => {
  const trail = createGlideTrail({ track, surfaceStep: 4 });
  t.after(() => trail.dispose());
  update(trail, 0, 100);
  update(trail, 0.1, 110, 1);
  update(trail, 0.2, 120, 2);
  const atDeposit = ({ z }) => Math.abs(z - 108.86) < 1e-4;
  const coordinates = ({ x, y, z, across, phase }) => [x, y, z, across, phase];
  const old = stripVertices(trail.mesh).filter(atDeposit);
  assert.ok(old.length > 0);
  assert.ok(
    old.every(({ phase }) => Math.abs(phase - Math.hypot(10, 1)) < 1e-5),
  );
  assert.ok(
    old.some(({ across }) => across < 0) &&
      old.some(({ across }) => across > 0),
  );
  update(trail, 0.3, 130, 3, { boost: 1 });
  const retained = stripVertices(trail.mesh).filter(atDeposit);
  assert.deepEqual(retained.map(coordinates), old.map(coordinates));
  assert.ok(retained[0].age > old[0].age);

  update(trail, 0.85, 185, 4, { grounded: false });
  const airborne = stripVertices(trail.mesh).filter(atDeposit);
  assert.deepEqual(airborne.map(coordinates), old.map(coordinates));
  assert.ok(airborne[0].age > retained[0].age);
});

test('the streak gains lattice detail only on road laid at higher speeds', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  update(trail, 0, 20, 0, { speed: 150 / 3.6 });
  update(trail, 0.05, 22, 0, { speed: 150 / 3.6 });
  const slow = stripVertices(trail.mesh);
  assert.ok(slow.some(({ fade }) => fade > 0.23));
  assert.ok(slow.every(({ lattice }) => lattice === 0));

  update(trail, 0.1, 25, 0, { speed: 250 / 3.6 });
  update(trail, 0.15, 29, 0, { speed: 320 / 3.6 });
  const points = stripVertices(trail.mesh);
  const slowDeposits = points.filter(({ z }) => z <= 20.861);
  assert.ok(slowDeposits.length > 0);
  assert.ok(slowDeposits.every(({ lattice }) => lattice === 0));
  assert.ok(points.some(({ lattice }) => lattice > 0.4 && lattice < 0.7));
  assert.ok(points.some(({ lattice }) => lattice === 1));
});

test('the trace holds when time stops, fades after liftoff, and clears on recovery', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  update(trail, 0, 20);
  update(trail, 0.05, 25);
  assert.equal(trail.mesh.visible, true);
  const original = stripVertices(trail.mesh);
  update(trail, 0.05, 26);
  assert.deepEqual(stripVertices(trail.mesh), original);

  update(trail, 0.52, 72, 0, { grounded: false });
  const fading = stripVertices(trail.mesh);
  assert.equal(fading[0].z, original[0].z);
  assert.ok(
    Math.max(...fading.map(({ fade }) => fade)) <
      Math.max(...original.map(({ fade }) => fade)),
  );
  update(trail, 0.81, 101, 0, { grounded: false });
  assert.equal(trail.mesh.visible, true);
  update(trail, 0.96, 116, 0, { grounded: false });
  assert.equal(trail.mesh.visible, false);
  update(trail, 1, 120);
  update(trail, 1.05, 125);
  assert.equal(trail.mesh.visible, true);
  assert.ok(stripVertices(trail.mesh).every(({ z }) => z >= 118));
  update(trail, 1.06, 300, 0, { resetCount: 1 });
  assert.equal(trail.mesh.visible, false);
  update(trail, 1.1, 304, 0, { resetCount: 1 });
  assert.equal(trail.mesh.visible, true);
  update(trail, 1.11, 800, 0, { resetCount: 1 });
  assert.equal(trail.mesh.visible, false);
});

test('curved road bounds and transverse gaps clip the trace to the supported deck', (t) => {
  const curved = {
    ...track,
    sampleSurface(distance, lateral) {
      return {
        position: new Vector3(lateral, 2 + lateral * lateral * 0.2, distance),
        right: new Vector3(1, lateral * 0.4, 0).normalize(),
        up: new Vector3(-lateral * 0.4, 1, 0).normalize(),
        transverseCurvature: 0.4,
        bounds: { min: -3, max: 3 },
      };
    },
  };
  const trail = createGlideTrail({
    track: curved,
    coverageAt: (distance) => Number(distance < 30 || distance > 34),
  });
  t.after(() => trail.dispose());
  for (let frame = 0; frame <= 17; frame++)
    update(trail, frame / 120, 29 + (frame * 100) / 120, 2.4);
  const points = stripVertices(trail.mesh);
  assert.ok(points.some(({ z }) => z < 30) && points.some(({ z }) => z > 34));
  for (let i = 0; i < points.length; i += 4) {
    const quad = points.slice(i, i + 4);
    assert.ok(quad.every(({ z }) => z < 30) || quad.every(({ z }) => z > 34));
    assert.ok(quad.every(({ x, y }) => x <= 3 && y > 2.3));
  }
  update(trail, 0.22, 52, 4.5);
  update(trail, 0.3, 59, 4.5);
  update(trail, 0.9, 120, 4.5);
  assert.equal(trail.mesh.visible, false);
});

test('an opening along the middle of a wide footprint leaves film on both sides', (t) => {
  const flat = {
    ...track,
    sample(distance) {
      return {
        position: new Vector3(0, 0, distance),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
      };
    },
  };
  const trail = createGlideTrail({
    track: flat,
    coverageAt: (distance, lateral) => Number(Math.abs(lateral) >= 0.45),
  });
  t.after(() => trail.dispose());
  update(trail, 0, 20);
  update(trail, 0.05, 25);
  const points = stripVertices(trail.mesh);
  assert.ok(points.some(({ x }) => x <= -0.45));
  assert.ok(points.some(({ x }) => x >= 0.45));
  for (let i = 0; i < points.length; i += 4) {
    const quad = points.slice(i, i + 4);
    assert.ok(
      quad.every(({ x }) => x <= -0.45) || quad.every(({ x }) => x >= 0.45),
    );
  }
});

test('the inspector matches the broad profile, fading it in place on its plinth', (t) => {
  const trail = createGlideTrail();
  t.after(() => trail.dispose());
  const scene = new Scene();
  const { mesh } = trail;
  scene.add(mesh);
  const frame = {
    active: true,
    speed: 80,
    tail: -3.9,
    boost: 1,
    hullWidth: 4.2,
  };
  trail.preview(frame);
  const points = stripVertices(mesh);
  assert.equal(mesh.visible, true);
  assert.ok(points.every(({ y, z }) => y === 0 && z >= -6.3 - 1e-6));
  const head = spanAt(points, frame.tail * 0.38);
  assert.ok(Math.abs(head.width - 4.2 * 0.65) < 1e-4);
  assert.ok(head.fade === 0 && points.at(-1).fade < 1e-6);
  assert.ok(points.some(({ fade }) => fade > 0.28));
  assert.ok(Math.abs(points.at(-1).z + 6.3) < 1e-6);
  assert.ok(points.every(({ phase, z }) => Math.abs(phase + 2.25 * z) < 1e-5));
  trail.preview({ ...frame, boost: 0 });
  assert.ok(Math.abs(stripVertices(mesh).at(-1).z + 6.3) < 1e-6);
  trail.preview({ ...frame, fadeScale: 0.5 });
  assert.deepEqual(
    stripVertices(mesh),
    points.map(({ fade, ...position }) => ({ ...position, fade: fade * 0.5 })),
  );
  trail.preview({ ...frame, fadeScale: 0 });
  assert.equal(mesh.visible, false);
  trail.preview({ ...frame, reducedMotion: true });
  assert.equal(mesh.visible, false);
  trail.dispose();
  assert.equal(mesh.parent, null);
});
