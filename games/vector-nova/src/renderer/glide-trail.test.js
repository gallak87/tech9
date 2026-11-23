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
        halfWidth: trailSurface.getW(id),
      });
    }
  }
  return vertices;
}

function activePulses(trail) {
  return trail.mesh.material.uniforms.boostPulses.value.filter(
    ({ z }) => z > 0,
  );
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
  const leadingFade = mesh.material.uniforms.leadingFade.value;
  assert.ok(Math.abs(leadingFade.x - points[0].phase) < 1e-5);
  assert.equal(leadingFade.y, 0.9, 'the shader feathers the first 0.9 m');
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

test('a boost stamps one stationary diamond on fresh road and holding does not repeat', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  function frame(time, boosting) {
    update(trail, time, 20 + time * 100, 0, { boost: 1, boosting });
  }
  frame(0, false);
  frame(0.06, false);
  assert.ok(stripVertices(trail.mesh).some(({ fade }) => fade > 0.26));
  assert.equal(
    activePulses(trail).length,
    0,
    'speed and pressure cannot trigger a stamp',
  );

  frame(0.1, true);
  const edge = trail.mesh.material.uniforms.leadingFade.value.x;
  assert.equal(activePulses(trail).length, 0, 'the beginning is feathered');
  frame(0.17, true);
  const [pulse] = activePulses(trail);
  assert.equal(activePulses(trail).length, 1);
  assert.deepEqual(pulse.toArray(), [edge, 1 / 5.5, 1]);
  assert.ok(stripVertices(trail.mesh)[0].phase > edge + 5.5);
  frame(0.23, false);
  assert.equal(pulse.x, edge);
  assert.ok(pulse.z > 0 && pulse.z < 1);

  frame(0.24, true);
  frame(0.28, true);
  const [older, newer] = activePulses(trail);
  assert.equal(activePulses(trail).length, 2);
  assert.equal(older.x, edge);
  assert.ok(newer.x > older.x + 5.5);
  frame(0.51, true);
  frame(0.8, true);
  assert.equal(activePulses(trail).length, 0);
  assert.equal(trail.mesh.visible, true, 'the glow stays visible');
});

test('reset, teleport and reduced motion clear pulses without retriggering held boost', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  update(trail, 0, 100);
  update(trail, 0.05, 105, 0, { boosting: true });
  update(trail, 0.1, 110, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 1);
  update(trail, 0.11, 800, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 0);
  update(trail, 0.15, 804, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 0);

  update(trail, 0.2, 809, 0, { boosting: false });
  update(trail, 0.25, 814, 0, { boosting: true });
  update(trail, 0.3, 819, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 1);
  update(trail, 0.32, 821, 0, { boosting: true, reducedMotion: true });
  assert.equal(activePulses(trail).length, 0);
  update(trail, 0.36, 825, 0, { boosting: true });
  update(trail, 0.41, 830, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 0);

  update(trail, 0.46, 835, 0, { boosting: false });
  update(trail, 0.51, 840, 0, { boosting: true });
  update(trail, 0.56, 845, 0, { boosting: true });
  assert.equal(activePulses(trail).length, 1);
  update(trail, 0.57, 100, 0, { boosting: true, resetCount: 1 });
  assert.equal(activePulses(trail).length, 0);
});

test('a slow grounded boost waits for fresh deposits while an airborne onset does not', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  update(trail, 0, 100, 0, { speed: 16 });
  update(trail, 0.05, 101, 0, { speed: 18, boosting: true });
  assert.equal(trail.mesh.visible, false);
  update(trail, 0.1, 102, 0, { speed: 22, boosting: true });
  const freshPhase = trail.mesh.material.uniforms.leadingFade.value.x;
  update(trail, 0.15, 104, 0, { speed: 26, boosting: true });
  const [pulse] = activePulses(trail);
  assert.equal(pulse.x, freshPhase);
  update(trail, 0.4, 115, 0, { speed: 42 });
  assert.equal(activePulses(trail).length, 0);
  update(trail, 0.44, 117, 0, {
    speed: 42,
    grounded: false,
    boosting: true,
  });
  update(trail, 0.49, 120, 0, { speed: 42, boosting: true });
  update(trail, 0.54, 124, 0, { speed: 42, boosting: true });
  assert.equal(activePulses(trail).length, 0);
});

test('the wake head advances on display frames between physics ticks', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  const speed = 500 / 3.6;
  const step = 1 / 240;
  update(trail, 0, 20, 0, { time: 0, speed });
  update(trail, 2 * step, 20 + 2 * step * speed, 0, {
    time: 2 * step,
    speed,
  });
  const before = stripVertices(trail.mesh);
  const phaseBefore = trail.mesh.material.uniforms.leadingFade.value.x;
  update(trail, 2 * step, 20 + 3 * step * speed, 0, {
    time: 3 * step,
    speed,
  });
  const next = stripVertices(trail.mesh);
  assert.ok(Math.abs(next[0].z - before[0].z - step * speed) < 1e-5);
  assert.ok(
    Math.abs(
      trail.mesh.material.uniforms.leadingFade.value.x -
        phaseBefore -
        step * speed,
    ) < 1e-5,
  );

  update(trail, 2 * step, 24, 0, { time: 3.5 * step, paused: true, speed });
  assert.deepEqual(stripVertices(trail.mesh), next);
  update(trail, 2 * step, 22, 0, { time: 2.5 * step, speed });
  assert.deepEqual(
    stripVertices(trail.mesh),
    next,
    'resume cannot rewind the wake',
  );
  update(trail, 4 * step, 20 + 4 * step * speed, 0, {
    time: 4 * step,
    speed,
  });
  assert.ok(stripVertices(trail.mesh)[0].z > next[0].z);
  update(trail, 0, 20, 0, { time: 0, speed });
  assert.equal(
    trail.mesh.visible,
    false,
    'a real simulation rewind clears the path',
  );
});

test('sub-tick display updates preserve the full low-speed history', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  const speed = 100 / 3.6;
  for (let frame = 0; frame <= 240; frame++) {
    const time = frame / 240;
    update(trail, Math.floor(frame / 2) / 120, 20 + speed * time, 0, {
      time,
      speed,
    });
  }
  const points = stripVertices(trail.mesh);
  assert.ok(Math.abs(points[0].z - points.at(-1).z - 25) < 1e-5);
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
  const leadingFade = mesh.material.uniforms.leadingFade.value;
  assert.ok(Math.abs(leadingFade.x - points[0].phase) < 1e-5);
  assert.equal(leadingFade.y, 0.9 * 2.25);
  assert.ok(points.at(-1).fade < 1e-6);
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

test('the inspector previews one pulse per engagement with the same fade and no surprise on reactivation', (t) => {
  const trail = createGlideTrail();
  t.after(() => trail.dispose());
  const frame = { active: true, speed: 80, tail: -3.9, boost: 1 };
  trail.preview({ ...frame, time: 0 });
  assert.equal(activePulses(trail).length, 0);
  trail.preview({ ...frame, time: 0.05, speed: 8, boosting: true });
  assert.equal(trail.mesh.visible, false);
  trail.preview({ ...frame, time: 0.08, speed: 15, boosting: true });
  trail.preview({ ...frame, time: 0.12, speed: 22, boosting: true });
  trail.preview({ ...frame, time: 0.16, boosting: true });
  const [pulse] = activePulses(trail);
  const head = trail.mesh.material.uniforms.leadingFade.value.x;
  assert.deepEqual(pulse.toArray(), [head + 0.55 * 2.25, 1 / 5.5, 1]);
  trail.preview({ ...frame, time: 0.19, boosting: true, active: false });
  assert.equal(activePulses(trail).length, 0);
  trail.preview({ ...frame, time: 0.23, boosting: true });
  trail.preview({ ...frame, time: 0.31, boosting: true });
  assert.equal(activePulses(trail).length, 0);
  trail.preview({ ...frame, time: 0.35, boosting: false });
  trail.preview({ ...frame, time: 0.4, boosting: true });
  trail.preview({ ...frame, time: 0.46, boosting: true });
  assert.equal(activePulses(trail).length, 1);
  trail.preview({ ...frame, time: 0.68, boosting: true });
  assert.equal(activePulses(trail).length, 0);
});
