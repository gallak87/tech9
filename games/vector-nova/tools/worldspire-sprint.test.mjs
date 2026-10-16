import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import { createWorldspireRuntime } from '../src/levels/worldspire/runtime.js';
import { inspectJump, COAST } from './shatterline-inspect.mjs';
import { getVehiclePace } from '../src/physics/index.js';
import createLevel from '../src/levels/worldspire/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
const track = createWorldspireTrack();
test('full sprint stays downhill from crown to root with a safe finish', () => {
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
      5000,
  );
  assert.equal(track.inversions.length, 3);
  for (const inversion of track.inversions) {
    const mid = track.sample((inversion.start + inversion.end) / 2);
    assert.ok(mid.up.y < -0.45, 'each full corkscrew drives upside down');
  }
  assert.equal(track.interiors.length, 2);
  assert.ok(track.sample(track.length).position.y > 0);
  assert.ok(track.finishDistance - track.jumps.at(-1).landingEnd > 300);
});
test('seven real gaps have downhill receivers and sustained recovery', () => {
  assert.equal(track.jumps.length, 7);
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
test('every hull crosses the larger transfers without boost and retains fast receiving room', () => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const pace = getVehiclePace(shipId, track.pace);
    for (const jump of track.jumps) {
      for (const speed of [pace.cruiseSpeed, jump.targetSpeed, 255]) {
        const result = inspectJump({
          track,
          jump,
          shipId,
          speed,
          runtime: createWorldspireRuntime({ track, presentation: false }),
        });
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
        if (jump.hero) {
          const window = jump.id === 'echo-chasm' ? [3.8, 4.2] : [4.5, 5.1];
          assert.ok(
            result.airtime >= window[0] && result.airtime <= window[1],
            JSON.stringify(result),
          );
          assert.ok(
            result.landingRemainder >= 150,
            'fast hero arrivals retain a real settling reach',
          );
        }
      }
      const boosted = inspectJump({
        track,
        jump,
        shipId,
        speed: pace.boostSpeed,
        input: { ...COAST, throttle: 1, boost: true },
        runtime: createWorldspireRuntime({ track, presentation: false }),
      });
      assert.equal(boosted.outcome, 'landed', JSON.stringify(boosted));
    }
  }
});

test('three immense flights are separated by meaningful grounded racing', () => {
  assert.deepEqual(
    track.jumps.filter((jump) => jump.hero).map((jump) => jump.id),
    ['heart-chasm', 'echo-chasm', 'root-gate'],
  );
  for (const jump of track.jumps.filter((entry) => entry.hero)) {
    const from = track.sample(jump.takeoff).position;
    const to = track.sample(jump.landingStart).position;
    assert.ok(
      Math.hypot(to.x - from.x, to.z - from.z) >=
        (jump.id === 'echo-chasm' ? 359 : 439),
    );
    assert.ok(
      jump.landingEnd - jump.landingStart >=
        (jump.id === 'echo-chasm' ? 810 : 940),
    );
    const next = track.jumps.find((entry) => entry.takeoff > jump.takeoff);
    assert.ok((next?.takeoff ?? track.finishDistance) - jump.landingEnd > 300);
  }
});

test('receiving fans catch reasonable off-center hero approaches', () => {
  for (const jump of track.jumps.filter((entry) => entry.hero))
    for (const speed of [121.2, 160, 255])
      for (const side of [-1, 1]) {
        const result = inspectJump({
          track,
          jump,
          speed,
          lateral: side * 8,
          heading: side * 0.008,
          runtime: createWorldspireRuntime({ track, presentation: false }),
        });
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
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
    if (pitch > Math.PI / 6) steep++;
    lowPitch = Math.min(lowPitch, pitch);
    highPitch = Math.max(highPitch, pitch);
    assert.ok(
      Math.abs(curvature) < 0.009,
      'no snap-back hairpin after a receiver',
    );
  }
  assert.ok(turning / supported > 0.6, 'most supported road requires turning');
  assert.ok(
    steep / supported > 0.2,
    'substantial supported descent exceeds 30 degrees',
  );
  assert.ok(
    reversals >= 18,
    'alternate steering direction throughout the descent',
  );
  assert.ok(
    lowPitch < 0.3 && highPitch > 0.65,
    'pitch varies beyond a constant helix',
  );
});

test('Blender scenery and radial supports clear the banked driving corridor', () => {
  const world = createLevel().createCollisionWorld({ track });
  const scenery = createCollisionWorld({
    id: 'worldspire-clearance-regression',
    version: 1,
    geometryId: track.geometryVersion,
    triangles: world.triangles.filter(
      (t) =>
        t.id === 'worldspire-monolith-and-heart' ||
        t.id.startsWith('worldspire-radial'),
    ),
  });
  try {
    for (let s = 12; s < track.length; s += 12) {
      if (track.isGap(s)) continue;
      const f = track.sample(s);
      for (const lateral of [-22, 0, 22]) {
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
