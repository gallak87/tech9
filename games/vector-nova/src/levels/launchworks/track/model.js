import * as T from 'three';

const WIDTH = 38;
const hermite = (a, b, t) => {
  const u = Math.max(0, Math.min(1, t)),
    h = b.z - a.z;
  return (
    (2 * u ** 3 - 3 * u * u + 1) * a.y +
    (u ** 3 - 2 * u * u + u) * h * a.slope +
    (-2 * u ** 3 + 3 * u * u) * b.y +
    (u ** 3 - u * u) * h * b.slope
  );
};

// A sibling of Asterion, not a modification of its racing circuit. Each launch
// opens over the planet into a long, visibly falling receiving apron.
export function createLaunchworksTrack() {
  const lips = Array.from({ length: 5 }, (_, i) => ({
    z: 420 + i * 1450,
    y: 900 - i * 145,
  }));
  const headings = [0, 0.42, -0.32, 0.38, -0.28];
  function yawAt(station) {
    for (let i = 1; i < lips.length; i++) {
      const start = lips[i - 1].z + 960;
      const end = lips[i].z - 180;
      if (station < start) return headings[i - 1];
      if (station <= end) {
        const t = (station - start) / (end - start);
        const blend = t * t * t * (t * (6 * t - 15) + 10);
        return T.MathUtils.lerp(headings[i - 1], headings[i], blend);
      }
    }
    return headings.at(-1);
  }
  const nodes = [{ z: 0, y: 875, slope: 0 }];
  for (const lip of lips)
    nodes.push(
      { z: lip.z - 130, y: lip.y - 20, slope: -0.08 },
      { ...lip, slope: 0.26 },
      { z: lip.z + 400, y: lip.y - 25, slope: -0.18 },
      { z: lip.z + 940, y: lip.y - 122.2, slope: -0.18 },
    );
  const finishZ = lips.at(-1).z + 1050,
    endZ = finishZ + 500;
  nodes.push(
    { z: finishZ, y: lips.at(-1).y - 133, slope: -0.04 },
    { z: endZ, y: lips.at(-1).y - 140, slope: 0 },
  );
  const samples = [],
    distances = [];
  let segment = 0,
    length = 0,
    x = 0,
    forward = 0;
  for (let z = 0; z <= endZ; z++) {
    while (segment + 1 < nodes.length - 1 && z > nodes[segment + 1].z)
      segment++;
    const a = nodes[segment],
      b = nodes[segment + 1];
    if (z > 0) {
      const yaw = yawAt(z - 0.5);
      x += Math.sin(yaw);
      forward += Math.cos(yaw);
    }
    const p = new T.Vector3(x, hermite(a, b, (z - a.z) / (b.z - a.z)), forward);
    if (samples.length) length += p.distanceTo(samples.at(-1));
    samples.push(p);
    distances.push(length);
  }
  const distanceAt = (z) =>
    distances[Math.round(T.MathUtils.clamp(z, 0, endZ))];
  function sample(distance) {
    const s = T.MathUtils.clamp(distance, 0, length);
    let lo = 0,
      hi = distances.length - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid + 1] < s) lo = mid + 1;
      else hi = mid;
    }
    const t = (s - distances[lo]) / (distances[lo + 1] - distances[lo]);
    const position = samples[lo].clone().lerp(samples[lo + 1], t);
    // A centered derivative avoids a visible one-metre pitch stair at the lip.
    const tangent = samples[Math.min(samples.length - 1, lo + 2)]
      .clone()
      .sub(samples[Math.max(0, lo - 1)])
      .normalize();
    const right = new T.Vector3()
        .crossVectors(new T.Vector3(0, 1, 0), tangent)
        .normalize(),
      up = new T.Vector3().crossVectors(tangent, right).normalize();
    // Open-course cameras need a real chase offset even at distance zero.
    if (distance !== s) position.addScaledVector(tangent, distance - s);
    const curvature =
      (yawAt(Math.min(endZ, lo + 1)) - yawAt(Math.max(0, lo - 1))) /
      (distances[Math.min(endZ, lo + 1)] - distances[Math.max(0, lo - 1)]);
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    );
    return { position, tangent, right, up, quaternion, curvature, bank: 0 };
  }
  const jumps = lips.map((lip, i) => ({
    id: `transfer-${i + 1}`,
    label: `Transfer ${i + 1}`,
    takeoff: distanceAt(lip.z),
    landingStart: distanceAt(lip.z + 400),
    landingEnd: distanceAt(lip.z + 940),
    recovery: distanceAt(lip.z + 945),
    halfWidth: WIDTH / 2,
    target: distanceAt(lip.z + 760),
    targetLateral: [-4, 4, 0, -5, 5][i],
  }));
  const finishDistance = distanceAt(finishZ);
  return {
    id: 'asterion-launchworks-v2',
    name: 'Asterion Launchworks',
    geometryVersion: 'five-bending-aprons-v2',
    length,
    width: WIDTH,
    closed: false,
    finishDistance,
    sample,
    jumps,
    distanceAt,
    endStation: endZ,
    // Receiver momentum, rather than repeated full-reserve boosts, supplies
    // the next launch. This pace profile belongs only to the transfer course.
    pace: {
      cruiseScale: 1.08,
      boostScale: 1.06,
      aerodynamicDragScale: 0.66,
      overspeedDeceleration: 0.45,
    },
    isGap: (s) => jumps.some((j) => s > j.takeoff && s < j.landingStart),
    checkpoints: [
      { id: 'start', distance: 0 },
      ...jumps.map((j) => ({ id: j.id, distance: j.landingStart })),
      { id: 'finish', distance: finishDistance },
    ],
    sections: [
      {
        id: 'launchworks',
        label: 'Transfer Array',
        start: 0,
        end: length,
        showcase: jumps[1].takeoff - 60,
      },
    ],
    scenarios: Object.fromEntries([
      ['staging', { distance: 0, speed: 0 }],
      ...jumps.flatMap((j, i) => [
        [
          `jump${i + 1}-approach`,
          { distance: j.takeoff - 170, speed: 130, lateral: j.targetLateral },
        ],
        [
          `jump${i + 1}-success`,
          { distance: j.takeoff - 2, speed: 166, lateral: j.targetLateral },
        ],
      ]),
    ]),
    bounds: new T.Box3()
      .setFromPoints(samples)
      .expandByVector(new T.Vector3(900, 600, 600)),
  };
}
