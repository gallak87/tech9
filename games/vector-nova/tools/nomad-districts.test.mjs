import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadDistricts } from '../src/levels/nomad/districts.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { getRacerControl } from '../src/race/racers.js';
import { sampleCarrierMotion } from '../src/levels/nomad/motion.js';

const definition = createLevel();

function trianglesOf(root) {
  root.updateWorldMatrix(true, true);
  const triangles = [],
    instanceMatrix = new T.Matrix4(),
    matrix = new T.Matrix4();
  for (const batch of root.children) {
    if (!batch.isBatchedMesh) continue;
    const positions = batch.geometry.attributes.position;
    for (let instance = 0; instance < batch.instanceCount; instance++) {
      const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(instance));
      batch.getMatrixAt(instance, instanceMatrix);
      matrix.multiplyMatrices(root.matrixWorld, instanceMatrix);
      for (
        let index = range.vertexStart;
        index < range.vertexStart + range.vertexCount;
        index += 3
      )
        triangles.push(
          [0, 1, 2].map((offset) =>
            new T.Vector3()
              .fromBufferAttribute(positions, index + offset)
              .applyMatrix4(matrix),
          ),
        );
    }
  }
  return triangles;
}

test('Nomad carrier roles are materially batched, attached to their rigid owners and released once', () => {
  const track = definition.createTrack();
  const districts = createNomadDistricts({ track });
  const released = new Map();
  const expectedBatches = districts.report.batches;
  try {
    assert.equal(districts.report.carriers.length, 11);
    assert.equal(
      new Set(districts.report.carriers.map((carrier) => carrier.role)).size,
      11,
    );
    assert.ok(districts.report.assemblies >= 30);
    assert.ok(districts.report.triangles < 190000);
    for (const carrier of districts.report.carriers) {
      assert.ok(carrier.batches >= 4 && carrier.batches <= 6);
      assert.ok(carrier.assemblies.length > 0);
      for (const assembly of carrier.assemblies) {
        const seat = assembly.attachment.startsWith('underside')
          ? assembly.max[1]
          : assembly.min[1];
        assert.ok(Math.abs(seat - assembly.sourcePlane) < 1e-6, assembly.title);
      }
    }
    for (const root of districts.group.children)
      for (const batch of root.children) {
        assert.equal(batch.isBatchedMesh, true);
        assert.equal(batch.perObjectFrustumCulled, true);
        assert.equal(batch.sortObjects, false);
        batch.geometry.addEventListener('dispose', () =>
          released.set(batch.geometry, (released.get(batch.geometry) ?? 0) + 1),
        );
      }
    track.presentationTime = 11;
    districts.update();
    for (const carrier of track.carriers) {
      const root = districts.group.children.find(
        (child) => child.userData.carrierId === carrier.id,
      );
      assert.ok(
        root.position.distanceTo(
          carrier.origin
            .clone()
            .add(sampleCarrierMotion(carrier, 11).translation),
        ) < 1e-10,
      );
      assert.ok(root.quaternion.equals(carrier.quaternion));
      assert.ok(root.scale.equals(carrier.scale));
    }
  } finally {
    districts.dispose();
    districts.dispose();
  }
  assert.equal(districts.group.children.length, 0);
  assert.equal(released.size, expectedBatches);
  assert.ok([...released.values()].every((count) => count === 1));
  const shape = createNomadDistricts({ track, shape: true });
  assert.equal(shape.group.children.length, 0);
  shape.dispose();
  shape.dispose();
});

test('the actual packed working districts clear the entire winding road width and camera volume', (t) => {
  const track = definition.createTrack();
  const districts = createNomadDistricts({ track });
  let minimum = Infinity;
  try {
    for (const root of districts.group.children) {
      const carrier = track.carriers.find(
        (entry) => entry.id === root.userData.carrierId,
      );
      const frames = [];
      for (
        let distance = carrier.start;
        distance <= carrier.end;
        distance += 6
      ) {
        const frame = track.sample(distance);
        frames.push({
          p: frame.position.toArray(),
          r: frame.right.toArray(),
          u: frame.up.toArray(),
          a: frame.tangent.toArray(),
          half: track.halfWidthAt(distance),
        });
      }
      for (const triangle of trianglesOf(root)) {
        const centroid = triangle[0]
          .clone()
          .add(triangle[1])
          .add(triangle[2])
          .multiplyScalar(1 / 3);
        for (const point of [...triangle, centroid]) {
          let nearest = Infinity;
          for (const frame of frames) {
            const x = point.x - frame.p[0],
              y = point.y - frame.p[1],
              z = point.z - frame.p[2];
            if (Math.abs(z) > 95) continue;
            const along = x * frame.a[0] + y * frame.a[1] + z * frame.a[2];
            const across = x * frame.r[0] + y * frame.r[1] + z * frame.r[2];
            const normal = x * frame.u[0] + y * frame.u[1] + z * frame.u[2];
            const distance = Math.hypot(
              Math.max(0, Math.abs(along) - 3),
              Math.max(0, Math.abs(across) - frame.half),
              normal,
            );
            nearest = Math.min(nearest, distance);
          }
          minimum = Math.min(minimum, nearest);
          assert.ok(
            nearest >= 25,
            `${carrier.id}: working member crowds full-width road/camera at ${point.toArray()}`,
          );
        }
      }
    }
    t.diagnostic(
      `minimum sampled actual-geometry road/camera clearance: ${minimum.toFixed(2)}m`,
    );
  } finally {
    districts.dispose();
  }
});

test('actual native intercepted flights clear every moving district by a continuous 25m box', async (t) => {
  const track = definition.createTrack();
  const districts = createNomadDistricts({ track });
  const solids = districts.group.children.map((root) => {
    const carrier = track.carriers.find(
      (entry) => entry.id === root.userData.carrierId,
    );
    const triangles = trianglesOf(root).map((points, index) => ({
      id: `${carrier.id}/district-${index}`,
      kind: 'structure',
      points: points.map((point) => point.toArray()),
    }));
    return {
      carrier,
      world: createCollisionWorld({
        id: carrier.id,
        version: 1,
        geometryId: 'nomad-district-clearance-v1',
        triangles,
      }),
    };
  });
  let collisionWorld,
    dynamics,
    passes = 0;
  const envelope = { halfWidth: 25, halfLength: 25, hover: 25 };
  try {
    collisionWorld = definition.createCollisionWorld({ track });
    dynamics = await definition.createDynamics({ track, collisionWorld });
    const devices = definition.racing.createDevices(track);
    const cases = [
      ...track.jumps.map((jump) => ({ jump, fast: false })),
      ...[3, 7].map((index) => ({ jump: track.jumps[index], fast: true })),
    ];
    for (const { jump, fast } of cases)
      for (const quarter of [0, 1, 2, 3]) {
        const receiver = track.carriers.find(
          (carrier) => carrier.id === jump.receivingCarrierId,
        );
        dynamics.reset();
        const runtime = createDeviceRuntime({
          track,
          devices,
          motion: definition.createRuntime({ track, collisionWorld, dynamics }),
        });
        const state = {
          ...createVehicleState(),
          distance: jump.takeoff - 140,
          speed: fast ? 185 : jump.targetSpeed,
          time: (receiver.motion.period * quarter) / 4,
        };
        let previous = null,
          transferred = false;
        try {
          runtime.reset({ state });
          for (let tick = 0; tick < 800; tick++) {
            const input = getRacerControl(state, track, {
              lane: 0,
              difficulty: 'hard',
              devices,
              runtime,
            });
            const events = runtime.advance(
              state,
              { ...input, throttle: 1, brake: 0, boost: fast },
              1 / 120,
            );
            assert.ok(
              !events.some((event) =>
                ['jump-miss', 'road-departure', 'road-recovery'].includes(
                  event.type,
                ),
              ),
              jump.id,
            );
            const pose = runtime.pose(1);
            if (
              tick % 4 === 0 ||
              events.some((event) => event.type === 'jump-transfer')
            ) {
              const current = {
                position: pose.position.clone(),
                quaternion: pose.quaternion.clone(),
                time: state.time,
              };
              if (previous)
                for (const { carrier, world } of solids) {
                  const before = {
                    position: previous.position
                      .clone()
                      .sub(
                        sampleCarrierMotion(carrier, previous.time).translation,
                      ),
                    quaternion: previous.quaternion,
                  };
                  const after = {
                    position: current.position
                      .clone()
                      .sub(
                        sampleCarrierMotion(carrier, current.time).translation,
                      ),
                    quaternion: current.quaternion,
                  };
                  const hit = world.sweepHull(before, after, envelope);
                  assert.equal(
                    hit,
                    null,
                    `${jump.id}/phase${quarter}: a real work district enters flight/camera clearance`,
                  );
                }
              previous = current;
            }
            if (events.some((event) => event.type === 'jump-transfer')) {
              transferred = true;
              break;
            }
          }
          assert.equal(
            transferred,
            true,
            `${jump.id}/phase${quarter}: actual transfer happened`,
          );
          passes++;
        } finally {
          runtime.dispose();
        }
      }
    t.diagnostic(
      `${passes} real native moving-receiver flights cleared every carrier district`,
    );
  } finally {
    dynamics?.dispose();
    collisionWorld?.dispose();
    for (const { world } of solids) world.dispose();
    districts.dispose();
  }
});
