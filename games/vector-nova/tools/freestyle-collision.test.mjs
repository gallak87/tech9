import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import skywell from '../src/levels/zephyr-skywell/index.js';
import oriel from '../src/levels/freestyle-oriel/index.js';
import ravel from '../src/levels/freestyle-ravel/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createTransferPilot } from './freestyle-pilot.mjs';

const DT = 1 / 120;
const clone = (value) => JSON.parse(JSON.stringify(value));

// Choose an actual broad face facing the road, with a clear incoming sweep.
// Bounds alone are deliberately insufficient: arches must retain their voids.
function contactCase(world, track, jump) {
  const reference = track.sample(jump.landingStart + 100).position;
  const candidates = world.triangles
    .filter((face) => face.receiverId === jump.id)
    .map((face) => {
      const triangle = new T.Triangle(
        ...face.points.map((p) => new T.Vector3(...p)),
      );
      const point = triangle.getMidpoint(new T.Vector3()),
        normal = triangle.getNormal(new T.Vector3());
      if (normal.dot(reference.clone().sub(point)) < 0) normal.negate();
      return {
        triangle,
        point,
        normal,
        area: triangle.getArea(),
        distance: point.distanceTo(reference),
      };
    })
    .filter((item) => item.area > 15)
    .sort((a, b) => a.distance - b.distance);
  for (const item of candidates) {
    const before = {
      position: item.point.clone().addScaledVector(item.normal, 24),
      quaternion: track.sample(jump.landingStart).quaternion.clone(),
    };
    const after = {
      ...before,
      position: item.point.clone().addScaledVector(item.normal, -24),
    };
    const hit = world.sweepHull(before, after);
    if (
      hit?.shape.receiverId === jump.id &&
      hit.fraction > 0.08 &&
      hit.fraction < 0.8
    )
      return { ...item, before, after, hit };
  }
  assert.fail(
    `${track.name}/${jump.id}: a reachable authored solid must block a real hull sweep`,
  );
}

for (const [id, factory] of [
  ['zephyr-skywell', skywell],
  ['freestyle-oriel', oriel],
  ['freestyle-ravel', ravel],
]) {
  test(`${id}: receiver solids block misses and native bounce recovery remains playable`, async (t) => {
    const level = factory(),
      track = level.createTrack();
    const kit = JSON.parse(
      await readFile(
        new URL(`../src/levels/${id}/landing-solids.json`, import.meta.url),
        'utf8',
      ),
    );
    const { fingerprint, ...content } = kit;
    assert.ok(
      kit.sources.length > 0,
      'current visual source geometry is identified',
    );
    assert.ok(
      kit.triangleCount <= 350000,
      'receiver scenery stays within the bounded static collision budget',
    );
    assert.equal(
      createHash('sha256').update(JSON.stringify(content)).digest('hex'),
      fingerprint,
    );
    for (const source of kit.sources)
      assert.equal(
        createHash('sha256')
          .update(await readFile(new URL(`../${source.file}`, import.meta.url)))
          .digest('hex'),
        source.sha256,
        `current source: ${source.file}`,
      );
    const world = await level.createCollisionWorld({ track });
    const dynamics = await level.createDynamics({
      track,
      collisionWorld: withMagneticBoundaries(track, world),
    });
    const runtime = level.createRuntime({
      track,
      collisionWorld: world,
      dynamics,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    });
    t.after(() => {
      runtime.dispose();
      dynamics.dispose();
      world.dispose();
    });
    const contacts = track.jumps.map((jump) => contactCase(world, track, jump));
    assert.equal(contacts.length, 5);
    const state = {
      ...createVehicleState('shrike'),
      ...track.scenarios['jump1-approach'],
    };
    runtime.reset({ state, seed: 7 });
    const pilot = createTransferPilot(track, { reaction: 0.15, quantum: 0.25 });
    for (let i = 0; i < 1800 && runtime.snapshot().mode !== 'flight'; i++)
      runtime.advance(
        state,
        pilot({ state, motion: runtime.snapshot(), pose: runtime.pose(1) }),
        DT,
      );
    const snapshot = clone(runtime.snapshot());
    assert.equal(
      snapshot.mode,
      'flight',
      'the actual route launches the native hull',
    );
    const impact = contacts[0];
    snapshot.currentPose = snapshot.previousPose = {
      position: impact.before.position.toArray(),
      quaternion: impact.before.quaternion.toArray(),
    };
    Object.assign(snapshot.flight, {
      velocity: impact.normal.clone().multiplyScalar(-110).toArray(),
      angularVelocity: [0, 0, 0],
      elapsed: 0.5,
      hitAt: -1,
      remaining: 0,
      dynamicsStarted: true,
    });
    runtime.restore(snapshot);
    const events = [];
    let recoveryTicks = 0;
    let bounced = false;
    for (let i = 0; i < 1440; i++) {
      const emitted = runtime.advance(state, {}, DT);
      events.push(...emitted);
      const frame = runtime.snapshot();
      const contact = emitted.find(
        (event) =>
          event.type === 'impact' && event.payload.contactKind === 'structure',
      );
      if (contact && frame.flight) {
        const outward = new T.Vector3(...frame.flight.velocity).dot(
          new T.Vector3(...contact.payload.normal),
        );
        assert.ok(
          outward > -15,
          `the native contact deflects incoming momentum: ${outward}`,
        );
        bounced = true;
      }
      if (frame.mode === 'recovery') recoveryTicks++;
      assert.ok(
        runtime.pose(1).position.toArray().every(Number.isFinite),
        'contacts never produce a nonfinite pose',
      );
      if (
        events.some(
          (event) =>
            event.type === 'jump-transfer' &&
            event.payload.outcome === 'recovered',
        )
      )
        break;
    }
    assert.ok(
      events.some(
        (event) =>
          event.type === 'impact' && event.payload.contactKind === 'structure',
      ),
      'a real native scenery contact causes bounce feedback',
    );
    assert.ok(
      bounced,
      'the actual flight velocity is deflected, not only the feedback',
    );
    assert.ok(recoveryTicks > 0, 'the normal falling recovery is retained');
    assert.ok(
      events.some(
        (event) =>
          event.type === 'jump-transfer' &&
          event.payload.outcome === 'recovered',
      ),
      'the failed transfer returns to its authored receiver',
    );
    assert.equal(runtime.pose(1).grounded, true);
    const recoveredDistance = state.distance;
    for (let i = 0; i < 120; i++) runtime.advance(state, { throttle: 1 }, DT);
    assert.ok(
      state.distance > recoveredDistance + 1,
      'the recovered ship can continue driving',
    );
  });
}
