import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';

const track = createNomadTrack();
const degrees = 180 / Math.PI;

// Transfer mouths stay fixed so easing a supported run-up cannot move its
// flight, receiving deck or retained carrier architecture.
const transferAnchors = [
  [
    [0, 422.033028208907, 851.4582196821098],
    [24, 394.7034709487254, 952.4855501662639],
  ],
  [
    [84, 350.0313898735594, 1755.269124781747],
    [312, 128.94501213892957, 2176.48074912207],
  ],
  [
    [372, -13.692677004578073, 3193.2946712021135],
    [663, -200.2954997253393, 3630.5947039235643],
  ],
  [
    [663, -616.9593517628432, 5640.5726228085605],
    [625.5, -653.0765290512744, 5773.485550166264],
  ],
  [
    [625.5, -783.3725593121521, 6560.856813928323],
    [631.5, -816.9665290512744, 6683.985550166263],
  ],
  [
    [804, -754.2543676476705, 7250.048430782975],
    [1149, -1097.7509415332797, 7699.791602856565],
  ],
  [
    [1149, -1406.115260600718, 9497.599280759312],
    [1171.5, -1444.8604296690105, 9628.17764805507],
  ],
  [
    [1171.5, -1639.3744218191716, 10403.989678677059],
    [1137, -1673.7065290512746, 10526.985550166264],
  ],
  [
    [1137, -1800.3118718472506, 11315.021137672004],
    [1165.5, -1837.5965290512745, 11437.485550166264],
  ],
  [
    [1435.5, -1874.5919801994469, 12294.994638511305],
    [1702.5, -2199.86638334122, 12905.988501789567],
  ],
];

test('Nomad approach easing preserves all ten physical takeoff and receiving mouths', () => {
  assert.equal(track.jumps.length, transferAnchors.length);
  for (const [index, jump] of track.jumps.entries()) {
    const [takeoff, receiver] = transferAnchors[index];
    for (const [distance, expected] of [
      [jump.takeoff, takeoff],
      [jump.landingStart, receiver],
    ]) {
      assert.ok(
        track.positionAt(distance).distanceTo(new Vector3(...expected)) < 1e-7,
        `${jump.id}: physical transfer mouth moved`,
      );
    }
  }
});

test('each major Nomad transfer has a full 120 m bank-free straight at its retained launch angle', () => {
  const ramps = [
    [1, 13, 4],
    [2, 18.5, 2],
    [5, 13.5, 5.5],
    [9, 14.5, 0.5],
  ];
  for (const [index, yawDegrees, pitchDegrees] of ramps) {
    const jump = track.jumps[index];
    const yaw = yawDegrees / degrees;
    const pitch = pitchDegrees / degrees;
    const direction = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const right = track.sample(jump.takeoff - 60).right;
    // Stay one metre inside each join, beyond the sub-metre frame stencil.
    for (let beforeLip = 119; beforeLip >= 1; beforeLip -= 0.5) {
      const frame = track.sample(jump.takeoff - beforeLip);
      assert.ok(
        frame.tangent.angleTo(direction) < 0.001,
        `${jump.id}: launch angle changes ${beforeLip} m before its lip`,
      );
      assert.ok(
        Math.abs(frame.bank) < 1e-9,
        `${jump.id}: launch straight remains banked ${beforeLip} m before its lip`,
      );
      const expected = track
        .positionAt(jump.takeoff)
        .addScaledVector(direction, -beforeLip);
      assert.ok(
        frame.position.distanceTo(expected) < 0.01,
        `${jump.id}: the settled approach is not a physical straight`,
      );
      for (const lateral of [-15, 15]) {
        const surface = track.sampleSurface(jump.takeoff - beforeLip, lateral);
        assert.ok(
          surface.tangent.angleTo(direction) < 0.001,
          `${jump.id}: ${lateral} m lane changes its launch angle`,
        );
        assert.ok(
          surface.position.distanceTo(
            expected.clone().addScaledVector(right, lateral),
          ) < 0.01,
          `${jump.id}: ${lateral} m lane is not a parallel physical straight`,
        );
      }
    }
  }
});

function pitchAt(distance) {
  const chord = track
    .positionAt(distance + 2)
    .sub(track.positionAt(distance - 2));
  return Math.atan2(chord.y, Math.hypot(chord.x, chord.z)) * degrees;
}

test('the six eased Nomad approaches bound vertical pitch changes before the lip', () => {
  // Maximum slope change over 10 m in the final 300 m. These limits leave
  // deliberate climbs and descents while excluding the former sharp waves.
  const limits = [
    [1, 2.5],
    [2, 1.2],
    [5, 3],
    [7, 1.8],
    [8, 0.6],
    [9, 3],
  ];
  for (const [index, maximumChange] of limits) {
    const jump = track.jumps[index];
    let worst = 0;
    for (let beforeLip = 295; beforeLip >= 7; beforeLip -= 0.5) {
      const distance = jump.takeoff - beforeLip;
      worst = Math.max(
        worst,
        Math.abs(pitchAt(distance + 5) - pitchAt(distance - 5)),
      );
    }
    assert.ok(
      worst <= maximumChange,
      `${jump.id}: ${worst.toFixed(3)} degrees per 10 m exceeds ${maximumChange}`,
    );
  }
});

test('the two largest Nomad transfers ease their steep approach humps', () => {
  for (const [index, maximumPitch] of [
    [5, 16],
    [9, 23],
  ]) {
    const jump = track.jumps[index];
    for (let beforeLip = 300; beforeLip >= 3; beforeLip -= 0.5) {
      assert.ok(
        pitchAt(jump.takeoff - beforeLip) <= maximumPitch,
        `${jump.id}: vertical hump exceeds ${maximumPitch} degrees`,
      );
    }
  }
});
