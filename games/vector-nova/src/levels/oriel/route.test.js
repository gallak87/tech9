import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOrielTrack, ORIEL_HABITAT } from './track/model.js';
import { createOrielRoad } from './track/index.js';
import { createOrielRuntime, orielGravity } from './runtime.js';
import { createDevices } from './devices.js';
import { createOrielCollisionWorld } from './collision.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../physics/magnetic-boundaries.js';
import { createVehicleState, STEERING_ASSIST } from '../../physics/index.js';
import { getShip } from '../../ships/catalog.js';

const track = createOrielTrack();
const controls = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const dt = 1 / 120;

test('Oriel closes in physical metres and supports its complete inward-facing wall climb', () => {
  assert.equal(STEERING_ASSIST, 0.3);
  assert.equal(track.width, 40);
  assert.ok(track.length > 8500 && track.length < 10000);
  const start = track.sample(0);
  const seam = track.sample(track.length - 0.001);
  assert.ok(start.position.distanceTo(seam.position) < 0.0011);
  assert.ok(start.quaternion.angleTo(seam.quaternion) < 0.0001);
  let inverted = 0;
  let leftWall = 0;
  let rightWall = 0;
  for (let s = 0; s < track.length; s += 5) {
    const f = track.sample(s);
    const next = track.sample(s + 1);
    assert.ok(Math.abs(f.position.distanceTo(next.position) - 1) < 0.001);
    assert.ok(f.quaternion.angleTo(next.quaternion) < 0.025);
    for (const axis of [f.up, f.right, f.tangent])
      assert.ok(Math.abs(axis.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.up.dot(f.tangent)) < 1e-8);
    assert.ok(Math.hypot(f.position.x, f.position.y - 1000) <= 960.001);
    assert.ok(Math.abs(f.position.z) < ORIEL_HABITAT.length / 2 - 150);
    if (f.up.y < -0.75) inverted++;
    if (f.up.x < -0.75) leftWall++;
    if (f.up.x > 0.75) rightWall++;
  }
  assert.ok(
    inverted > 200,
    'the ceiling must be a substantial driving district',
  );
  assert.ok(
    leftWall > 100 && rightWall > 100,
    'both inner walls carry actual supported road',
  );
});

test('Oriel has two physical S sequences and a separate supported spatial corkscrew', () => {
  assert.equal(track.windings.length, 2);
  for (const winding of track.windings) {
    let left = 0;
    let right = 0;
    for (let s = winding.start; s <= winding.end; s += 4) {
      const curvature = track.sample(s).curvature;
      if (curvature < -0.003) left++;
      if (curvature > 0.003) right++;
    }
    assert.ok(
      left > 12 && right > 12,
      `${winding.id} must contain substantial opposing bends`,
    );
  }
  const cork = track.landmarks.corkscrew;
  assert.ok(cork.end - cork.start > 800);
  const entrance = track.sample(cork.start);
  const inverted = track.sample(cork.s);
  const exit = track.sample(cork.end);
  const radial = new THREE.Vector3(
    -inverted.position.x,
    1000 - inverted.position.y,
    0,
  ).normalize();
  assert.ok(
    inverted.up.dot(radial) < -0.8,
    'the road must invert relative to the habitat floor',
  );
  assert.ok(
    exit.roll - entrance.roll > Math.PI * 2,
    'the independent corkscrew completes a full turn',
  );
  assert.ok(
    Math.hypot(inverted.position.x, inverted.position.y - 1000) < 850,
    'the spatial coil leaves the shell; a roll on the original ellipse is insufficient',
  );
  assert.ok(
    track.civicExclusions.some((x) => x.start < cork.start && x.end > cork.end),
  );
  for (let s = cork.start; s < cork.end; s += 2) {
    const a = track.sample(s);
    const b = track.sample(s + 1);
    for (const lateral of [-20, 0, 20]) {
      const p = a.position.clone().addScaledVector(a.right, lateral);
      const q = b.position.clone().addScaledVector(b.right, lateral);
      assert.ok(
        q.sub(p).dot(a.tangent) > 0.8,
        'both forty-metre-wide shoulders must advance without folding back',
      );
    }
    assert.ok(!track.isGap(s));
  }
});

test('the production road leaves both transfers open and all devices outside flight corridors', () => {
  const road = createOrielRoad(track);
  try {
    for (const mesh of road.group.children.filter(
      (m) => m.userData.drivingSurface,
    )) {
      const coordinates = mesh.geometry.getAttribute('roadCoord');
      const index = mesh.geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        const s =
          (coordinates.getX(index.getX(i)) +
            coordinates.getX(index.getX(i + 1)) +
            coordinates.getX(index.getX(i + 2))) /
          3;
        for (const jump of track.jumps)
          assert.ok(
            s <= jump.takeoff + 0.002 || s >= jump.landingStart - 0.002,
            'no rendered/contact deck triangle may bridge a flight gap',
          );
      }
    }
    assert.equal(createDevices(track).length, 11);
    for (const jump of track.jumps)
      assert.equal(
        track.checkpoints.filter((c) => c.distance === jump.landingStart)
          .length,
        1,
      );
  } finally {
    road.dispose();
    road.dispose();
  }
});

test('Oriel centrifugal gravity is a finite world field pointing away from the cylinder axis', () => {
  for (const position of [
    new THREE.Vector3(0, 40, 500),
    new THREE.Vector3(0, 1960, -200),
    new THREE.Vector3(450, 1000, 900),
  ]) {
    const gravity = new THREE.Vector3().copy(orielGravity(position));
    const radial = position.clone().sub(new THREE.Vector3(0, 1000, position.z));
    assert.ok(Math.abs(gravity.length() - 18) < 1e-10);
    assert.ok(gravity.clone().normalize().dot(radial.normalize()) > 0.999999);
  }
  assert.deepEqual(orielGravity(new THREE.Vector3(0, 1000, 0)), {
    x: 0,
    y: 0,
    z: 0,
  });
});

test('both transfers accept slow cruise, stock cruise and boost-speed ballistic approaches', () => {
  for (const jump of track.jumps) {
    for (const speed of [80, 112, 157]) {
      const runtime = createOrielRuntime({ track });
      const state = {
        ...createVehicleState(),
        distance: jump.takeoff - 0.7,
        speed,
      };
      const events = [];
      try {
        runtime.reset({ state });
        for (let tick = 0; tick < 840; tick++) {
          events.push(...runtime.advance(state, controls, dt));
          if (events.some((e) => e.type === 'jump-transfer')) break;
        }
        assert.equal(events.filter((e) => e.type === 'jump-launch').length, 1);
        assert.equal(
          events.filter((e) => e.type === 'jump-miss').length,
          0,
          `${jump.id} at ${speed} m/s should land without automatic recovery`,
        );
        const transfer = events.find((e) => e.type === 'jump-transfer');
        assert.equal(transfer?.payload.outcome, 'landed');
        assert.ok(
          state.distance >= jump.landingStart &&
            state.distance <= jump.landingEnd,
        );
      } finally {
        runtime.dispose();
      }
    }
  }
});

test('every stock ship lands both native transfers at cruise and held manual boost, then keeps driving', async (t) => {
  const collisionWorld = createOrielCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  // The native world has a different world gravity from the analytic model;
  // the full receiving skin must also extend beneath the fastest boosted arc.
  const profiles = ['shrike', 'kestrel', 'bastion', 'needle'].flatMap(
    (shipId) =>
      [false, true].map((boost) => ({
        shipId,
        boost,
        speed: getShip(shipId).handling[boost ? 'boostSpeed' : 'cruiseSpeed'],
      })),
  );
  for (const jump of track.jumps)
    for (const profile of profiles) {
      const runtime = createOrielRuntime({
        track,
        collisionWorld,
        dynamics,
        playtest: { automaticRecovery: false },
        settings: { steeringAssist: 0.3 },
      });
      const state = {
        ...createVehicleState(profile.shipId),
        distance: jump.takeoff - 0.08,
        speed: profile.speed,
      };
      const events = [];
      let transfer;
      let supportedTicks = 0;
      try {
        runtime.reset({ state, seed: 7 });
        for (let tick = 0; tick < 1200; tick++) {
          const batch = runtime.advance(
            state,
            {
              ...controls,
              boost: profile.boost,
              steer: transfer ? 0.015 : 0,
            },
            dt,
          );
          events.push(...batch);
          transfer ??= batch.find(({ type }) => type === 'jump-transfer');
          assert.ok(runtime.pose(1).position.toArray().every(Number.isFinite));
          if (transfer && ++supportedTicks >= 120) break;
        }
        assert.equal(transfer?.payload.outcome, 'landed', profile.shipId);
        assert.ok(
          !events.some(({ type }) => type === 'jump-miss'),
          profile.shipId,
        );
        assert.equal(
          supportedTicks,
          120,
          'continue driving for one second after contact',
        );
        assert.equal(runtime.snapshot().mode, 'magnetic');
        assert.equal(runtime.pose(1).grounded, true);
      } finally {
        runtime.dispose();
      }
    }
});
