import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSurfaceProjector } from '../../pickups/surface-projector.js';
import { sampleCarrierMotion } from './motion.js';

const PAINT = {
  white: new T.Color('#e5e6da'),
  amber: new T.Color('#db9438'),
  graphite: new T.Color('#182229'),
};

// The point advances in route metres. It never aims at a moving receiver.
function chevron(distance, halfWidth, depth, stroke) {
  return [-1, 1].map((side) => [
    [side * halfWidth, distance - depth / 2],
    [0, distance + depth / 2],
    [0, distance + depth / 2 - stroke],
    [side * halfWidth, distance - depth / 2 - stroke],
  ]);
}

function clipWidth(polygon, halfWidth) {
  for (const side of [-1, 1]) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = halfWidth - side * a[0],
        db = halfWidth - side * b[0];
      if (da >= 0) clipped.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        clipped.push([
          T.MathUtils.lerp(a[0], b[0], t),
          T.MathUtils.lerp(a[1], b[1], t),
        ]);
      }
    }
    polygon = clipped;
  }
  return polygon;
}

/** Broad painted departure warnings and forward landing cues on the actual skin. */
export function createNomadGuidance({ track, surfaces }) {
  const nominalTrack = Object.create(track);
  nominalTrack.sample = (track.nominalSample ?? track.sample).bind(track);
  nominalTrack.sampleSurface = (
    track.nominalSurface ?? track.sampleSurface
  )?.bind(track);
  const projector = createSurfaceProjector(nominalTrack, surfaces, {
    nominal: true,
  });
  const group = new T.Group();
  group.name = 'Nomad / carrier deck navigation paint';
  const batches = new Map(),
    meshes = new Map();
  const material = new T.MeshStandardMaterial({
    name: 'Nomad / matte white and oxide safety paint',
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const paint = (carrierId, shapes, color, offset = 0.065) => {
    const geometry = projector.geometry(shapes, offset, null, {
      motionGroup: carrierId,
    });
    const count = geometry.attributes.position.count;
    if (!count) {
      geometry.dispose();
      return;
    }
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    if (!batches.has(carrierId)) batches.set(carrierId, []);
    batches.get(carrierId).push(geometry);
  };
  try {
    for (const jump of track.jumps) {
      for (const before of [140, 95, 50]) {
        const s = jump.takeoff - before;
        paint(
          jump.departureCarrierId,
          chevron(s, track.halfWidthAt(s) * 0.62, 14, 3.2),
          PAINT.white,
        );
      }
      // A six-metre transverse warning, with a metre of bare steel at the lip.
      // Adjacent oxide/graphite polygons share edges rather than overdraw layers.
      const from = jump.takeoff - 7,
        to = jump.takeoff - 1;
      const halfWidth =
        Math.min(track.halfWidthAt(from), track.halfWidthAt(to)) - 2.4;
      const stripeWidth = 4.8,
        diagonal = 6;
      for (
        let x = -halfWidth - diagonal, index = 0;
        x < halfWidth;
        x += stripeWidth, index++
      ) {
        const stripe = clipWidth(
          [
            [x, from],
            [x + stripeWidth, from],
            [x + stripeWidth + diagonal, to],
            [x + diagonal, to],
          ],
          halfWidth,
        );
        if (stripe.length >= 3)
          paint(
            jump.departureCarrierId,
            [stripe],
            index % 2 ? PAINT.graphite : PAINT.amber,
            0.075,
          );
      }
      for (const after of [50, 100]) {
        const s = jump.landingStart + after;
        paint(
          jump.receivingCarrierId,
          chevron(s, track.halfWidthAt(s) * 0.56, 12, 1.5),
          PAINT.white,
        );
      }
    }
    for (const [id, geometries] of batches) {
      const geometry = mergeGeometries(geometries, false);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = `Nomad / ${id} painted deck cues`;
      mesh.userData.motionGroup = id;
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.set(id, mesh);
    }
  } catch (error) {
    for (const mesh of meshes.values()) mesh.geometry.dispose();
    material.dispose();
    throw error;
  } finally {
    for (const geometries of batches.values())
      for (const geometry of geometries) geometry.dispose();
    projector.dispose();
  }
  let disposed = false;
  const update = () => {
    if (disposed) return;
    for (const carrier of track.carriers) {
      const mesh = meshes.get(carrier.id);
      if (mesh)
        mesh.position.copy(
          sampleCarrierMotion(carrier, track.presentationTime ?? 0).translation,
        );
    }
  };
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      meshes.clear();
      material.dispose();
    },
  };
}
