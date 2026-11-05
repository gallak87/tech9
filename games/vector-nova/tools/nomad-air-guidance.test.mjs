import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { installNomadMotion } from '../src/levels/nomad/motion.js';
import {
  createNomadAirGuidance,
  NOMAD_AIR_GUIDANCE_RULES,
  sampleNomadAirCorridor,
} from '../src/levels/nomad/air-guidance.js';
import { forecastNomadPoweredArc } from '../src/levels/nomad/pilot.js';
import { vehicleHandling } from '../src/ships/catalog.js';

const makeTrack = () => installNomadMotion(createNomadTrack());
const near = (a, b, label) => assert.ok(a.distanceTo(b) < 1e-8, label);

test('major air corridors end on their declared moving receiver and preserve real empty gaps', () => {
  const track = makeTrack();
  const before = JSON.stringify({
    jumps: track.jumps,
    carriers: track.carriers.map((c) => [c.id, c.origin, c.scale]),
  });
  for (const jump of track.jumps.filter((entry) => entry.bigAir))
    for (const time of [-3, 0, 17, 39]) {
      const guide = sampleNomadAirCorridor(track, jump, time);
      assert.equal(guide.receiverId, jump.receivingCarrierId);
      assert.equal(track.carrierAt(guide.station).id, jump.receivingCarrierId);
      assert.ok(
        guide.station > jump.landingStart && guide.station < jump.landingEnd,
      );
      near(
        guide.to.position,
        track.frameAtTime(guide.station, time).position,
        'threshold stays on the visible moving deck',
      );
      near(
        guide.from.position,
        track.frameAtTime(jump.takeoff, time).position,
        'departure follows its own carrier',
      );
      const end = guide
        .at(1)
        .position.clone()
        .addScaledVector(new T.Vector3(0, 1, 0), -3);
      near(
        end,
        guide.to.position,
        'suspended corridor reaches the real threshold',
      );
      for (let i = 0; i <= 40; i++) {
        const sample = guide.at(i / 40);
        assert.ok(
          [...sample.position, ...sample.tangent, ...sample.right].every(
            Number.isFinite,
          ),
        );
        assert.ok(sample.halfWidth >= 31 && sample.halfWidth <= 70);
        assert.ok(Math.abs(sample.right.dot(sample.tangent)) < 1e-9);
      }
    }
  assert.equal(
    JSON.stringify({
      jumps: track.jumps,
      carriers: track.carriers.map((c) => [c.id, c.origin, c.scale]),
    }),
    before,
    'visual guidance never rewrites the route, receivers or physical gap',
  );
  const hero = track.jumps.find((jump) => jump.hero);
  assert.throws(
    () =>
      sampleNomadAirCorridor(track, {
        ...hero,
        receivingCarrierId: hero.departureCarrierId,
      }),
    /supported receiver/,
    'a nearby wrong convoy cannot silently become the target',
  );
});

test('moving one receiver moves its threshold, never the launch or a neighboring corridor', () => {
  const track = makeTrack();
  const hero = track.jumps.find((jump) => jump.hero);
  const other = track.jumps.find((jump) => jump.bigAir && jump.id !== hero.id);
  const receiver = track.carriers.find(
    (carrier) => carrier.id === hero.receivingCarrierId,
  );
  const before = sampleNomadAirCorridor(track, hero, 18);
  const neighbor = sampleNomadAirCorridor(track, other, 18);
  receiver.motion = {
    ...receiver.motion,
    longitudinalAmplitude: receiver.motion.longitudinalAmplitude + 30,
  };
  const after = sampleNomadAirCorridor(track, hero, 18, before.station);
  near(
    before.from.position,
    after.from.position,
    'another carrier does not pull the departure',
  );
  assert.ok(after.to.position.distanceTo(before.to.position) > 1);
  near(
    sampleNomadAirCorridor(track, other, 18, neighbor.station).to.position,
    neighbor.to.position,
    'unrelated receiver remains fixed',
  );
});

test('navigation height follows the existing powered flight forecast before meeting the current deck', () => {
  const track = makeTrack();
  const speed = NOMAD_AIR_GUIDANCE_RULES.referenceSpeed;
  for (const jump of track.jumps.filter((entry) => entry.bigAir)) {
    const guide = sampleNomadAirCorridor(track, jump, 17);
    const vertical = guide.from.tangent.y * speed;
    const arc = forecastNomadPoweredArc(
      Math.sqrt(speed * speed - vertical * vertical),
      vertical + track.motionAt(jump.takeoff, 17).velocity.y,
      100,
      vehicleHandling({ shipId: 'kestrel' }),
      Infinity,
      false,
    );
    for (const seconds of [1, 2, 3]) {
      const expected =
        guide.from.position.y +
        arc.at(seconds).height +
        NOMAD_AIR_GUIDANCE_RULES.railLift;
      assert.ok(
        Math.abs(guide.at(seconds / guide.duration).position.y - expected) <
          0.1,
        `${jump.id}: lights follow real powered vertical progression at ${seconds}s`,
      );
    }
  }
});

test('airborne lights belong to the next authored jump while a landed runway can remain visible', () => {
  const track = makeTrack();
  const jump = track.jumps.find((entry) => entry.bigAir);
  const guidance = createNomadAirGuidance({ track, jumpIds: [jump.id] });
  const previous = track.jumps[track.jumps.indexOf(jump) - 1];
  const visible = () => guidance.group.userData.nomadAirGuidance.jumps;
  try {
    track.presentationTime = 12;
    assert.ok(
      previous,
      'fixture includes a small hop before the first major jump',
    );
    assert.ok(
      jump.takeoff - previous.takeoff <
        NOMAD_AIR_GUIDANCE_RULES.approachDistance,
    );
    guidance.update({
      mode: 'racing',
      state: { distance: previous.takeoff - 20 },
    });
    assert.deepEqual(
      visible(),
      [],
      'later big-air lights cannot lead past the small hop',
    );
    guidance.update({ mode: 'racing', state: { distance: jump.takeoff - 45 } });
    assert.deepEqual(
      visible()
        .filter((entry) => entry.aerial)
        .map((entry) => entry.id),
      [jump.id],
    );
    const flyingCount = guidance.group.children[1].count;
    guidance.update({
      mode: 'racing',
      state: { distance: jump.landingStart + 100 },
    });
    assert.equal(
      visible().find((entry) => entry.id === jump.id)?.aerial,
      false,
      'touchdown removes the completed airborne arc even at the same presentation phase',
    );
    assert.ok(
      guidance.group.children[1].count > 0 &&
        guidance.group.children[1].count < flyingCount,
      'receiver edge and threshold lights remain after the airborne strings leave',
    );
    guidance.update({
      mode: 'racing',
      state: { distance: jump.landingEnd + 121 },
    });
    assert.ok(
      !visible().some((entry) => entry.id === jump.id),
      'completed receiver stops contributing lights',
    );
  } finally {
    guidance.dispose();
  }
});

test('bounded two-draw guide geometry is steady through pause, seek, low quality and reduced motion', () => {
  const track = makeTrack();
  const jump = track.jumps.find((entry) => entry.hero);
  const guidance = createNomadAirGuidance({ track, jumpIds: [jump.id] });
  const meshes = guidance.group.children;
  const matrices = () =>
    meshes.map((mesh) =>
      Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)),
    );
  try {
    assert.equal(meshes.length, 2);
    assert.ok(
      meshes.every(
        (mesh) =>
          mesh.isInstancedMesh &&
          !mesh.castShadow &&
          !mesh.receiveShadow &&
          !mesh.material.transparent,
      ),
    );
    assert.equal(
      guidance.group.children.some((node) => node.isLight),
      false,
    );
    track.presentationTime = 12;
    guidance.update({
      mode: 'racing',
      state: { distance: jump.takeoff - 200 },
    });
    const held = matrices();
    assert.ok(meshes.every((mesh) => mesh.count > 0 && mesh.count < 420));
    assert.ok(held.flat().every(Number.isFinite));
    guidance.update({
      mode: 'paused',
      state: { distance: jump.takeoff - 200 },
      settings: { quality: 'low', reducedMotion: true },
    });
    assert.deepEqual(
      matrices(),
      held,
      'pause and reduced motion do not animate navigation',
    );
    track.presentationTime = 19;
    guidance.update({
      mode: 'racing',
      state: { distance: jump.takeoff - 200 },
    });
    assert.notDeepEqual(
      matrices(),
      held,
      'the field follows real convoy motion',
    );
    track.presentationTime = 12;
    guidance.update({
      mode: 'racing',
      state: { distance: jump.takeoff - 200 },
    });
    assert.deepEqual(
      matrices(),
      held,
      'seek restores exact phase without particle history',
    );
    guidance.update({ mode: 'racing', state: { distance: 0 } });
    assert.ok(meshes.every((mesh) => mesh.count === 0));
    assert.equal(
      guidance.group.visible,
      false,
      'ordinary distant stretches stay visually quiet',
    );
  } finally {
    guidance.dispose();
  }
});

test('all four major guides fit their bounded batches and dispose once without borrowed assets', () => {
  const track = makeTrack();
  const guidance = createNomadAirGuidance({ track });
  const expected = track.jumps
    .filter((jump) => jump.bigAir)
    .map((jump) => jump.id);
  assert.equal(
    expected.length,
    4,
    'production rollout covers all four major transfers',
  );
  for (const phase of [-3, 0, 17, 39]) {
    track.presentationTime = phase;
    guidance.update({ mode: 'overview' });
    const report = guidance.group.userData.nomadAirGuidance;
    assert.deepEqual(
      report.jumps.map((jump) => jump.id),
      expected,
    );
    assert.ok(
      guidance.group.children.every(
        (mesh) => mesh.count > 0 && mesh.count <= report.capacity,
      ),
      'even a complete overview keeps every major guide within the two allocated batches',
    );
  }
  const resources = new Set(
    guidance.group.children.flatMap((mesh) => [mesh.geometry, mesh.material]),
  );
  const counts = new Map([...resources].map((resource) => [resource, 0]));
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  guidance.dispose();
  guidance.dispose();
  assert.ok([...counts.values()].every((count) => count === 1));
});
