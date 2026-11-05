import * as THREE from 'three';

export const ORIEL_CHALLENGE_ID = 'oriel-civic-chicanes-v1';
const smooth = (t) => {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u ** 3 * (10 + u * (-15 + 6 * u));
};

// These islands occupy the existing broad slab. They never move the route or
// its authored terrain clearance, and the two receiving shelves remain open.
export function createOrielChallenges({ jumps, windings }) {
  const islands = windings.flatMap((winding, index) => {
    const span = winding.end - winding.start;
    return (index ? [0.2, 0.5, 0.8] : [0.32, 0.7]).map((fraction, i) => {
      const center = winding.start + span * fraction;
      const reach = index ? 125 : 145;
      return {
        id: `${winding.id}-island-${i + 1}`,
        kind: 'garden',
        start: center - reach,
        end: center + reach,
        center,
        plateau: 20,
        side: i % 2 ? -1 : 1,
        intrusion: 22,
      };
    });
  });
  const funnels = jumps.flatMap((jump) =>
    [-1, 1].map((side) => ({
      id: `${jump.id}-approach-${side}`,
      kind: 'launch',
      start: jump.takeoff - 300,
      end: jump.takeoff - 5,
      center: jump.takeoff - 95,
      plateau: 90,
      side,
      intrusion: 10.5,
    })),
  );
  return [...islands, ...funnels].sort((a, b) => a.start - b.start);
}

export function orielIslandWeight(island, distance) {
  if (distance < island.start || distance > island.end) return 0;
  const rise = smooth(
    (distance - island.start) / (island.center - island.plateau - island.start),
  );
  // Launch walls finish at the lip; they do not sweep back across the line.
  return island.kind === 'launch'
    ? rise
    : rise *
        smooth(
          (island.end - distance) /
            (island.end - island.center - island.plateau),
        );
}

export function orielIslandEdge(island, distance) {
  return (
    island.side * (20 - island.intrusion * orielIslandWeight(island, distance))
  );
}

function boundsAt(track, distance) {
  const s = THREE.MathUtils.euclideanModulo(distance, track.length);
  let min = -20;
  let max = 20;
  let active = false;
  for (const island of track.challenges) {
    if (s < island.start || s > island.end) continue;
    active = true;
    const edge = orielIslandEdge(island, s);
    if (island.side < 0) min = Math.max(min, edge);
    else max = Math.min(max, edge);
  }
  return active ? { min, max } : null;
}

export function orielRoadBounds(track, distance) {
  const bounds = boundsAt(track, distance);
  if (!bounds) return null;
  const before = boundsAt(track, distance - 0.1) ?? bounds;
  const after = boundsAt(track, distance + 0.1) ?? bounds;
  return {
    ...bounds,
    minDerivative: (after.min - before.min) / 0.2,
    maxDerivative: (after.max - before.max) / 0.2,
  };
}

export function orielAvoidanceLane(track, state) {
  const s = THREE.MathUtils.euclideanModulo(state.distance, track.length);
  const next = track.challenges.find(
    (island) =>
      island.kind === 'garden' &&
      s >= island.start - 135 &&
      s <= island.center + island.plateau,
  );
  if (next) return -next.side * 11;
  const bounds = orielRoadBounds(track, s);
  return bounds ? (bounds.min + bounds.max) / 2 : null;
}

// Every profile station is shared with CPU bounds, including the smooth noses.
// Faces retain hard stone edges and metric coordinates for solid collection.
export function orielIslandGeometry(track, island, profileAt) {
  const rows = Math.ceil((island.end - island.start) / 2.5);
  const points = profileAt(island.start).length;
  const positions = [],
    coordinates = [],
    uv = [],
    indices = [];
  for (let face = 0; face < points - 1; face++) {
    const first = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const s = THREE.MathUtils.lerp(island.start, island.end, row / rows);
      const frame = track.sample(s);
      const profile = profileAt(s);
      for (const [x, y] of [profile[face], profile[face + 1]]) {
        const point = frame.position
          .clone()
          .addScaledVector(frame.right, x)
          .addScaledVector(frame.up, y);
        positions.push(...point);
        coordinates.push(s, x);
        uv.push(x, s);
      }
      if (row < rows) {
        const a = first + row * 2;
        if (island.side < 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    'roadCoord',
    new THREE.Float32BufferAttribute(coordinates, 2),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
