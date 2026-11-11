import * as T from 'three';
import scarpKit from '../../../assets/levels/saffron/scarps-meshes.json' with { type: 'json' };
import { horizontalFrame } from '../saffron/environment/geometry.js';

// One representative 350m cortical encounter. The caller fits these through
// createOssuaryPassageGeometry just like the existing production passages.
export const OSSUARY_GALLERY_PASSAGES = [
  { prototype: 'rib_2', fraction: 0.49, scale: 1.28 },
  { prototype: 'rib_1', fraction: 0.517, scale: 1.18 },
  { prototype: 'vertebra', fraction: 0.538, scale: 1.22 },
];

export function createOssuaryGalleryScarpGeometry(family = 1) {
  const source = scarpKit.families[family];
  if (!source) throw new RangeError('Unknown Ossuary gallery scarp family');
  const geometry = new T.BufferGeometry();
  for (const [name, values] of [
    ['position', source.positions],
    ['normal', source.normals],
    ['color', source.colors],
  ])
    geometry.setAttribute(name, new T.Float32BufferAttribute(values, 3));
  geometry.setIndex(source.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Seat the actual low cortical perimeter, rather than a bounding-box centre.
 * The returned offset applies to the complete unchanged prop matrix. */
export function calculateOssuaryFootSeat(
  parts,
  matrix,
  dunes,
  burial = 12,
  footBand = 6,
) {
  let minNativeY = Infinity;
  for (const { geometry } of parts) {
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      minNativeY = Math.min(minNativeY, positions.getY(i));
  }
  let offsetY = Infinity;
  const feet = [];
  for (const { geometry } of parts) {
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) > minNativeY + footBand) continue;
      const point = new T.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(matrix);
      offsetY = Math.min(
        offsetY,
        dunes.heightAt(point.x, point.z) - point.y - burial,
      );
      feet.push(point);
    }
  }
  if (!feet.length || !Number.isFinite(offsetY))
    throw new Error('Ossuary prop has no finite source footing');
  for (const point of feet) point.y += offsetY;
  return { offsetY, feet, minNativeY, burial };
}

/** The scapula's broad native X axis becomes the along-gallery cortex. Its
 * genuine fenestrated plates follow the new shoreline; only low roots sink
 * into the exact rendered dune triangles. All other source attributes survive.
 */
export function createOssuaryGalleryShoulderGeometry(
  track,
  source,
  dunes,
  recipe,
) {
  const geometry = source.clone(),
    positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const frame = horizontalFrame(
      track,
      recipe.fraction * track.length - x * recipe.alongScale,
    );
    const centre = frame.position
      .clone()
      .addScaledVector(frame.right, recipe.lateral);
    const point = frame.position
      .clone()
      .addScaledVector(frame.right, recipe.lateral + z * recipe.depthScale);
    point.y =
      dunes.heightAt(centre.x, centre.z) +
      (y - recipe.nativeMinY) * recipe.heightScale -
      recipe.burial;
    const rootWeight = 1 - T.MathUtils.smoothstep(y, 5, 40);
    point.y -=
      Math.max(0, point.y - dunes.heightAt(point.x, point.z) + recipe.burial) *
      rootWeight;
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createOssuaryGalleryPlan(track, templates, dunes) {
  const scapula = templates.get('scapula');
  if (!scapula?.bounds)
    throw new Error('Ossuary gallery requires the canonical scapula');
  const shoulder = {
    prototype: 'scapula',
    fraction: 0.535,
    lateral: 125,
    alongScale: 1.55,
    heightScale: 1.1,
    depthScale: 1.5,
    nativeMinY: scapula.bounds.min.y,
    burial: 10,
  };
  const family = 1,
    scale = new T.Vector3(75, 85, 135);
  const frame = horizontalFrame(track, track.length * 0.535);
  const position = frame.position.clone().addScaledVector(frame.right, 155);
  const rotation = frame.quaternion;
  const source = scarpKit.families[family];
  let height = Infinity,
    footCount = 0;
  for (let i = 0; i < source.positions.length; i += 3) {
    if (source.positions[i + 1] > -0.19) continue;
    const foot = new T.Vector3(...source.positions.slice(i, i + 3))
      .multiply(scale)
      .applyQuaternion(rotation);
    height = Math.min(
      height,
      dunes.heightAt(position.x + foot.x, position.z + foot.z) - foot.y,
    );
    footCount++;
  }
  position.y = height - 8;
  const matrix = new T.Matrix4().compose(position, rotation, scale);
  const sediment = { family, matrix, burial: 8, footCount };
  const bounds = new T.Box3();
  for (let i = 0; i < source.positions.length; i += 3)
    bounds.expandByPoint(
      new T.Vector3(...source.positions.slice(i, i + 3)).applyMatrix4(matrix),
    );
  return {
    passages: OSSUARY_GALLERY_PASSAGES.map((passage) => ({ ...passage })),
    shoulder,
    sediment,
    sedimentBounds: bounds,
    start: OSSUARY_GALLERY_PASSAGES[0].fraction * track.length - 45,
    end: OSSUARY_GALLERY_PASSAGES.at(-1).fraction * track.length + 36,
    replacement: {
      start: track.length * 0.475,
      end: track.length * 0.565,
      side: 1,
      nearLateral: 280,
    },
  };
}

/** Two off-road excavation beds. The original anatomical proportions remain
 * intact: unequal broken bones disappear into one low sediment body per site.
 * These are static source placements, never additional racing doorways. */
export function createOssuaryBuriedBeds(track, templates, dunes) {
  const definitions = [
    {
      name: 'Crown descent excavation',
      fraction: 0.371,
      lateral: -190,
      family: 0,
      scale: [75, 48, 160],
      anatomy: [
        {
          prototype: 'vertebra_1',
          fraction: 0.369,
          lateral: -185,
          yaw: 1.1,
          scale: 1.4,
          burial: 40,
        },
        {
          prototype: 'scapula',
          fraction: 0.372,
          lateral: -185,
          yaw: 1.45,
          scale: 1.05,
          burial: 90,
        },
      ],
    },
    {
      name: 'Return exposed cortical bed',
      fraction: 0.884,
      lateral: -200,
      family: 2,
      scale: [95, 55, 175],
      anatomy: [
        {
          prototype: 'scapula',
          fraction: 0.881,
          lateral: -190,
          yaw: -0.55,
          scale: 1.42,
          burial: 22,
        },
        {
          prototype: 'rib_2',
          fraction: 0.887,
          lateral: -220,
          yaw: 1.0,
          scale: 1.15,
          burial: 35,
        },
        {
          prototype: 'vertebra_2',
          fraction: 0.862,
          lateral: -225,
          yaw: 0.35,
          scale: 1.1,
          burial: 28,
        },
      ],
    },
  ];
  return definitions.map((definition) => {
    const anatomy = definition.anatomy.map((recipe) => {
      const template = templates.get(recipe.prototype);
      if (!template?.parts)
        throw new Error(`Ossuary buried bed requires ${recipe.prototype}`);
      const frame = horizontalFrame(track, recipe.fraction * track.length);
      const quaternion = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            recipe.yaw,
          ),
        );
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, recipe.lateral);
      const matrix = new T.Matrix4().compose(
        position,
        quaternion,
        new T.Vector3().setScalar(recipe.scale),
      );
      const seat = calculateOssuaryFootSeat(
        template.parts,
        matrix,
        dunes,
        recipe.burial,
      );
      matrix.elements[13] += seat.offsetY;
      return {
        ...recipe,
        matrix,
        footCount: seat.feet.length,
        bounds: template.bounds.clone().applyMatrix4(matrix),
      };
    });
    const frame = horizontalFrame(track, definition.fraction * track.length);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, definition.lateral);
    const source = scarpKit.families[definition.family],
      scale = new T.Vector3(...definition.scale);
    let seatY = Infinity,
      footCount = 0;
    for (let i = 0; i < source.positions.length; i += 3) {
      if (source.positions[i + 1] > -0.19) continue;
      const foot = new T.Vector3(...source.positions.slice(i, i + 3))
        .multiply(scale)
        .applyQuaternion(frame.quaternion);
      seatY = Math.min(
        seatY,
        dunes.heightAt(position.x + foot.x, position.z + foot.z) - foot.y,
      );
      footCount++;
    }
    position.y = seatY - 10;
    const sediment = {
      family: definition.family,
      matrix: new T.Matrix4().compose(position, frame.quaternion, scale),
      burial: 10,
      footCount,
    };
    return {
      name: definition.name,
      fraction: definition.fraction,
      anatomy,
      sediment,
      replacement: {
        start: (definition.fraction - 0.04) * track.length,
        end: (definition.fraction + 0.04) * track.length,
        side: -1,
        nearLateral: 310,
      },
    };
  });
}
