import * as T from 'three';
import { createTubeSurface } from '../../shatterline/track/tube-surface.js';

const WIDTH = 44;
const clamp = T.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const interpolate = (knots, station) => {
  if (station <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [end, b] = knots[i],
      [start, a] = knots[i - 1];
    if (station <= end)
      return T.MathUtils.lerp(a, b, smooth((station - start) / (end - start)));
  }
  return knots.at(-1)[1];
};
function heightAt(knots, station) {
  let i = 1;
  while (i < knots.length - 1 && station > knots[i][0]) i++;
  const [a, ya, slopeA] = knots[i - 1],
    [b, yb, slopeB] = knots[i],
    t = clamp((station - a) / (b - a), 0, 1),
    span = b - a;
  return (
    (2 * t ** 3 - 3 * t * t + 1) * ya +
    (t ** 3 - 2 * t * t + t) * span * slopeA +
    (-2 * t ** 3 + 3 * t * t) * yb +
    (t ** 3 - t * t) * span * slopeB
  );
}

// Five different pieces of flight architecture. The launch vectors come from
// the real driven road; no target-seeking force steers a racer across a gap.
export function createSkywellTrack() {
  const sourceLips = [650, 2050, 3450, 4850, 6250];
  // Add space to the actual flight corridors and a smaller amount to each
  // receiving runout. Grounded setups retain their authored turns and rolls.
  const spans = [
    [650, 900, 650],
    [900, 1350, 600],
    [2050, 2400, 620],
    [2400, 2830, 550],
    [3450, 3770, 620],
    [3770, 4200, 530],
    [4850, 5130, 620],
    [5130, 5630, 690],
    [6250, 6590, 700],
    [6590, 7030, 560],
  ];
  function expandedStation(source) {
    let extra = 0;
    for (const [start, end, span] of spans) {
      if (source <= start) break;
      const fraction = clamp((source - start) / (end - start), 0, 1);
      extra += fraction * (span - (end - start));
    }
    return source + extra;
  }
  const knots = (values) =>
    values.map(([source, ...value]) => [expandedStation(source), ...value]);
  const lips = sourceLips.map(expandedStation);
  const definitions = [
    {
      label: 'Crown Hook',
      releaseLength: 180,
      receiverType: 'bank',
      approachHint: 'Finish the right hook · hold the launch lane',
      receiverHint: 'Catch the right bank',
      speedHint: 'Bleed speed after the powered entry',
      speedRange: [145, 195],
      gap: 650,
      end: 1250,
      target: 980,
    },
    {
      label: 'Bell Dive',
      releaseLength: 180,
      receiverType: 'shelf',
      approachHint: 'Brake the dive · settle before the edge',
      receiverHint: 'Climb into the left shelf',
      speedHint: 'Gravity supplies speed · brake early',
      speedRange: [125, 180],
      gap: 620,
      end: 1170,
      target: 880,
    },
    {
      label: 'Veil Bore',
      receiverType: 'tube',
      approachHint: 'Sight the lanterns before the veil',
      receiverHint: 'Enter the open tube floor',
      speedHint: 'Carry speed into the mouth',
      speedRange: [150, 195],
      gap: 620,
      end: 1150,
      target: 820,
    },
    {
      label: 'Counterbank',
      receiverType: 'bank',
      approachHint: 'Release from the wall · reverse roll',
      receiverHint: 'Catch the opposing bank',
      speedHint: 'Hold the wall line until release',
      speedRange: [150, 195],
      gap: 620,
      end: 1310,
      target: 960,
    },
    {
      label: 'Last Light',
      releaseLength: 180,
      receiverType: 'curve',
      approachHint: 'Finish the dive · hold the falling launch line',
      receiverHint: 'Settle into the falling curve',
      speedHint: 'A controlled dive beats full boost',
      speedRange: [125, 180],
      gap: 700,
      end: 1260,
      target: 940,
    },
  ];
  const heights = knots([
    [0, 1430, 0],
    [150, 1440, 0.12],
    [390, 1468.8, 0.12],
    [650, 1500, 0.12],
    [900, 1400, -0.12],
    [1350, 1380, -0.02],
    [1600, 1390, -0.38],
    [1870, 1311.6, -0.12],
    [2050, 1290, -0.12],
    [2400, 965, -0.16],
    [2670, 945, 0.03],
    [2830, 970, 0.06],
    [3270, 1060, 0.08],
    [3450, 1080, 0.12],
    [3770, 1000, -0.08],
    [4200, 988, -0.02],
    [4690, 890, 0.05],
    [4850, 910, 0.14],
    [5130, 840, -0.12],
    [5630, 810, -0.02],
    [5800, 800, -0.4],
    [6070, 718, -0.1],
    [6250, 700, -0.1],
    [6590, 310, -0.12],
    [7030, 305, 0.04],
    [7600, 345, 0],
  ]);
  const headings = knots([
    [0, 0],
    [220, 0],
    [470, 0.95],
    [1380, 0.95],
    [1500, 1.37],
    [1740, -0.35],
    [2440, -0.35],
    [2760, -0.57],
    [3100, 1.05],
    [4120, 1.05],
    [4420, 1.35],
    [4770, 2.1],
    [5670, 2.1],
    [5830, 1.7],
    [6070, 0.5],
    [6880, 0.5],
    [7310, 0.9],
    [7600, 0.9],
  ]);
  const tau = Math.PI * 2;
  const banks = knots([
    [0, 0],
    [140, 0],
    [460, tau],
    [650, tau],
    [850, tau - 0.68],
    [1380, tau - 0.68],
    [1480, tau],
    [1580, tau + 0.7],
    [1870, tau - 0.24],
    [2050, tau - 0.24],
    [2420, tau + 0.9],
    [2850, tau + 0.9],
    [3020, tau],
    [3100, tau + 0.42],
    [3360, tau],
    [4320, tau],
    [4530, tau - 1.18],
    [4850, tau - 0.7],
    [5070, tau + 0.8],
    [5690, tau + 0.8],
    [5900, tau],
    [6070, tau + 0.4],
    [6250, tau + 0.4],
    [6540, tau - 0.85],
    [7050, tau - 0.85],
    [7100, tau - 0.1],
    [7370, tau],
  ]);
  const endStation = expandedStation(7600),
    samples = [],
    distances = [];
  let length = 0,
    x = 0,
    z = 0;
  for (let station = 0; station <= endStation; station++) {
    if (station) {
      const yaw = -interpolate(headings, station - 0.5);
      x += Math.sin(yaw);
      z += Math.cos(yaw);
    }
    const point = new T.Vector3(x, heightAt(heights, station), z);
    if (samples.length) length += point.distanceTo(samples.at(-1));
    samples.push(point);
    distances.push(length);
  }
  const distanceAt = (station) => {
    const at = clamp(station, 0, endStation),
      i = Math.floor(at);
    return T.MathUtils.lerp(
      distances[i],
      distances[Math.min(endStation, i + 1)],
      at - i,
    );
  };
  function stationAt(distance) {
    const at = clamp(distance, 0, length);
    let lo = 0,
      hi = distances.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid + 1] < at) lo = mid + 1;
      else hi = mid;
    }
    return lo + (at - distances[lo]) / (distances[lo + 1] - distances[lo]);
  }
  function positionAt(station) {
    const at = clamp(station, 0, endStation),
      i = Math.floor(at);
    return samples[i]
      .clone()
      .lerp(samples[Math.min(endStation, i + 1)], at - i);
  }
  function sample(distance) {
    const s = clamp(distance, 0, length),
      station = stationAt(s),
      position = positionAt(station),
      tangent = positionAt(station + 0.7)
        .sub(positionAt(station - 0.7))
        .normalize(),
      unbankedRight = new T.Vector3(tangent.z, 0, -tangent.x).normalize(),
      bank = -interpolate(banks, station),
      right = unbankedRight.clone().applyAxisAngle(tangent, bank),
      up = new T.Vector3().crossVectors(tangent, right).normalize();
    if (distance !== s) position.addScaledVector(tangent, distance - s);
    const curvature =
      -(
        interpolate(headings, station + 1) - interpolate(headings, station - 1)
      ) / Math.max(0.01, distanceAt(station + 1) - distanceAt(station - 1));
    return {
      position,
      tangent,
      right,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature,
      bank,
      roll: bank,
    };
  }
  const jumps = definitions.map((definition, index) => ({
    ...definition,
    id: `transfer-${index + 1}`,
    takeoff: distanceAt(lips[index]),
    landingStart: distanceAt(lips[index] + definition.gap),
    landingEnd: distanceAt(lips[index] + definition.end),
    recovery: distanceAt(lips[index] + definition.end + 8),
    halfWidth: WIDTH / 2,
    catchWidth: WIDTH - 4,
    target: distanceAt(lips[index] + definition.target),
    targetLateral: 0,
  }));
  const tubeJump = jumps[2];
  const veilOffset = (tubeJump.landingStart - tubeJump.takeoff) * 0.55;
  const tubes = createTubeSurface({
    sample,
    width: WIDTH,
    tubes: [
      {
        id: 'skywell-glass-throat',
        start: tubeJump.landingStart,
        end: tubeJump.landingStart + 390,
        radius: 22,
        entryLength: 120,
        exitLength: 150,
        rimTransitionLength: 40,
        toeTransitionLength: 20,
        exposedStart: tubeJump.landingStart,
        exposedEnd: tubeJump.landingStart + 390,
      },
    ],
  });
  const sourceDistance = (source) => distanceAt(expandedStation(source));
  const finishDistance = sourceDistance(7300);
  const moments = [
    {
      id: 'crown-corkscrew',
      type: 'corkscrew',
      start: sourceDistance(140),
      end: sourceDistance(460),
    },
    {
      id: 'hook-right',
      type: 'turn',
      start: sourceDistance(220),
      end: sourceDistance(470),
    },
    {
      id: 'bell-plunge',
      type: 'drop',
      start: sourceDistance(1600),
      end: sourceDistance(1870),
    },
    {
      id: 'veil-crossing',
      type: 'waterfall',
      start: jumps[2].takeoff + veilOffset - 30,
      end: jumps[2].takeoff + veilOffset + 30,
    },
    {
      id: 'counterbank-wall',
      type: 'wall',
      start: sourceDistance(4530),
      end: jumps[3].takeoff,
    },
    {
      id: 'last-light-dive',
      type: 'drop',
      start: sourceDistance(5800),
      end: sourceDistance(6070),
    },
  ];
  return {
    id: 'zephyr-skywell-v5',
    name: 'Zephyr Skywell',
    geometryVersion: 'settled-release-bank-tube-transfers-v5',
    length,
    width: WIDTH,
    closed: false,
    finishDistance,
    sample,
    jumps,
    distanceAt,
    stationAt,
    endStation,
    routeMoments: moments,
    curtains: [{ id: 'skywell-veil', s: jumps[2].takeoff + veilOffset }],
    tubes: tubes.descriptors,
    tubeMesh: tubes.mesh,
    tubeAt: tubes.tubeAt,
    tubeProfile: tubes.profileAt,
    sampleSurface: tubes.sampleSurface,
    pace: {
      cruiseScale: 1.2,
      boostScale: 1.06,
      aerodynamicDragScale: 0.55,
      overspeedDeceleration: 0.18,
    },
    isGap: (distance) =>
      jumps.some(
        (jump) => distance > jump.takeoff && distance < jump.landingStart,
      ),
    checkpoints: [
      { id: 'start', distance: 0 },
      ...jumps.map((jump) => ({ id: jump.id, distance: jump.landingStart })),
      { id: 'finish', distance: finishDistance },
    ],
    sections: definitions.map((definition, index) => ({
      id: ['crown', 'bell', 'veil', 'counterbank', 'last-light'][index],
      name: definition.label,
      label: definition.label,
      start: index ? jumps[index - 1].recovery : 0,
      end: index === 4 ? length : jumps[index].recovery,
      showcase: jumps[index].takeoff - 60,
    })),
    scenarios: Object.fromEntries([
      ['staging', { distance: 0, speed: 0, lateral: 0, heading: 0 }],
      ...jumps.flatMap((jump, index) => [
        [
          `jump${index + 1}-approach`,
          {
            distance: jump.takeoff - ([0, 1, 4].includes(index) ? 560 : 320),
            speed: index === 0 ? 115 : index === 1 || index === 4 ? 125 : 145,
            lateral: 0,
            heading: 0,
          },
        ],
        [
          `jump${index + 1}-success`,
          { distance: jump.takeoff - 5, speed: 170, lateral: 0, heading: 0 },
        ],
      ]),
    ]),
    bounds: new T.Box3()
      .setFromPoints(samples)
      .expandByVector(new T.Vector3(650, 700, 650)),
  };
}
