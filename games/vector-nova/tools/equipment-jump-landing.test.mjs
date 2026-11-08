import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createShatterlineLevel from '../src/levels/shatterline/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { projectMagneticBody } from '../src/physics/magnetic-body.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';

const DT = 1 / 120;
const input = { throttle: 1, steer: 0 };

test('powered tube touchdown keeps actual surface coordinates without moving the native or interpolated chassis sideways', async (t) => {
  const level = createShatterlineLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const native = await level.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  let actor;
  const runtime = level.createRuntime({
    track,
    collisionWorld,
    dynamics: {
      ...native,
      createActor(...args) {
        actor = native.createActor(...args);
        return actor;
      },
    },
    presentation: false,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  const hull = getCollisionHull('kestrel');
  const results = [];
  for (const tube of track.tubes)
    for (const [lateral, pitch] of [
      [-28, 0],
      [28, 0],
      [-30, Math.PI / 2],
      [30, Math.PI / 2],
    ]) {
      native.reset();
      const state = {
        ...createVehicleState('kestrel'),
        distance: (tube.entryEnd + tube.exitStart) / 2,
        lateral,
        speed: 80,
      };
      runtime.reset({ reason: 'initialize', state, seed: 7 });
      runtime.advance(state, input, DT);
      assert.ok(runtime.jump(state));
      const station = state.distance + 8;
      const frame = track.sampleSurface(station, lateral);
      const orientation = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), pitch),
        );
      let extent = 0;
      for (let i = 0; i < hull.vertices.length; i += 3)
        extent = Math.max(
          extent,
          -new T.Vector3()
            .fromArray(hull.vertices, i)
            .applyQuaternion(orientation)
            .dot(frame.up),
        );
      // Resume a real powered hop immediately before a descending contact.
      // The pitched fixture represents a post-impact attitude. Its native hull
      // starts clear of the actual tube, without changing its road or bounds.
      const airborne = runtime.snapshot();
      airborne.currentPose = {
        position: frame.position
          .clone()
          .addScaledVector(frame.up, extent + 0.15)
          .toArray(),
        quaternion: orientation.toArray(),
      };
      airborne.previousPose = structuredClone(airborne.currentPose);
      Object.assign(airborne.flight, {
        velocity: frame.tangent
          .clone()
          .multiplyScalar(80)
          .addScaledVector(frame.up, -20)
          .toArray(),
        angularVelocity: [0, 0, 0],
        elapsed: 1.15,
        hitAt: 1.15,
        contacts: 1,
        equipmentGuide: { distance: station, lateral, height: 0.72 },
      });
      runtime.restore(airborne);
      const checkpoint = {
        state: { ...state },
        motion: runtime.snapshot(),
        physics: native.snapshot(),
      };
      const project = (position) =>
        projectMagneticBody(
          track,
          position,
          station,
          lateral,
          native.sampleRoadSurface,
        );
      const run = () => {
        const rows = [];
        let touchdown = null;
        for (let tick = 0; tick < 16; tick++) {
          const before = actor.read();
          runtime.beginAdvance(state, input, DT);
          native.step(DT);
          const solved = actor.read();
          const events = runtime.finishAdvance(state);
          const adopted = actor.read();
          const surface = project(adopted.position);
          const transfer = events.find(({ type }) => type === 'jump-transfer');
          if (transfer?.payload.outcome === 'landed') touchdown = tick;
          const movement = adopted.position.clone().sub(before.position);
          const excess = movement.clone().addScaledVector(before.velocity, -DT);
          const beforeSurface = project(before.position);
          const interpolation = [0, 0.5, 1].map((alpha) => {
            const pose = runtime.pose(alpha);
            const expected = before.position
              .clone()
              .lerp(adopted.position, alpha);
            // Adoption starts both magnetic endpoints at the accepted pose.
            if (transfer?.payload.outcome === 'landed')
              expected.copy(adopted.position);
            const offset = pose.position.clone().sub(expected);
            const reference = project(expected).frame;
            return {
              alpha,
              across: offset.dot(reference.right),
              along: offset.dot(reference.tangent),
              position: pose.position.toArray(),
            };
          });
          rows.push({
            tick,
            mode: runtime.snapshot().mode,
            position: adopted.position.toArray(),
            state: { ...state },
            adoptionMove: adopted.position.distanceTo(solved.position),
            lateralError: state.lateral - surface.lateral,
            distanceError: state.distance - surface.distance,
            acrossExcess: excess.dot(beforeSurface.frame.right),
            alongExcess: excess.dot(beforeSurface.frame.tangent),
            move: movement.length(),
            contacts: solved.contacts.map(({ shape }) => shape.kind),
            events,
            interpolation,
          });
          if (touchdown !== null && tick >= touchdown + 4) break;
        }
        return {
          touchdown,
          rows,
          motion: runtime.snapshot(),
          physics: native.snapshot(),
        };
      };
      const first = run();
      Object.assign(state, checkpoint.state);
      runtime.restore(checkpoint.motion);
      native.restore(checkpoint.physics);
      assert.deepEqual(
        run(),
        first,
        'native landing and settling replay exactly',
      );
      results.push({
        tube: tube.id,
        lateral,
        pitch,
        touchdown: first.touchdown,
        rows: first.rows,
      });
    }
  for (const result of results) {
    const label = `${result.tube}, lane ${result.lateral}, pitch ${result.pitch}`;
    assert.notEqual(result.touchdown, null, `${label}: native touchdown`);
    const at = result.rows[result.touchdown];
    assert.ok(at.adoptionMove < 1e-8, `${label}: preserve solved contact pose`);
    assert.ok(
      Math.abs(at.lateralError) < 0.02,
      `${label}: lateral coordinate error ${at.lateralError}m`,
    );
    assert.ok(
      Math.abs(at.distanceError) < 0.02,
      `${label}: station coordinate error ${at.distanceError}m`,
    );
    const transfer = at.events.find(({ type }) => type === 'jump-transfer');
    assert.ok(
      Math.abs(transfer.payload.to - at.state.distance) < 1e-7,
      `${label}: transfer credit uses canonical station`,
    );
    for (const row of result.rows.slice(result.touchdown + 1)) {
      assert.equal(row.mode, 'magnetic', `${label}: retained traction`);
      assert.equal(row.state.resetCount, 0, `${label}: no recovery reset`);
      assert.ok(
        !row.contacts.includes('racer'),
        `${label}: no racer can cause this correction`,
      );
      assert.ok(
        Math.abs(row.acrossExcess) < 0.2,
        `${label}: unexpected sideways displacement ${row.acrossExcess}m`,
      );
      assert.ok(
        Math.abs(row.alongExcess) < 0.2,
        `${label}: unexpected longitudinal displacement ${row.alongExcess}m`,
      );
    }
    for (const row of result.rows.slice(result.touchdown)) {
      for (const pose of row.interpolation) {
        assert.ok(
          Math.abs(pose.across) < 0.05,
          `${label}: alpha ${pose.alpha} sideways presentation shift`,
        );
        assert.ok(
          Math.abs(pose.along) < 0.05,
          `${label}: alpha ${pose.alpha} longitudinal presentation shift`,
        );
      }
    }
  }
});
