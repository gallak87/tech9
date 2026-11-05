import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import createLevel from '../src/levels/nomad/index.js';
import {
  createNomadHallMachinery,
  NOMAD_HALL_GEOMETRY_VERSION,
} from '../src/levels/nomad/hall-machinery.js';
import { createNomadDistricts } from '../src/levels/nomad/districts.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { getRacerControl } from '../src/race/racers.js';
import { sampleCarrierMotion } from '../src/levels/nomad/motion.js';
import sourceHull from '../assets/levels/nomad/blender/carrier-collision.json' with { type: 'json' };

const definition = createLevel();

test('Crane Alley hoist borrows finish, packs a distinct connected role and preserves exact nominal collision faces', () => {
  const track = definition.createTrack(),
    carrier = track.carriers[8];
  const calls = [];
  const finish = {
    bind: (material, kind, projection) =>
      calls.push({ material, kind, projection }),
    dispose: () => assert.fail('the hall cannot dispose its borrowed finish'),
  };
  const hall = createNomadHallMachinery({ track, finish });
  const released = new Map();
  const materials = new Set();
  try {
    assert.equal(hall.geometryVersion, NOMAD_HALL_GEOMETRY_VERSION);
    assert.equal(hall.report.carrierId, carrier.id);
    assert.equal(hall.report.batches, 6);
    assert.ok(hall.report.triangles > 12000 && hall.report.triangles < 18000);
    assert.deepEqual(
      hall.report.assemblies.map((entry) => entry.name),
      ['feedRoll', 'driveGearbox', 'louverPanel', 'serviceDeck'],
    );
    assert.equal(calls.length, 5);
    assert.ok(calls.every((call) => call.projection === 'part'));
    const root = hall.group.children[0];
    assert.equal(root.userData.motionGroup, carrier.id);
    const nominal = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion,
      carrier.scale,
    );
    let index = 0;
    for (const record of hall.collisionRecords) {
      const mesh = root.children.find((entry) => entry.name === record.id);
      assert.equal(mesh.geometry, record.geometry);
      assert.ok(record.nominalMatrix.equals(nominal));
      const positions = mesh.geometry.attributes.position;
      mesh.geometry.addEventListener('dispose', () =>
        released.set(mesh.geometry, (released.get(mesh.geometry) ?? 0) + 1),
      );
      materials.add(mesh.material);
      for (let vertex = 0; vertex < positions.count; vertex += 3) {
        const triangle = hall.collisionTriangles[index++];
        assert.equal(triangle.motionGroup, carrier.id);
        for (let corner = 0; corner < 3; corner++) {
          const exact = new T.Vector3()
            .fromBufferAttribute(positions, vertex + corner)
            .applyMatrix4(nominal);
          assert.ok(
            exact.distanceTo(new T.Vector3(...triangle.points[corner])) < 1e-9,
          );
        }
      }
    }
    assert.equal(index, hall.report.triangles);
    for (const material of materials)
      material.addEventListener('dispose', () =>
        released.set(material, (released.get(material) ?? 0) + 1),
      );
    for (const time of [0, 11, 33]) {
      track.presentationTime = time;
      hall.update();
      assert.ok(
        root.position.distanceTo(
          carrier.origin
            .clone()
            .add(sampleCarrierMotion(carrier, time).translation),
        ) < 1e-10,
      );
      assert.ok(root.quaternion.equals(carrier.quaternion));
      assert.ok(root.scale.equals(carrier.scale));
    }
  } finally {
    hall.dispose();
    hall.dispose();
    hall.update();
  }
  assert.equal(hall.group.children.length, 0);
  assert.equal(released.size, 12);
  assert.ok([...released.values()].every((count) => count === 1));
  const shape = createNomadHallMachinery({ track, shape: true, finish });
  assert.equal(shape.group.children.length, 0);
  assert.equal(shape.collisionTriangles.length, 0);
  shape.dispose();
  shape.dispose();
});

test('six load-path saddles seat on actual retained hull triangles and the full road plus 25m stays clear', () => {
  const track = definition.createTrack(),
    carrier = track.carriers[8];
  const hall = createNomadHallMachinery({ track });
  const world = createCollisionWorld({
    id: 'nomad-hoist-clearance',
    version: 1,
    geometryId: hall.geometryVersion,
    triangles: hall.collisionTriangles,
  });
  try {
    assert.equal(hall.report.seats.length, 6);
    const hull = sourceHull.prototypes.find(
      (part) => part.name === 'nomad_carrier',
    );
    const a = new T.Vector3(),
      b = new T.Vector3(),
      c = new T.Vector3(),
      point = new T.Vector3();
    for (const seat of hall.report.seats) {
      const position = new T.Vector3(...seat.position);
      const ray = new T.Ray(
        position.clone().add(new T.Vector3(0, -1, 0)),
        new T.Vector3(0, 1, 0),
      );
      let nearest = Infinity;
      for (let index = 0; index < hull.indices.length; index += 3) {
        a.fromArray(hull.positions, hull.indices[index] * 3);
        b.fromArray(hull.positions, hull.indices[index + 1] * 3);
        c.fromArray(hull.positions, hull.indices[index + 2] * 3);
        const hit = ray.intersectTriangle(a, b, c, false, point);
        if (hit) nearest = Math.min(nearest, hit.distanceTo(position));
      }
      assert.ok(
        nearest < 1e-5,
        `${seat.position}: a real roof face carries the saddle`,
      );
    }
    assert.ok(hall.bounds.min.y >= 96 && hall.bounds.max.y < 126.81);
    assert.ok(hall.bounds.min.z >= 70 && hall.bounds.max.z <= 240);
    for (
      let distance = carrier.start;
      distance < carrier.end - 6;
      distance += 6
    ) {
      const from = track.sample(distance),
        to = track.sample(distance + 6);
      const hit = world.sweepHull(from, to, {
        halfWidth:
          Math.max(
            track.halfWidthAt(distance),
            track.halfWidthAt(distance + 6),
          ) + 25,
        halfLength: 25,
        hover: 25,
      });
      assert.equal(
        hit,
        null,
        `full-width road and 25m camera envelope at ${distance}`,
      );
    }
  } finally {
    world.dispose();
    hall.dispose();
  }
});

test('recorded driving-view rays reach the bronze working face before any gallery or load-frame obstruction', () => {
  const track = definition.createTrack(),
    carrier = track.carriers[8];
  const hall = createNomadHallMachinery({ track }),
    districts = createNomadDistricts({ track });
  const scene = new T.Group();
  scene.add(hall.group, districts.group);
  scene.updateMatrixWorld(true);
  const matrix = new T.Matrix4().compose(
    carrier.origin,
    carrier.quaternion,
    carrier.scale,
  );
  // These are source-frame camera positions from real +350/+500/+650 chase
  // captures. The previous low cradle and central gallery blocked these rays.
  const cameras = [
    [23.798, 73.528, -149.493],
    [-4.441, 73.004, -46.456],
    [-20.892, 70.074, 57.044],
  ];
  const target = new T.Vector3(4.4, 103.72, 127.4).applyMatrix4(matrix);
  try {
    for (const camera of cameras) {
      const origin = new T.Vector3(...camera).applyMatrix4(matrix);
      const ray = new T.Raycaster(
        origin,
        target.clone().sub(origin).normalize(),
        0,
        origin.distanceTo(target) + 1,
      );
      const first = ray.intersectObject(scene, true)[0];
      assert.equal(
        first?.object.material.name,
        'Worldkit / exposed machined alloy',
        `${camera}: the visible drum remains in front of its supporting enclosure`,
      );
    }
  } finally {
    hall.dispose();
    districts.dispose();
  }
});

test('eight actual native arrivals and full hall drives clear the hoist with a continuous 25m camera envelope', async (t) => {
  const track = definition.createTrack(),
    carrier = track.carriers[8];
  const hall = createNomadHallMachinery({ track });
  const solid = createCollisionWorld({
    id: 'nomad-hoist-camera',
    version: 1,
    geometryId: hall.geometryVersion,
    triangles: hall.collisionTriangles,
  });
  const base = definition.createCollisionWorld({ track });
  const collisionWorld = createCollisionWorld({
    id: 'nomad-hoist-native',
    version: 1,
    geometryId: `${base.rulesId}:${hall.geometryVersion}`,
    triangles: [
      ...base.triangles,
      ...(base.triangles.some((triangle) =>
        triangle.id.startsWith('Nomad / suspended hoist /'),
      )
        ? []
        : hall.collisionTriangles),
    ],
  });
  const dynamics = await definition.createDynamics({ track, collisionWorld });
  const devices = definition.racing.createDevices(track),
    jump = track.jumps[7];
  let passes = 0;
  try {
    for (const fast of [false, true])
      for (const quarter of [0, 1, 2, 3]) {
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
          time: (quarter * carrier.motion.period) / 4,
        };
        let previous = null,
          transferred = false,
          complete = false;
        try {
          runtime.reset({ state });
          for (let tick = 0; tick < 2200; tick++) {
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
              `phase${quarter}/fast${fast}: native carrier encounter remains supported`,
            );
            if (events.some((event) => event.type === 'jump-transfer'))
              transferred = true;
            const pose = runtime.pose(1);
            if (tick % 4 === 0) {
              const current = {
                position: pose.position
                  .clone()
                  .sub(sampleCarrierMotion(carrier, state.time).translation),
                quaternion: pose.quaternion.clone(),
              };
              if (previous)
                assert.equal(
                  solid.sweepHull(previous, current, {
                    halfWidth: 25,
                    halfLength: 25,
                    hover: 25,
                  }),
                  null,
                  `phase${quarter}/fast${fast}: actual swept flight/chase envelope clears machinery`,
                );
              previous = current;
            }
            if (transferred && state.distance > carrier.end - 145) {
              assert.equal(pose.grounded, true);
              complete = true;
              break;
            }
          }
          assert.ok(
            transferred && complete,
            `phase${quarter}/fast${fast}: land and drive through the whole hall`,
          );
          passes++;
        } finally {
          runtime.dispose();
        }
      }
    t.diagnostic(
      `${passes} native phase/speed arrivals and full-hall drives clear the exact machinery faces and 25m camera envelope`,
    );
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
    base.dispose();
    solid.dispose();
    hall.dispose();
  }
});
