import * as T from 'three';
import { createTubeSurface } from '../../shatterline/track/tube-surface.js';

const WIDTH = 38;
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
export function createLaunchworksTrack() {
  const lips = [650, 2050, 3450, 4850, 6250];
  const definitions = [
    {
      label: 'Crown Hook',
      receiverType: 'bank',
      approachHint: 'Unwind the corkscrew · turn right',
      receiverHint: 'Catch the right bank',
      speedHint: 'Bleed speed after the powered entry',
      speedRange: [130, 150],
      gap: 250,
      end: 700,
      target: 600,
    },
    {
      label: 'Bell Dive',
      receiverType: 'shelf',
      approachHint: 'Brake the plunge before release',
      receiverHint: 'Climb into the left shelf',
      speedHint: 'Gravity supplies speed · brake early',
      speedRange: [115, 140],
      gap: 350,
      end: 780,
      target: 460,
    },
    {
      label: 'Veil Bore',
      receiverType: 'tube',
      approachHint: 'Sight the lanterns before the veil',
      receiverHint: 'Enter the open tube floor',
      speedHint: 'Carry speed into the mouth',
      speedRange: [145, 165],
      gap: 320,
      end: 750,
      target: 390,
    },
    {
      label: 'Counterbank',
      receiverType: 'bank',
      approachHint: 'Release from the wall · reverse roll',
      receiverHint: 'Catch the opposing bank',
      speedHint: 'Hold the wall line until release',
      speedRange: [135, 155],
      gap: 280,
      end: 780,
      target: 650,
    },
    {
      label: 'Last Light',
      receiverType: 'curve',
      approachHint: 'Choose your line before the split',
      receiverHint: 'Settle into the falling curve',
      speedHint: 'A controlled dive beats full boost',
      speedRange: [115, 140],
      gap: 340,
      end: 780,
      target: 440,
    },
  ];
  const heights = [
    [0, 1480, 0],
    [150, 1500, 0],
    [390, 1500, 0],
    [650, 1500, 0.18],
    [900, 1470, -0.15],
    [1350, 1390, -0.18],
    [1750, 1420, -0.38],
    [2050, 1290, -0.12],
    [2470, 1080, 0.08],
    [2830, 1100, 0],
    [3270, 1060, 0.08],
    [3450, 1080, 0.12],
    [3770, 1045, -0.04],
    [4200, 1018, -0.04],
    [4690, 890, 0.05],
    [4850, 910, 0.22],
    [5130, 880, -0.28],
    [5630, 785, -0.06],
    [6000, 800, -0.4],
    [6250, 700, -0.18],
    [6590, 500, 0.14],
    [7030, 530, 0],
    [7600, 545, 0],
  ];
  const headings = [
    [0, 0],
    [360, 0],
    [610, 0.95],
    [1080, 0.95],
    [1400, 1.37],
    [1690, -0.35],
    [2440, -0.35],
    [2760, -0.57],
    [3100, 1.05],
    [4120, 1.05],
    [4420, 1.35],
    [4770, 2.1],
    [5450, 2.1],
    [5730, 1.7],
    [6020, 0.5],
    [6570, 0.5],
    [6980, 0.9],
    [7600, 0.9],
  ];
  const tau = Math.PI * 2;
  const banks = [
    [0, 0],
    [140, 0],
    [460, tau],
    [570, tau - 0.68],
    [650, tau],
    [850, tau - 0.68],
    [1130, tau - 0.68],
    [1430, tau],
    [1680, tau + 0.7],
    [1970, tau - 0.24],
    [2050, tau - 0.24],
    [2420, tau + 0.9],
    [2700, tau + 0.9],
    [2940, tau],
    [3100, tau + 0.42],
    [3360, tau],
    [4320, tau],
    [4530, tau - 1.18],
    [4850, tau - 0.7],
    [5070, tau + 0.8],
    [5690, tau + 0.8],
    [5900, tau],
    [6030, tau + 0.4],
    [6250, tau + 0.4],
    [6540, tau - 0.85],
    [6810, tau - 0.85],
    [7100, tau - 0.1],
    [7370, tau],
  ];
  const endStation = 7600,
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
    catchWidth: 34,
    target: distanceAt(lips[index] + definition.target),
    targetLateral: 0,
  }));
  const tubeJump = jumps[2];
  const tubes = createTubeSurface({
    sample,
    width: WIDTH,
    tubes: [
      {
        id: 'skywell-glass-throat',
        start: tubeJump.landingStart,
        end: tubeJump.landingStart + 340,
        radius: 22,
        entryLength: 100,
        exitLength: 140,
        rimTransitionLength: 40,
        toeTransitionLength: 20,
        exposedStart: tubeJump.landingStart,
        exposedEnd: tubeJump.landingStart + 340,
      },
    ],
  });
  const finishDistance = distanceAt(7300);
  const moments = [
    {
      id: 'crown-corkscrew',
      type: 'corkscrew',
      start: distanceAt(140),
      end: distanceAt(460),
    },
    {
      id: 'hook-right',
      type: 'turn',
      start: distanceAt(360),
      end: jumps[0].takeoff,
    },
    {
      id: 'bell-plunge',
      type: 'drop',
      start: distanceAt(1750),
      end: jumps[1].takeoff,
    },
    {
      id: 'veil-crossing',
      type: 'waterfall',
      start: jumps[2].takeoff + 160,
      end: jumps[2].takeoff + 220,
    },
    {
      id: 'counterbank-wall',
      type: 'wall',
      start: distanceAt(4530),
      end: jumps[3].takeoff,
    },
    {
      id: 'last-light-dive',
      type: 'drop',
      start: distanceAt(6000),
      end: jumps[4].takeoff,
    },
  ];
  return {
    id: 'zephyr-skywell-v3',
    name: 'Zephyr Skywell',
    geometryVersion: 'five-distinct-bank-tube-transfers-v3',
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
    curtains: [{ id: 'skywell-veil', s: jumps[2].takeoff + 195 }],
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
            distance: jump.takeoff - (index === 0 ? 560 : 320),
            speed: index === 1 || index === 4 ? 110 : 125,
            lateral: 0,
            heading: 0,
          },
        ],
        [
          `jump${index + 1}-success`,
          { distance: jump.takeoff - 5, speed: 150, lateral: 0, heading: 0 },
        ],
      ]),
    ]),
    bounds: new T.Box3()
      .setFromPoints(samples)
      .expandByVector(new T.Vector3(650, 700, 650)),
  };
}
