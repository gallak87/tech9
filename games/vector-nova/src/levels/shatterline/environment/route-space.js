import * as T from 'three';
import { createRouteClearance } from '../../../environment/placement.js';

const spaces = new WeakMap();
const CELL = 320;
const RADIUS = 650;

/** Actual road branches are independent of the monotonic accelerator spine. */
export function shatterlineRouteSpace(track) {
  if (spaces.has(track)) return spaces.get(track);
  const excavation = new Map();
  const ranges = [
    ...(track.descents ?? []).filter((s) => s.kind === 'corkscrew'),
    ...(track.variations?.length
      ? [
          {
            start: Math.min(
              ...track.variations.map((section) => section.start),
            ),
            end: track.length,
          },
        ]
      : []),
  ];
  for (const range of ranges) {
    const start = Math.max(0, range.start - 140),
      end = Math.min(track.length, range.end + 140);
    for (let s = start; s < end; s += 28) {
      const a = track.sample(s).position,
        b = track.sample(Math.min(s + 28, end)).position;
      const receiver =
        s >=
        (track.jumps.find((j) => j.id === 'horizon-transfer')?.landingStart ??
          Infinity) -
          40;
      const segment = {
        a,
        b,
        dx: b.x - a.x,
        dz: b.z - a.z,
        radius: receiver ? 1500 : RADIUS,
        flat: receiver ? 700 : 100,
        depth: receiver ? 250 : 220,
        grade: receiver ? 0.1 : 0.35,
        inner: receiver ? 900 : 350,
      };
      segment.denominator = Math.max(0.0001, segment.dx ** 2 + segment.dz ** 2);
      for (
        let ix = Math.floor((Math.min(a.x, b.x) - segment.radius) / CELL);
        ix <= Math.floor((Math.max(a.x, b.x) + segment.radius) / CELL);
        ix++
      ) {
        for (
          let iz = Math.floor((Math.min(a.z, b.z) - segment.radius) / CELL);
          iz <= Math.floor((Math.max(a.z, b.z) + segment.radius) / CELL);
          iz++
        ) {
          const key = `${ix}:${iz}`;
          if (!excavation.has(key)) excavation.set(key, []);
          excavation.get(key).push(segment);
        }
      }
    }
  }
  const terminal = track.sample(track.length);
  const exitDirection = new T.Vector2(
    terminal.tangent.x,
    terminal.tangent.z,
  ).normalize();
  let clearance;
  const space = {
    excavate(x, z, height) {
      const candidates = excavation.get(
        `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`,
      );
      let floor = height;
      for (const {
        a,
        b,
        dx,
        dz,
        denominator,
        radius,
        flat,
        depth,
        grade,
        inner,
      } of candidates ?? []) {
        const projection = ((x - a.x) * dx + (z - a.z) * dz) / denominator;
        // Do not pull the floor down to a much later, lower segment merely
        // because it falls inside the lateral valley radius. At a crossing both
        // branches still contribute where their real segment projections meet.
        if (projection < -3 || projection > 4) continue;
        const t = T.MathUtils.clamp(projection, 0, 1);
        const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
        if (distance >= radius) continue;
        const ceiling =
          T.MathUtils.lerp(a.y, b.y, t) -
          depth +
          Math.max(0, distance - flat) * grade;
        const influence = 1 - T.MathUtils.smoothstep(distance, inner, radius);
        floor = Math.min(floor, T.MathUtils.lerp(height, ceiling, influence));
      }
      // The physical runout ends before the monotonic accelerator spine. Keep
      // the receiving valley open beyond it, rather than exposing that earlier,
      // much higher mountainside as an abrupt wall at the excavation boundary.
      // This continuation starts strictly beyond the final playable station.
      const dx = x - terminal.position.x;
      const dz = z - terminal.position.z;
      const forward = dx * exitDirection.x + dz * exitDirection.y;
      if (forward > 0 && forward < 5000) {
        const lateral = Math.abs(dx * exitDirection.y - dz * exitDirection.x);
        const inner = 900 + forward * 0.22;
        const radius = 1500 + forward * 0.3;
        const influence =
          T.MathUtils.smoothstep(forward, 0, 50) *
          (1 - T.MathUtils.smoothstep(forward, 2200, 5000)) *
          (1 - T.MathUtils.smoothstep(lateral, inner, radius));
        const basin =
          terminal.position.y -
          250 -
          forward * 0.026 +
          Math.max(0, lateral - 700 - forward * 0.12) * 0.1;
        floor = Math.min(floor, T.MathUtils.lerp(height, basin, influence));
      }
      return floor;
    },
    clearsColumn(x, z, width, depth, bottom, top, yaw = 0) {
      clearance ??= createRouteClearance(track, {
        spacing: 8,
        sidePadding: 20,
        localVertical: [-20, 48],
      });
      return clearance.clears(x, z, width, depth, top, yaw, bottom);
    },
  };
  spaces.set(track, space);
  return space;
}
