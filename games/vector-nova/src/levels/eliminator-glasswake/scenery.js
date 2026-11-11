import * as T from 'three';
import { createFractureMassifPlan } from './massif.js';

const Y = new T.Vector3(0, 1, 0);
export const COMET_FLOOR = -130;

// Fit the canonical longitudinal arch to the actual curved/banked underside.
// Rigid long instances can rise through a changing bank even if their centre
// is seated; the authored section and its negative deck offsets are retained.
export function createGlasswakeArchGeometry(track, source, distance) {
  const geometry = source.clone(),
    positions = geometry.attributes.position;
  const point = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    const frame = track.sample(distance + point.z * 1.65);
    point
      .copy(frame.position)
      .addScaledVector(frame.right, positions.getX(i) * 2.02)
      .addScaledVector(frame.up, positions.getY(i));
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGlasswakePlacementPlan(track, templates) {
  const placements = [],
    route = [],
    omitted = [];
  for (let s = 0; s < track.length; s += 10)
    route.push(track.sample(s).position);
  const clear = (bounds) =>
    route.every(
      (point) =>
        point.x < bounds.min.x - 58 ||
        point.x > bounds.max.x + 58 ||
        point.z < bounds.min.z - 58 ||
        point.z > bounds.max.z + 58 ||
        point.y < bounds.min.y - 58 ||
        point.y > bounds.max.y + 58,
    );
  function add(
    prototype,
    position,
    rotation,
    scale,
    kind = 'scenery',
    distance = null,
  ) {
    const matrix = new T.Matrix4().compose(
      position,
      rotation,
      new T.Vector3(...scale),
    );
    const bounds = templates.get(prototype).bounds.clone().applyMatrix4(matrix);
    if (kind === 'scenery' && !clear(bounds)) return false;
    placements.push({ prototype, matrix, bounds, kind, distance });
    return true;
  }
  function beside(prototype, distance, lateral, lift, scale, yaw = 0) {
    const frame = track.sample(distance);
    const heading = Math.atan2(frame.tangent.x, frame.tangent.z);
    const right = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = frame.position
        .clone()
        .addScaledVector(
          right,
          lateral + Math.sign(lateral || 1) * attempt * 30,
        );
      position.y += lift;
      if (
        add(
          prototype,
          position,
          new T.Quaternion().setFromAxisAngle(Y, heading + yaw),
          scale,
          'scenery',
          distance,
        )
      )
        return;
    }
    omitted.push({ prototype, distance });
  }
  // A single overlapping geological body underlies the complete raceway.
  // It is not a ring of isolated blue props or unsupported ice platforms.
  const foundation = templates.get('basal_strata').bounds;
  for (let x = -600; x <= 1450; x += 390)
    for (let z = -950; z <= 1000; z += 390)
      add(
        'basal_strata',
        new T.Vector3(x, COMET_FLOOR - foundation.max.y * 1.4, z),
        new T.Quaternion(),
        [1.65, 1.4, 1.65],
        'foundation',
      );
  for (let s = 0; s < track.length; s += 155) {
    const frame = track.sample(s);
    for (const side of [-1, 1]) {
      const prototype = `cliff_${(Math.floor(s / 155) + (side > 0 ? 1 : 0)) % 3}`;
      const bounds = templates.get(prototype).bounds;
      const height = frame.position.y + 90 - COMET_FLOOR + 25;
      const yScale = height / (bounds.max.y - bounds.min.y);
      beside(
        prototype,
        s,
        side * (180 + 20 * Math.sin(s / 190)),
        90 - bounds.max.y * yScale,
        [1.55, yScale, 1.65],
        side * 0.12,
      );
    }
  }
  const pier = templates.get('cave_pier').bounds;
  for (let s = 15; s < track.length; s += 116) {
    const frame = track.sample(s);
    add(
      'bridge_arch',
      frame.position.clone(),
      frame.quaternion,
      [2.02, 1, 1.65],
      'support',
      s,
    );
    const top = frame.position.y - 39;
    const yScale = (top - COMET_FLOOR + 25) / (pier.max.y - pier.min.y);
    add(
      'cave_pier',
      new T.Vector3(
        frame.position.x,
        top - pier.max.y * yScale,
        frame.position.z,
      ),
      new T.Quaternion().setFromAxisAngle(
        Y,
        Math.atan2(frame.tangent.x, frame.tangent.z),
      ),
      [0.92, yScale, 0.82],
      'support',
      s,
    );
  }
  const retired = [];
  const massif = createFractureMassifPlan(track, templates, {
    floorY: COMET_FLOOR,
  });
  for (let i = placements.length - 1; i >= 0; i--) {
    const item = placements[i];
    if (
      massif.replacements.some(
        (replacement) =>
          replacement.prototypes.includes(item.prototype) &&
          replacement.bounds.intersectsBox(
            item.bounds.clone().applyMatrix4(replacement.inverse),
          ),
      )
    )
      retired.push(...placements.splice(i, 1));
  }
  placements.push(...massif.foundationPlacements, ...massif.placements);
  return { placements, route, clear, omitted, massif, retired };
}
