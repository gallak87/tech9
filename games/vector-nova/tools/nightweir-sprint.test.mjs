import test from 'node:test';
import assert from 'node:assert/strict';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirRuntime } from '../src/levels/nightweir/runtime.js';
import { inspectJump, COAST } from './shatterline-inspect.mjs';
import { getVehiclePace } from '../src/physics/index.js';
import createLevel from '../src/levels/nightweir/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
const track = createNightweirTrack();
test('full sprint stays downhill from reservoir to harbor with a safe finish', () => {
  assert.ok(track.finishDistance > 12000 && track.length <= 15000);
  assert.equal(track.closed, false);
  assert.ok(track.length - track.finishDistance >= 650);
  let down = 0,
    supported = 0;
  for (let s = 10; s < track.finishDistance; s += 5) {
    if (track.isGap(s)) continue;
    supported++;
    if (track.sample(s).tangent.y < -0.06) down++;
  }
  assert.ok(down / supported > 0.98);
  assert.ok(
    track.sample(0).position.y - track.sample(track.finishDistance).position.y >
      2800,
  );
  assert.equal(track.inversions.length, 3);
  for (const inversion of track.inversions) {
    const mid = track.sample((inversion.start + inversion.end) / 2);
    assert.ok(mid.up.y < -0.45, 'each full corkscrew drives upside down');
  }
  assert.equal(track.curtains.length, 6);
  assert.ok(
    track.curtains.every(({ s }) => !track.isGap(s)),
    'gate stations stand on supported roads',
  );
  assert.ok(track.sample(track.length).position.y > 0);
  assert.ok(track.finishDistance - track.jumps.at(-1).landingEnd > 300);
});
test('eight real gaps have downhill receivers and sustained recovery', () => {
  assert.equal(track.jumps.length, 8);
  for (const j of track.jumps) {
    assert.equal(track.surfaceCoverage((j.takeoff + j.landingStart) / 2), 0);
    assert.equal(track.surfaceCoverage(j.recovery), 1);
    assert.ok(j.landingEnd - j.landingStart > 170);
    assert.ok(
      track.sample(j.landingEnd).position.y <
        track.sample(j.landingStart).position.y,
    );
  }
});
test('every hull crosses each gap without boost and retains the fast landing envelope', () => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const pace = getVehiclePace(shipId, track.pace);
    for (const jump of track.jumps) {
      // Neutral flight uses no reserve: even the slowest hull at its ordinary
      // cruise pace crosses without a pickup or a midair boost requirement.
      for (const speed of [pace.cruiseSpeed, jump.targetSpeed, 255]) {
        const result = inspectJump({
          track,
          jump,
          shipId,
          speed,
          runtime: createNightweirRuntime({ track, presentation: false }),
        });
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
        if (jump.hero) {
          const window = jump.id === 'turbine-leap' ? [3.2, 3.7] : [4.5, 5.1];
          assert.ok(
            result.airtime >= window[0] && result.airtime <= window[1],
            JSON.stringify(result),
          );
          assert.ok(
            result.landingRemainder >= 80,
            'fast arrivals retain supported road to settle',
          );
        }
      }
      if (!jump.hero) continue;
      const boosted = inspectJump({
        track,
        jump,
        shipId,
        speed: pace.boostSpeed,
        input: { ...COAST, throttle: 1, boost: true },
        runtime: createNightweirRuntime({ track, presentation: false }),
      });
      assert.equal(boosted.outcome, 'landed', JSON.stringify(boosted));
    }
  }
});

test('hero flights remain real broad voids with legible separated receiving decks', () => {
  for (const jump of track.jumps.filter((entry) => entry.hero)) {
    const from = track.sample(jump.takeoff).position;
    const to = track.sample(jump.landingStart).position;
    const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
    assert.ok(horizontal >= (jump.id === 'turbine-leap' ? 299 : 439));
    assert.ok(
      jump.landingEnd - jump.landingStart >=
        (jump.id === 'turbine-leap' ? 640 : 940),
    );
    const next = track.jumps.find((entry) => entry.takeoff > jump.takeoff);
    assert.ok(
      (next?.takeoff ?? track.finishDistance) - jump.landingEnd > 300,
      'a long landing is followed by grounded racing before the next commitment',
    );
  }
});

test('hero receiving decks catch reasonable off-center approaches at slow and fast pace', () => {
  for (const jump of track.jumps.filter((entry) => entry.hero)) {
    for (const speed of [121.2, 255]) {
      for (const side of [-1, 1]) {
        const result = inspectJump({
          track,
          jump,
          speed,
          lateral: side * 8,
          heading: side * 0.008,
          runtime: createNightweirRuntime({ track, presentation: false }),
        });
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
      }
    }
  }
});

test('full descent sustains alternating corners and distinct steep chutes', () => {
  let supported = 0,
    turning = 0,
    steep = 0,
    reversals = 0,
    previous = 0;
  let lowPitch = Math.PI,
    highPitch = 0;
  for (let s = 10; s < track.finishDistance - 10; s += 5) {
    if (track.isGap(s)) continue;
    const a = track.sample(s - 5).tangent,
      b = track.sample(s + 5).tangent;
    const curvature = (a.x * b.z - a.z * b.x) / 10;
    const pitch = Math.asin(-track.sample(s).tangent.y);
    supported++;
    if (Math.abs(curvature) > 0.0009) {
      turning++;
      if (previous * curvature < 0) reversals++;
      previous = curvature;
    }
    if (pitch > 0.3) steep++;
    lowPitch = Math.min(lowPitch, pitch);
    highPitch = Math.max(highPitch, pitch);
    assert.ok(
      Math.abs(curvature) < 0.009,
      'no snap-back hairpin after a receiver',
    );
  }
  assert.ok(turning / supported > 0.55, 'most supported road requires turning');
  assert.ok(
    steep / supported > 0.17,
    'substantial supported descent exceeds 17 degrees',
  );
  assert.ok(
    reversals >= 14,
    'alternate steering direction throughout the descent',
  );
  assert.ok(
    lowPitch < 0.15 && highPitch > 0.38,
    'pitch varies beyond a constant helix',
  );
});

test('Blender scenery and bridge supports clear the banked driving corridor', () => {
  const world = createLevel().createCollisionWorld({ track });
  const scenery = createCollisionWorld({
    id: 'nightweir-clearance-regression',
    version: 1,
    geometryId: track.geometryVersion,
    triangles: world.triangles.filter(
      (t) =>
        t.id === 'nightweir-city-solids' || t.id.startsWith('nightweir-bridge'),
    ),
  });
  try {
    for (let s = 12; s < track.length; s += 12) {
      if (track.isGap(s)) continue;
      const f = track.sample(s);
      for (const lateral of [-19, 0, 19]) {
        const pose = {
          position: f.position
            .clone()
            .addScaledVector(f.up, 0.8)
            .addScaledVector(f.right, lateral),
          quaternion: f.quaternion,
        };
        const after = {
          ...pose,
          position: pose.position.clone().addScaledVector(f.tangent, 0.1),
        };
        const hit = scenery.sweepHull(pose, after);
        assert.equal(
          hit,
          null,
          `Scenery intersects the road at ${s} m, lane ${lateral}: ${hit?.shape.id}`,
        );
      }
    }
  } finally {
    scenery.dispose();
    world.dispose();
  }
});

test('moving sluice leaves and counterweights clear all supported racing lanes', async () => {
  const T = await import('three');
  const { createNightweirWater } =
    await import('../src/levels/nightweir/environment/water.js');
  const { indexedTriangles } =
    await import('../src/physics/collision-world.js');
  const water = createNightweirWater(track);
  try {
    for (const phase of [0, 0.5, 1]) {
      water.group.userData.phaseOverride = phase;
      water.update();
      const triangles = [];
      for (const name of [
        'rising sluice leaves',
        'gate lifting stems',
        'descending counterweights',
      ]) {
        const mesh = water.group.getObjectByName('Nightweir / ' + name);
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new T.Matrix4();
          mesh.getMatrixAt(i, matrix);
          for (const triangle of indexedTriangles(
            mesh.geometry.attributes.position.array,
            mesh.geometry.index.array,
            { id: name, kind: 'structure' },
            matrix,
          ))
            triangles.push(triangle);
        }
      }
      const world = createCollisionWorld({
        id: 'nightweir-moving-gates',
        version: 1,
        geometryId: track.geometryVersion,
        triangles,
      });
      try {
        for (let s = 12; s < track.length; s += 12) {
          if (track.isGap(s)) continue;
          const f = track.sample(s);
          for (const lateral of [-19, 0, 19]) {
            const pose = {
              position: f.position
                .clone()
                .addScaledVector(f.up, 0.8)
                .addScaledVector(f.right, lateral),
              quaternion: f.quaternion,
            };
            const hit = world.sweepHull(pose, {
              ...pose,
              position: pose.position.clone().addScaledVector(f.tangent, 0.1),
            });
            assert.equal(
              hit,
              null,
              `Gate phase ${phase} intersects ${s}m lane ${lateral}: ${hit?.shape.id}`,
            );
          }
        }
      } finally {
        world.dispose();
      }
    }
  } finally {
    water.dispose();
  }
});
