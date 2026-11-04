import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { assertTrackContract } from './level-checks/track-contract.mjs';

const track = createNomadTrack();

test('Nomad is a physical 12.8 km open sprint with a supported 600 m finish runout', () => {
  assert.equal(track.closed, false);
  assert.equal(track.length, 12800);
  assert.equal(track.finishDistance, 12200);
  assert.equal(track.length - track.finishDistance, 600);
  assert.equal(track.mainWidth, 50);
  assert.equal(track.version, 2);
  assertTrackContract(track);
  const descent =
    track.sample(0).position.y - track.sample(track.finishDistance).position.y;
  assert.ok(descent > 900, 'the race physically descends about a kilometre');
  assert.ok(
    descent / track.finishDistance >= 0.08 &&
      descent / track.finishDistance <= 0.1,
    'an actual 8–10% net descent, independent of presentation or speed tuning',
  );
  for (let s = track.finishDistance; s <= track.length; s += 2) {
    assert.equal(track.surfaceCoverage(s, 0), 1, `runout at ${s}`);
    assert.equal(track.carrierAt(s).id, track.carriers.at(-1).id);
  }
  for (const distance of [-60, -48, -24, 0]) {
    assert.equal(
      track.surfaceCoverage(distance, 0),
      1,
      'real starting stern supports the full grid',
    );
    const frame = track.sampleSurface(distance, 0);
    assert.ok(Math.abs(frame.longitudinalMetric - 1) < 0.001);
  }
  assert.ok(
    track
      .sample(track.length + 500)
      .position.equals(track.sample(track.length).position),
  );
  assert.ok(track.sampleSurface(track.length + 500).up.lengthSq() > 0.999999);
});

test('eleven enormous moving-support owners retain long grounded routes and genuine gaps', () => {
  assert.equal(track.carriers.length, 11);
  assert.equal(track.jumps.length, 10);
  assert.ok(track.carriers.every((carrier) => carrier.length > 850));
  assert.ok(track.carriers.every((carrier) => carrier.width > 140));
  let supported = 0;
  for (const run of track.roadRuns) {
    supported += run.end - Math.max(0, run.start);
    assert.ok(
      run.end - Math.max(0, run.start) >= 550,
      `${run.id}: no stepping-stone deck`,
    );
    const owner = track.carriers.find(
      (carrier) => carrier.id === run.carrierId,
    );
    assert.ok(owner);
    assert.equal(
      track.carrierAt((Math.max(0, run.start) + run.end) / 2),
      owner,
    );
  }
  assert.ok(
    supported / track.length > 0.8,
    'the race is predominantly supported driving',
  );
  for (const jump of track.jumps) {
    assert.ok(jump.landingStart - jump.takeoff > 90);
    assert.ok(jump.landingEnd - jump.landingStart >= 449);
    assert.equal(track.isGap((jump.takeoff + jump.landingStart) / 2), true);
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2, 0),
      0,
    );
    assert.equal(track.surfaceCoverage(jump.takeoff, 0), 1);
    assert.equal(track.surfaceCoverage(jump.landingStart, 0), 1);
    assert.equal(track.carrierAt(jump.takeoff).id, jump.departureCarrierId);
    assert.equal(
      track.carrierAt(jump.landingStart).id,
      jump.receivingCarrierId,
    );
    assert.ok(
      track.halfWidthAt(jump.landingStart + 40) >= 39.9,
      'wide actual receiver',
    );
  }
});

test('the signature transfer joins overlapping side-by-side carriers without wheel-envelope overlap', () => {
  const jump = track.jumps.find((entry) => entry.hero);
  assert.ok(jump);
  const departure = track.carriers.find(
      (carrier) => carrier.id === jump.departureCarrierId,
    ),
    receiver = track.carriers.find(
      (carrier) => carrier.id === jump.receivingCarrierId,
    );
  const axialSeparation = receiver.origin.z - departure.origin.z;
  assert.ok(
    axialSeparation < (departure.length + receiver.length) / 2,
    'the next enormous hull overtakes alongside',
  );
  assert.ok(
    Math.abs(receiver.origin.x - departure.origin.x) >
      (departure.tireWidth + receiver.tireWidth) / 2 + 30,
  );
  const from = track.sample(jump.takeoff).position,
    to = track.sample(jump.landingStart).position;
  assert.ok(to.x - from.x > 60, 'the transfer is genuinely diagonal');
  assert.ok(to.z - from.z > 60);
  assert.ok(from.y > to.y, 'the broad receiver is lower and visible');
  const wall = track.sections.find((section) => section.id === departure.id);
  let sustainedWall = 0;
  for (let s = wall.start; s < jump.takeoff; s += 1)
    if (Math.abs(track.sample(s).bank) > 0.85) sustainedWall++;
  assert.ok(
    sustainedWall > 60,
    'a substantial exterior wall ride precedes commitment',
  );
});

test('four substantial unsupported gaps use rising physical ramps and open roof catches', () => {
  assert.equal(track.jumps.filter((jump) => jump.bigAir).length, 4);
  for (const jump of track.jumps) {
    const lip = track.sample(jump.takeoff),
      approach = track.sample(jump.takeoff - 80),
      receiver = track.sample(jump.landingStart);
    if (jump.bigAir) {
      assert.ok(
        lip.tangent.y > 0.18 && lip.tangent.y < 0.3,
        `${jump.id}: a visible 10–17 degree launch ramp`,
      );
      assert.ok(
        lip.position.y - approach.position.y > 12,
        `${jump.id}: the actual last 80 m rise before release`,
      );
      assert.ok(
        jump.landingStart - jump.takeoff > 280,
        `${jump.id}: several hundred metres are genuinely unsupported`,
      );
      assert.ok(
        track.carriers.find((carrier) => carrier.id === jump.receivingCarrierId)
          .mode !== 'cargo',
        `${jump.id}: high arcs arrive on an open upper deck`,
      );
    } else {
      assert.ok(
        Math.abs(lip.tangent.y) < 0.1,
        `${jump.id}: cargo entries remain low and clear their real ceilings`,
      );
    }
    assert.ok(
      lip.position.y > receiver.position.y + 15,
      `${jump.id}: a broad lower receiver remains in view`,
    );
    assert.equal(track.surfaceCoverage(jump.takeoff - 0.1, 0), 1);
    assert.equal(track.surfaceCoverage(jump.takeoff + 0.1, 0), 0);
  }
});

test('winding cargo, roof and wall roads remain regular across their full width', () => {
  let minimumRadius = Infinity,
    minimumMetric = Infinity,
    climb = 0,
    descent = 0;
  for (let s = 2; s < track.length - 2; s += 2) {
    if ([s - 2, s, s + 2].some((distance) => track.isGap(distance))) continue;
    const turn = track
      .sample(s - 1)
      .tangent.angleTo(track.sample(s + 1).tangent);
    if (turn > 1e-8) minimumRadius = Math.min(minimumRadius, 2 / turn);
    const width = track.halfWidthAt(s);
    for (const x of [-width, 0, width]) {
      const frame = track.sampleSurface(s, x);
      minimumMetric = Math.min(minimumMetric, frame.longitudinalMetric);
      assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-7);
      assert.ok(Math.abs(frame.tangent.dot(frame.up)) < 1e-7);
      assert.ok(frame.position.distanceTo(track.pointAt(s, x)) < 1e-8);
      assert.ok(
        frame.longitudinalMetric > 0.4,
        'wide skins never fold inside-out at a bend',
      );
    }
    if (track.sample(s).tangent.y > 0.2) climb += 2;
    if (track.sample(s).tangent.y < -0.18) descent += 2;
  }
  assert.ok(
    minimumRadius > 40,
    `minimum supported centreline radius ${minimumRadius}`,
  );
  assert.ok(minimumMetric > 0.4);
  assert.ok(climb > 100, 'real moderate climbs accompany the faster descent');
  assert.ok(descent > 180, 'real supported drops accompany the hull climbs');
});

test('the complete road width clears each hull roof and uses its real lateral cargo openings', () => {
  for (const carrier of track.carriers) {
    const inverse = carrier.quaternion.clone().invert();
    for (let distance = carrier.start; distance <= carrier.end; distance += 2) {
      const half = track.halfWidthAt(distance);
      for (const lateral of [-half, 0, half]) {
        const local = track
          .pointAt(distance, lateral)
          .sub(carrier.origin)
          .applyQuaternion(inverse)
          .divide(carrier.scale);
        assert.ok(
          local.y > 50,
          `${carrier.id}: road remains above the chassis`,
        );
        const roofIntersection =
          local.y > 127 && local.y < 131 && Math.abs(local.x) < 88;
        assert.equal(
          roofIntersection,
          false,
          `${carrier.id}: the road must not cut through the roof`,
        );
        const inWindow =
          Math.abs(local.z + 220) < 61 || Math.abs(local.z - 220) < 61;
        const wallIntersection =
          Math.abs(local.x) > 68 &&
          Math.abs(local.x) < 92 &&
          local.y >= 54 &&
          local.y < 128 &&
          !inWindow;
        assert.equal(
          wallIntersection,
          false,
          `${carrier.id}: side crossing must use a real portal`,
        );
        if (
          carrier.mode === 'cargo' &&
          !(carrier.id === 'nomad-saltwind' && local.z >= 159)
        )
          assert.ok(
            Math.abs(local.x) < 55,
            `${carrier.id}: cargo roads fit inside the open hall`,
          );
      }
    }
  }
});

test('static carrier pitch seats all longitudinal wheel contacts on the same salt plane', () => {
  for (const carrier of track.carriers)
    for (const x of [-100, 100])
      for (const z of [-340, 0, 340]) {
        const contact = new Vector3(x, 0, z)
          .multiply(carrier.scale)
          .applyQuaternion(carrier.quaternion)
          .add(carrier.origin);
        const saltHeight =
          track.saltPlane.height - track.saltPlane.grade * contact.z;
        assert.ok(
          Math.abs(contact.y - saltHeight) < 1e-8,
          `${carrier.id}: wheel contact floats above salt`,
        );
      }
});
