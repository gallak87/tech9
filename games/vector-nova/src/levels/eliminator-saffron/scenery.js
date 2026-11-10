import * as T from 'three';
import { horizontalFrame } from '../saffron/environment/geometry.js';
import {
  OSSUARY_GALLERY_PASSAGES,
  calculateOssuaryFootSeat,
} from './gallery.js';

/** A private dune field for this loop; no original skull/jump/grazer schema. */
export function createOssuaryDunes(track, segments = 176) {
  const routeCount = Math.ceil(track.length / 16);
  const route = Array.from(
    { length: routeCount },
    (_, i) => track.sample((i * track.length) / routeCount).position,
  );
  const bounds = new T.Box3()
    .setFromPoints(route)
    .expandByVector(new T.Vector3(850, 0, 850));
  const width = bounds.max.x - bounds.min.x,
    depth = bounds.max.z - bounds.min.z;
  const heights = new Float32Array((segments + 1) ** 2),
    positions = [],
    colors = [],
    indices = [];
  const light = new T.Color('#c9954c'),
    dark = new T.Color('#8a5d35'),
    color = new T.Color();
  for (let iz = 0; iz <= segments; iz++)
    for (let ix = 0; ix <= segments; ix++) {
      const x = bounds.min.x + (width * ix) / segments,
        z = bounds.min.z + (depth * iz) / segments;
      let distance = Infinity,
        nearest = route[0];
      for (const point of route) {
        const d = (point.x - x) ** 2 + (point.z - z) ** 2;
        if (d < distance) {
          distance = d;
          nearest = point;
        }
      }
      const radial = Math.sqrt(distance);
      const ridges =
        16 * Math.sin(x / 86 + Math.sin(z / 180)) +
        10 * Math.cos(z / 115 + x / 270);
      const mantle =
        115 + 70 * Math.sin(x / 610) + 55 * Math.cos(z / 550) + ridges;
      const floor =
        nearest.y -
        64 +
        Math.min(radial / 8, 80) +
        ridges * Math.min(radial / 180, 1);
      const blend = T.MathUtils.smoothstep(radial, 220, 680);
      const y = T.MathUtils.lerp(floor, mantle, blend);
      heights[iz * (segments + 1) + ix] = y;
      positions.push(x, y, z);
      color.copy(dark).lerp(light, 0.46 + 0.24 * Math.sin(x / 160 + z / 230));
      colors.push(color.r, color.g, color.b);
      if (ix < segments && iz < segments) {
        const a = iz * (segments + 1) + ix,
          b = a + 1,
          c = a + segments + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Sample the same diagonal/triangles as the rendered grid, including props.
  function heightAt(x, z) {
    const gx = T.MathUtils.clamp(
      ((x - bounds.min.x) / width) * segments,
      0,
      segments - 0.000001,
    );
    const gz = T.MathUtils.clamp(
      ((z - bounds.min.z) / depth) * segments,
      0,
      segments - 0.000001,
    );
    const ix = Math.floor(gx),
      iz = Math.floor(gz),
      u = gx - ix,
      v = gz - iz;
    const a = heights[iz * (segments + 1) + ix],
      b = heights[iz * (segments + 1) + ix + 1];
    const c = heights[(iz + 1) * (segments + 1) + ix],
      d = heights[(iz + 1) * (segments + 1) + ix + 1];
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  return { geometry, heightAt, bounds };
}

export const OSSUARY_PASSAGES = [
  { prototype: 'rib_1', fraction: 0.075, scale: 1.12 },
  { prototype: 'rib', fraction: 0.135, scale: 1.16 },
  { prototype: 'rib_2', fraction: 0.19, scale: 1.25 },
  { prototype: 'skull', fraction: 0.245, scale: 1.2 },
  { prototype: 'cortical_web', fraction: 0.245, scale: 1.2 },
  { prototype: 'vertebra_1', fraction: 0.44, scale: 1.2 },
  { prototype: 'vertebra', fraction: 0.585, scale: 1.16 },
  { prototype: 'vertebra_2', fraction: 0.64, scale: 1.3 },
  ...OSSUARY_GALLERY_PASSAGES,
];

/** Fit real fossil apertures to the new route rather than putting a curving
 * road through a rigid straight skull. Native cortical/marrow topology stays. */
export function createOssuaryPassageGeometry(
  track,
  source,
  distance,
  scale = 1,
  dunes = null,
) {
  const geometry = source.clone(),
    position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * scale,
      y = position.getY(i) * scale,
      z = position.getZ(i) * scale;
    const frame = track.sample(distance + z);
    const point = frame.position
      .clone()
      .addScaledVector(frame.right, x)
      .addScaledVector(frame.up, y);
    // Only the outer buried roots follow this new mantle. The entire central
    // aperture and crown retain their authored form/clearance above the road.
    if (dunes && Math.abs(x / scale) > 55 && y / scale < 35) {
      const rootWeight =
        (1 - T.MathUtils.smoothstep(y / scale, -12, 35)) *
        T.MathUtils.smoothstep(Math.abs(x / scale), 55, 75);
      point.y -=
        Math.max(0, point.y - dunes.heightAt(point.x, point.z) + 10) *
        rootWeight;
    }
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createOssuarySceneryPlan(track, templates, dunes) {
  const routeCount = Math.ceil(track.length / 10);
  const placements = [],
    route = Array.from(
      { length: routeCount },
      (_, i) => track.sample((i * track.length) / routeCount).position,
    );
  const clear = (bounds) =>
    route.every(
      (point) =>
        point.x < bounds.min.x - 54 ||
        point.x > bounds.max.x + 54 ||
        point.z < bounds.min.z - 54 ||
        point.z > bounds.max.z + 54 ||
        point.y < bounds.min.y - 54 ||
        point.y > bounds.max.y + 54,
    );
  function beside(prototype, fraction, side, scale, yaw = 0) {
    const frame = horizontalFrame(track, fraction * track.length);
    for (let attempt = 0; attempt < 15; attempt++) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (170 + attempt * 35));
      const quaternion = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        );
      const matrix = new T.Matrix4().compose(
        position,
        quaternion,
        new T.Vector3(...scale),
      );
      const bounds = templates
        .get(prototype)
        .bounds.clone()
        .applyMatrix4(matrix);
      const ground = dunes.heightAt(position.x, position.z);
      const seat = calculateOssuaryFootSeat(
        templates.get(prototype).parts,
        matrix,
        dunes,
        12,
      );
      position.y += seat.offsetY;
      matrix.setPosition(position);
      bounds.copy(templates.get(prototype).bounds).applyMatrix4(matrix);
      if (clear(bounds)) {
        placements.push({
          prototype,
          matrix,
          bounds,
          ground,
          fraction,
          burial: seat.burial,
        });
        return;
      }
    }
  }
  for (let i = 0; i < 22; i++) {
    const fraction = (i + 0.35) / 22;
    beside(
      i % 3 === 0 ? 'scapula' : i % 2 ? 'outcrop' : 'outcrop_1',
      fraction,
      i % 2 ? -1 : 1,
      i % 3 === 0 ? [1.3, 1.45, 1.25] : [1.7, 1.4, 1.65],
      Math.sin(i * 2.4) * 0.6,
    );
  }
  return { placements, clear };
}
