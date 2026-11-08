import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLaunchworksTrack } from './model.js';
import { createLaunchworksRoad } from './road.js';
import { createLaunchworksDevices } from '../devices.js';
import { createCameraRig } from '../../../camera/index.js';
import { createVehicleState } from '../../../physics/index.js';

const angle = (a, b) => Math.acos(T.MathUtils.clamp(a.dot(b), -1, 1));

test('Skywell has five distinct launch and receiving problems rather than repeated straight aprons', () => {
  const track = createLaunchworksTrack();
  assert.equal(track.jumps.length, 5);
  assert.equal(new Set(track.jumps.map((jump) => jump.label)).size, 5);
  assert.deepEqual(
    track.jumps.map((jump) => jump.receiverType),
    ['bank', 'shelf', 'tube', 'bank', 'curve'],
  );
  const fourth = track.jumps[3];
  const roll = track.routeMoments.find((moment) => moment.type === 'corkscrew');
  assert.ok(
    track
      .sample(roll.start)
      .up.dot(track.sample((roll.start + roll.end) / 2).up) < -0.9,
  );
  const hook = track.routeMoments.find((moment) => moment.id === 'hook-right');
  assert.ok(
    angle(track.sample(hook.start).tangent, track.sample(hook.end).tangent) >
      0.7,
  );
  assert.ok(
    new T.Vector3().crossVectors(
      track.sample(hook.start).tangent,
      track.sample(hook.end).tangent,
    ).y < -0.6,
    'the hook still turns towards driver right',
  );
  for (const index of [0, 1, 4]) {
    const jump = track.jumps[index],
      release = track.sample(jump.takeoff - 2);
    for (let before = 170; before >= 10; before -= 20) {
      const frame = track.sample(jump.takeoff - before);
      assert.ok(
        angle(frame.tangent, release.tangent) < 0.01,
        `${jump.label}: steady release pitch and heading`,
      );
      assert.ok(
        angle(frame.up, release.up) < 0.01,
        `${jump.label}: steady release bank`,
      );
    }
  }
  for (const id of ['bell-plunge', 'last-light-dive']) {
    const dive = track.routeMoments.find((moment) => moment.id === id);
    assert.ok(
      track.sample((dive.start + dive.end) / 2).tangent.y < -0.25,
      'gravity dives still precede their stable launch run',
    );
  }
  const departure = track.sample(fourth.takeoff),
    arrival = track.sample(fourth.target);
  assert.ok(
    angle(departure.up, arrival.up) > 0.95,
    'the wall release demands a real bank reversal',
  );
  for (const jump of track.jumps) {
    assert.ok(
      jump.catchWidth >= 30,
      'arrival credit is not an invisible five-metre stripe',
    );
    assert.ok(
      jump.landingStart - jump.takeoff >= 600,
      'every transfer has a substantial open-air gap',
    );
    assert.ok(
      jump.landingEnd - jump.landingStart >= 530,
      'the receiving deck leaves room to settle',
    );
    assert.ok(jump.approachHint && jump.receiverHint && jump.speedHint);
    assert.ok(
      jump.speedRange[1] > jump.speedRange[0] &&
        jump.speedRange[1] - jump.speedRange[0] >= 20,
      'the suggested launch band leaves a human speed window',
    );
    assert.equal(track.isGap(jump.takeoff + 1), true);
    assert.equal(track.isGap(jump.landingStart + 1), false);
    assert.equal(
      track.isGap(
        track.scenarios[`jump${track.jumps.indexOf(jump) + 1}-approach`]
          .distance,
      ),
      false,
    );
  }
});

test('powered entries and gravity dives keep a genuine speed-setting approach', () => {
  const track = createLaunchworksTrack(),
    devices = createLaunchworksDevices(track);
  assert.equal(devices.length, 3);
  for (const device of devices) {
    assert.equal(device.type, 'vector');
    assert.equal(track.isGap(device.distance), false);
    const next = track.jumps.find((jump) => jump.takeoff > device.distance);
    assert.ok(next.takeoff - device.distance - device.length / 2 > 100);
    const practice =
      track.scenarios[`jump${track.jumps.indexOf(next) + 1}-approach`];
    assert.ok(
      practice.distance < device.distance - device.length / 2,
      'practice includes the real powered setup rather than starting after its strip',
    );
  }
  for (const index of [1, 4]) {
    const jump = track.jumps[index];
    assert.ok(
      !devices.some(
        (device) =>
          device.distance > jump.takeoff - 320 &&
          device.distance < jump.takeoff,
      ),
    );
  }
});

test('short receiving tube uses the same finite surface chart and exact facets as its visible deck', () => {
  const track = createLaunchworksTrack(),
    tube = track.tubes[0],
    middle = (tube.entryEnd + tube.exitStart) / 2;
  const floor = track.sampleSurface(middle, 0),
    wall = track.sampleSurface(middle, (Math.PI * tube.radius) / 2),
    ceiling = track.sampleSurface(middle, Math.PI * tube.radius);
  assert.equal(floor.period, Math.PI * 2 * tube.radius);
  assert.ok(
    Math.abs(
      wall.position.distanceTo(floor.position) - Math.SQRT2 * tube.radius,
    ) < 0.05,
  );
  assert.ok(floor.up.dot(ceiling.up) < -0.999);
  assert.ok(
    Math.abs(
      ceiling.position.clone().sub(floor.position).dot(floor.up) -
        2 * tube.radius,
    ) < 0.05,
  );
  assert.equal(track.sampleSurface(tube.start - 1, 0), null);
  const road = createLaunchworksRoad({ track, shape: true });
  try {
    const skins = road.group.children.filter((mesh) =>
      mesh.name.startsWith('Tube driving shell'),
    );
    assert.ok(skins.length > 2);
    for (const skin of skins) {
      assert.equal(skin.userData.drivingSurface, true);
      const p = skin.geometry.attributes.position,
        c = skin.geometry.attributes.roadCoord;
      for (let i = 0; i < p.count; i += 137) {
        const distance = T.MathUtils.clamp(c.getX(i), tube.start, tube.end);
        const surface = track.sampleSurface(distance, c.getY(i));
        assert.ok(
          surface.position.distanceTo(
            new T.Vector3().fromBufferAttribute(p, i),
          ) < 0.002,
        );
      }
    }
  } finally {
    road.dispose();
  }
});

test('an open start supplies a chase view behind the stationary racer', () => {
  const track = createLaunchworksTrack(),
    start = track.sample(0);
  assert.ok(
    track.sample(-18).position.clone().sub(start.position).dot(start.tangent) <
      -17.9,
  );
  const camera = new T.PerspectiveCamera(61, 16 / 9, 0.1, 24000),
    rig = createCameraRig(camera, {
      chaseHeight: 6.5,
      chaseDistance: 18,
      lookAhead: 55,
    });
  rig.update(track, createVehicleState('shrike'), 1 / 60);
  assert.ok(
    camera.position.clone().sub(start.position).dot(start.tangent) < -15,
  );
  assert.ok(camera.getWorldDirection(new T.Vector3()).dot(start.tangent) > 0.9);
});
