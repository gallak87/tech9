import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createTrack } from '../track/index.js';
import {
  createRouteClearance,
  groundFrame,
  precinctLayout,
} from './placement.js';

function straight(grade = 0, roll = 0) {
  const tangent = new Vector3(0, Math.sin(grade), Math.cos(grade));
  const rotation = new Quaternion().setFromAxisAngle(tangent, roll);
  const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
  const up = new Vector3().crossVectors(tangent, right);
  return {
    length: 80,
    width: 28,
    groundY: -78,
    sample: (distance) => ({
      position: new Vector3(0, 100, 0).addScaledVector(tangent, distance),
      tangent,
      right,
      up,
    }),
  };
}

test('inverted racing clearance rejects a roof that fits beneath an upright deck', () => {
  const upright = createRouteClearance(straight());
  const inverted = createRouteClearance(straight(0, Math.PI));
  assert.equal(upright.clears(0, 40, 12, 12, 80), true);
  assert.equal(inverted.clears(0, 40, 12, 12, 80), false);
  assert.equal(inverted.clears(90, 40, 12, 12, 120), true);
});

test('sideways deck clearance includes the vertical sweep of its full width', () => {
  const upright = createRouteClearance(straight());
  const sideways = createRouteClearance(straight(0, Math.PI / 2));
  assert.equal(upright.clears(0, 40, 12, 12, 76), true);
  assert.equal(sideways.clears(0, 40, 12, 12, 76), false);
});

test('city roofs and rotated footprints keep clear of grounded outside supports', () => {
  const track = straight();
  track.supportFootprints = [
    { x: 80, z: 40, halfX: 3, halfZ: 4, minY: -78, maxY: 140 },
  ];
  const clearance = createRouteClearance(track);
  assert.equal(clearance.clears(80, 40, 12, 12, 20), false);
  assert.equal(clearance.clears(94, 40, 12, 36, 20, Math.PI / 2), false);
  assert.equal(clearance.clears(106, 40, 12, 36, 20, Math.PI / 2), true);
  assert.equal(clearance.clears(80, 40, 12, 12, 180, 0, 150), true);
});

test('ground infrastructure keeps the same horizontal frame through inversion and steep grade', () => {
  const upright = groundFrame(straight(), 40);
  const inverted = groundFrame(straight(0, Math.PI), 40);
  const steep = groundFrame(straight((-68 * Math.PI) / 180, Math.PI), 40);
  assert.deepEqual(inverted.right, upright.right);
  assert.deepEqual(steep.right, upright.right);
  for (const frame of [upright, inverted, steep]) {
    assert.equal(frame.right.y, 0);
    assert.equal(frame.tangent.y, 0);
    assert.equal(frame.tangent.length(), 1);
    assert.deepEqual(frame.up, new Vector3(0, 1, 0));
  }
});

test('actual distributed events reserve city corridors while ground sites stay upright', () => {
  const track = createTrack();
  const clearance = createRouteClearance(track);
  const namedScenarios = [
    'bank',
    'signature-entry',
    'signature-inverted',
    'signature-drop',
    'signature-exit',
  ].map((name) => [name, track.scenarios[name].distance]);
  const eventPoses = track.featureZones.map((zone) => [zone.id, zone.peak]);
  for (const [name, distance] of [...namedScenarios, ...eventPoses]) {
    const frame = track.sample(distance);
    assert.equal(
      clearance.clears(
        frame.position.x,
        frame.position.z,
        14,
        14,
        frame.position.y + 3,
      ),
      false,
      `tower through ${name}`,
    );
    const site = groundFrame(track, distance);
    assert.equal(Math.abs(site.tangent.y), 0, name);
    assert.equal(Math.abs(site.right.y), 0, name);
    assert.ok(site.up.y > 0.999, name);
  }
  const inverted = track.sample(track.scenarios['signature-inverted'].distance);
  assert.ok(inverted.up.y < -0.98);
  assert.equal(
    clearance.clears(
      inverted.position.x,
      inverted.position.z,
      14,
      14,
      inverted.position.y - 18,
    ),
    false,
    'roof beneath inverted racing surface',
  );
});

test('precinct bridges and civic sites remain within their authored districts after pacing changes', () => {
  const track = createTrack();
  const layout = precinctLayout(track);
  const start = track.sections.find((section) => section.id === 'start');
  const bank = track.sections.find((section) => section.id === 'bank');
  const returning = track.sections.find((section) => section.id === 'return');
  assert.ok(layout.from > returning.start && layout.from < returning.end);
  assert.ok(layout.to > track.length + bank.start);
  assert.ok(layout.to < track.length + bank.end);
  for (const distance of layout.bridgeDistances)
    assert.ok(distance > layout.from && distance < layout.to);
  assert.ok(
    layout.hallDistance > returning.start &&
      layout.hallDistance < returning.end,
  );
  assert.ok(
    layout.concourseDistance > start.start &&
      layout.concourseDistance < start.end,
  );
  const hallFrame = groundFrame(track, layout.hallDistance);
  const hallSite = hallFrame.position
    .clone()
    .addScaledVector(hallFrame.right, layout.hallOffset);
  assert.equal(
    createRouteClearance(track).clears(
      hallSite.x,
      hallSite.z,
      68,
      140,
      track.groundY + 32,
      Math.atan2(hallFrame.tangent.x, hallFrame.tangent.z),
    ),
    true,
    'civic hall must clear road decks and complete support columns',
  );
});
