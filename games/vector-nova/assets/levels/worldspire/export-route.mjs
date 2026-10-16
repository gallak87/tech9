import { writeFile } from 'node:fs/promises';
import * as T from 'three';
import { getVehiclePace } from '../../../src/physics/index.js';
import { inspectJump } from '../../../tools/shatterline-inspect.mjs';
import { createWorldspireRuntime } from '../../../src/levels/worldspire/runtime.js';
import { createWorldspireTrack } from '../../../src/levels/worldspire/track/model.js';
const t = createWorldspireTrack(),
  samples = [];
for (let s = 0; s <= t.length; s += 12) {
  const f = t.sample(s);
  samples.push({
    s,
    p: f.position.toArray(),
    t: f.tangent.toArray(),
    up: f.up.toArray(),
    right: f.right.toArray(),
    gap: t.isGap(s),
  });
}
// Export the real ballistic envelope as well as the absent-road guide curve.
// City placement must leave ships and the chase camera clear throughout each
// flight, including the slower arc above the nominal route and fast overshoot.
const flights = [];
for (const jump of t.jumps) {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    for (const speed of [getVehiclePace(shipId, t.pace).cruiseSpeed, 255]) {
      const result = inspectJump({
        track: t,
        jump,
        shipId,
        speed,
        runtime: createWorldspireRuntime({ track: t, presentation: false }),
        retainTrace: true,
      });
      if (result.outcome !== 'landed')
        throw new Error(
          `Cannot export failed flight ${jump.id} at ${speed} m/s`,
        );
      const right = t.sample(jump.takeoff).right;
      const flightSamples = result.trace
        .filter((_, index) => index % 3 === 0)
        .map((frame) => {
          const tangent = new T.Vector3(...frame.velocity).normalize();
          return {
            p: frame.position,
            t: tangent.toArray(),
            right: right.toArray(),
            up: tangent.clone().cross(right).normalize().toArray(),
          };
        });
      flights.push({
        id: jump.id,
        shipId,
        speed,
        launchSpeed: result.launchSpeed,
        landedDistance: result.landedDistance,
        airtime: result.airtime,
        // Includes legal lateral launch lines, bounded air corrections and the
        // chase camera. The generator may be more conservative around monuments.
        halfWidth: 52,
        verticalClearance: 28,
        longitudinalClearance: 40,
        samples: flightSamples,
      });
    }
  }
}
// Fill the space between endpoint-speed trajectories; intermediate speeds
// must not thread a city block that happens to miss both sampled centerlines.
const flightCorridors = t.jumps.map((jump) => {
  const frame = t.sample(jump.takeoff);
  const forward = frame.tangent.clone().setY(0).normalize();
  const origin = frame.position;
  const paths = flights
    .filter((entry) => entry.id === jump.id)
    .map((entry) =>
      entry.samples.map(({ p }) => ({
        along: new T.Vector3(...p).sub(origin).dot(forward),
        y: p[1],
      })),
    );
  const end = Math.max(...paths.map((path) => path.at(-1).along));
  const source = t.sourceAt(jump.takeoff);
  const columns = [];
  for (let along = 0; along < end + 20; along += 20) {
    const distance = Math.min(end, along);
    const heights = paths.flatMap((path) => {
      if (distance > path.at(-1).along) return [];
      const index = path.findIndex((entry) => entry.along >= distance);
      if (index <= 0) return [path[0].y];
      const a = path[index - 1],
        b = path[index];
      return [
        T.MathUtils.lerp(a.y, b.y, (distance - a.along) / (b.along - a.along)),
      ];
    });
    const point = origin.clone().addScaledVector(forward, distance);
    const roadY = t.pointAtSource(source + distance).y;
    columns.push({
      p: [
        point.x,
        (Math.min(roadY, ...heights) + Math.max(...heights)) / 2,
        point.z,
      ],
      minY: Math.min(roadY, ...heights) - 28,
      maxY: Math.max(...heights) + 28,
    });
  }
  return {
    id: jump.id,
    lateralHalfWidth: 52,
    longitudinalClearance: 40,
    forward: forward.toArray(),
    columns,
  };
});
const frameAt = (distance) => {
  const frame = t.sample(distance);
  return {
    distance,
    source: t.sourceAt(distance),
    p: frame.position.toArray(),
    t: frame.tangent.toArray(),
    right: frame.right.toArray(),
    up: frame.up.toArray(),
  };
};
const landmarks = t.jumps
  .filter((jump) => jump.hero)
  .map((jump) => ({
    id: jump.id,
    label: jump.label,
    kind: 'hero-flight',
    passage:
      jump.id === 'heart-chasm'
        ? 'heart'
        : jump.id === 'echo-chasm'
          ? 'vault'
          : null,
    takeoff: frameAt(jump.takeoff),
    landingStart: frameAt(jump.landingStart),
    landingEnd: frameAt(jump.landingEnd),
    recovery: frameAt(jump.recovery),
  }));
await writeFile(
  'assets/levels/worldspire/route-source.json',
  JSON.stringify({
    geometryVersion: t.geometryVersion,
    spireHeight: t.spireHeight,
    length: t.length,
    finish: t.finishDistance,
    interior: t.interior,
    interiors: t.interiors,
    inversion: t.inversion,
    inversions: t.inversions,
    sections: t.sections,
    jumps: t.jumps,
    samples,
    flights,
    flightCorridors,
    landmarks,
  }),
);
