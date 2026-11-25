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
  const { position, fade, trailDistance } = attributes;
  const vertices = [];
  for (let strip = 0; strip < drawRange.count; strip += 6) {
    for (const corner of [0, 1, 2, 4]) {
      const id = index.getX(strip + corner);
      vertices.push({
        x: position.getX(id),
        y: position.getY(id),
        z: position.getZ(id),
        fade: fade.getX(id),
        phase: trailDistance.getX(id),
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
  assert.ok(Math.abs(front - 69.55) < 1e-4, 'head starts near the hull centre');
  const head = spanAt(points, front);
  const tail = spanAt(points, end);
  const travelled = Math.hypot(front - end, (head.center - tail.center) / 0.8);
  assert.ok(Math.abs(travelled - 42) < 1e-4, 'history stays bounded to 42 m');
  assert.ok(Math.abs(head.width - 4.6 * 0.6) < 1e-4);
  assert.ok(Math.abs(head.width - tail.width) < 1e-4, 'film fades in place');
  assert.ok(head.center > tail.center, 'older trace stays on the driven path');
  const leadingFade = mesh.material.uniforms.leadingFade.value;
  assert.ok(Math.abs(leadingFade.x - points[0].phase) < 1e-5);
  assert.equal(leadingFade.y, 0.45, 'the head feathers close to the hull');
  assert.ok(points.some(({ fade }) => fade > 0.26) && tail.fade < 1e-6);
});

test('the player wake grows with speed and caps at 42 m', (t) => {
  const trail = createGlideTrail({ track });
  t.after(() => trail.dispose());
  for (const [kmh, length, visibleDepth] of [
    [80, 20, 15],
    [100, 25, 19],
    [120, 30, 23],
    [168, 42, 32],
    [240, 42, 32],
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

test('the dimmer rival wake keeps a 30 m reach and fades with visibility', (t) => {
  const player = createGlideTrail({ track });
  const rival = createGlideTrail({ track, strengthScale: 0.46, reach: 30 });
  t.after(() => {
    player.dispose();
    rival.dispose();
  });

  for (let frame = 0; frame <= 40; frame++) {
    const time = frame / 60;
    const distance = 20 + 100 * time;
    update(player, time, distance);
    update(rival, time, distance, 0, { visibility: 0.5 });
  }
  const points = stripVertices(rival.mesh);
  const playerPoints = stripVertices(player.mesh);
  assert.ok(Math.abs(points[0].z - points.at(-1).z - 30) < 1e-4);
  assert.ok(Math.abs(playerPoints[0].z - playerPoints.at(-1).z - 42) < 1e-4);
  assert.deepEqual(
    spanAt(points, points[0].z),
    spanAt(playerPoints, points[0].z),
  );
  assert.equal(player.mesh.material.uniforms.opacityScale.value, 1);
  assert.equal(rival.mesh.material.uniforms.opacityScale.value, 0.23);
  update(rival, 0.7, 90, 0, { visibility: 0.75 });
  assert.equal(rival.mesh.material.uniforms.opacityScale.value, 0.46 * 0.75);
  rival.reset();
  assert.equal(rival.mesh.visible, false);
  update(rival, 0.75, 95);
  assert.equal(rival.mesh.visible, false);
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
    normal.filter(({ z }) => z < 23.551),
    boosted.filter(({ z }) => z < 23.551),
  );
  const ordinaryHead = spanAt(normal, 25.05);
  const boostedHead = spanAt(boosted, 25.05);
  assert.ok(boostedHead.width > ordinaryHead.width);
  assert.ok(boostedHead.fade > ordinaryHead.fade);
});

test('surface samples stay on the deposited path as the wake fades', (t) => {
  const trail = createGlideTrail({ track, surfaceStep: 4 });
  t.after(() => trail.dispose());
  update(trail, 0, 100);
  update(trail, 0.1, 110, 1);
  update(trail, 0.2, 120, 2);
  const atDeposit = ({ z }) => Math.abs(z - 109.55) < 1e-4;
  const coordinates = ({ x, y, z, phase }) => [x, y, z, phase];
  const { leadingFade, ripplePhase } = trail.mesh.material.uniforms;
  const scallopAt = ({ phase }) => {
    const along = leadingFade.value.x - phase;
    return Math.sin((along * 2 * Math.PI) / 3.1 - ripplePhase.value);
  };
  const old = stripVertices(trail.mesh).filter(atDeposit);
  assert.ok(old.length > 0);
  const oldScallop = scallopAt(old[0]);
  assert.ok(
    old.every(({ phase }) => Math.abs(phase - Math.hypot(10, 1)) < 1e-5),
  );
  update(trail, 0.3, 130, 3, { boost: 1 });
  const retained = stripVertices(trail.mesh).filter(atDeposit);
  assert.deepEqual(retained.map(coordinates), old.map(coordinates));
  assert.ok(Math.abs(scallopAt(retained[0]) - oldScallop) < 1e-9);
  assert.ok(retained[0].fade < old[0].fade);

  update(trail, 0.85, 185, 4, { grounded: false });
  const airborne = stripVertices(trail.mesh).filter(atDeposit);
  assert.deepEqual(airborne.map(coordinates), old.map(coordinates));
  assert.ok(airborne[0].fade < retained[0].fade);
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
  const head = spanAt(points, -0.585);
  assert.ok(Math.abs(head.width - 4.2 * 0.65) < 1e-4);
  const leadingFade = mesh.material.uniforms.leadingFade.value;
  assert.ok(Math.abs(leadingFade.x - points[0].phase) < 1e-5);
  assert.equal(leadingFade.y, 0.45);
  assert.ok(points.at(-1).fade < 1e-6);
  assert.ok(points.some(({ fade }) => fade > 0.28));
  assert.ok(Math.abs(points.at(-1).z + 6.3) < 1e-6);
  assert.ok(points.every(({ phase, z }) => phase === z));
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
