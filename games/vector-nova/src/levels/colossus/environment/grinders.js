import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSurfaceProjector } from '../../../pickups/surface-projector.js';
import { sheetGeometry } from '../track/surface.js';
import {
  CROSSFEED_RULES,
  crossfeedBounds,
  crossfeedTravel,
} from '../mechanics.js';
import { createColossusConveyors } from './conveyors.js';

const TOOTH_HALF_WIDTH = 1.55;
const ROW_PITCH = 5.8;
const SAMPLE_STEP = 0.5;
const ROOT_BURIAL = 0.8 * 0.68;

function chisel(profile) {
  const shape = new T.Shape();
  profile.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 3.6,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -1.8);
  return geometry;
}

/** Presentation-only cutting belt. Runtime supplies bounded drag and rumble;
 * the small teeth deliberately never become collision bodies. */
export function createColossusGrinders({
  track,
  paint = null,
  shape = false,
  finish = null,
}) {
  const conveyor = createColossusConveyors({ track, paint, shape });
  const group = new T.Group();
  group.name = 'Colossus / coarse crossfeed grinding beds';
  group.add(conveyor.group);
  // Retain the moving link seams and fixed safety boundaries beneath the tools.
  conveyor.group.traverse((object) => {
    if (!object.material?.userData.travel) return;
    object.material.color.set('#303a40');
    object.material.roughness = 0.7;
    object.material.metalness = 0.52;
  });
  const cast = new T.MeshStandardMaterial({
    name: 'Grinder / replaceable cast cutting blocks',
    color: '#495356',
    roughness: 0.74,
    metalness: 0.54,
  });
  const steel = new T.MeshStandardMaterial({
    name: 'Grinder / exposed chisel cutting edges',
    color: '#a0aead',
    roughness: 0.38,
    metalness: 0.82,
  });
  if (!shape) {
    finish?.bind(cast, 'cast');
    finish?.bind(steel, 'steel');
  }
  const body = chisel([
    [-1.4, -0.8],
    [1.4, -0.8],
    [1.4, 0.56],
    [1.1, 0.78],
    [0.6, 0.78],
    [-1.4, 0.16],
  ]);
  const edge = chisel([
    [-0.15, 0.57],
    [0.6, 0.78],
    [1.1, 0.78],
    [1.4, 0.56],
    [1.53, 0.66],
    [1.16, 0.94],
    [0.55, 0.94],
    [-0.2, 0.68],
  ]);
  const teeth = mergeGeometries([body, edge], true);
  body.dispose();
  edge.dispose();
  // The cutting lip stays below the fleet hover datum, while contact response
  // comes from the bounded runtime rumble rather than sharp collision solids.
  teeth.scale(1, 0.68, 1);
  teeth.computeBoundingSphere();

  // Reuse the road's exact 150 m tiles, then retain only a compact lateral
  // lookup for each cutting row. No surface searches or objects are allocated
  // while the belt runs. Banks and the current route remain the source of truth.
  const sheets = [];
  const temporary = new T.MeshBasicMaterial();
  for (const run of track.runs)
    for (let a = run.start; a < run.end - 0.01; a += 150) {
      const b = Math.min(run.end, a + 150);
      if (!track.belts.some((belt) => a < belt.end + 4 && b > belt.start - 4))
        continue;
      sheets.push(new T.Mesh(sheetGeometry(track, a, b), temporary));
    }
  const surface = createSurfaceProjector(track, sheets);
  sheets.forEach((mesh) => mesh.geometry.dispose());
  temporary.dispose();
  const batches = [],
    strips = [];
  const basis = new T.Matrix4();
  for (const belt of track.belts) {
    const { min, max } = crossfeedBounds(belt);
    const inner = CROSSFEED_RULES.inner + 0.75;
    const outer = CROSSFEED_RULES.outer - 0.75;
    const columns = Math.ceil((outer - inner) / CROSSFEED_RULES.treadPitch) + 2;
    const rows = [];
    for (
      let d = belt.start + 4, row = 0;
      d < belt.end - 3;
      d += ROW_PITCH, row++
    ) {
      const samples = [];
      for (
        let lateral = min;
        lateral <= max + SAMPLE_STEP * 0.5;
        lateral += SAMPLE_STEP
      ) {
        const point = surface.sample(d, lateral);
        const right = surface
          .sample(d, Math.min(35.8, lateral + 0.12))
          .sub(surface.sample(d, Math.max(-35.8, lateral - 0.12)))
          .normalize();
        const forward = surface
          .sample(d + 0.12, lateral)
          .sub(surface.sample(d - 0.12, lateral))
          .normalize();
        const up = forward.clone().cross(right).normalize();
        forward.copy(right).cross(up).normalize();
        basis.makeBasis(right, up, forward);
        samples.push({
          point,
          rotation: new T.Quaternion().setFromRotationMatrix(basis),
        });
      }
      rows.push({
        distance: d,
        offset: (row % 2) * CROSSFEED_RULES.treadPitch * 0.5,
        engagement:
          T.MathUtils.smoothstep(d, belt.start + 1, belt.start + 14) *
          (1 - T.MathUtils.smoothstep(d, belt.end - 14, belt.end - 1)),
        samples,
      });
    }
    const instances = new T.InstancedMesh(
      teeth,
      [cast, steel],
      rows.length * columns,
    );
    instances.name = belt.id + ' / moving staggered grinder teeth';
    instances.castShadow = instances.receiveShadow = true;
    instances.instanceMatrix.setUsage(T.DynamicDrawUsage);
    instances.userData.grinderSurface = true;
    instances.userData.presentationOnly = true;
    instances.userData.grinder = {
      id: belt.id,
      side: belt.side,
      min,
      max,
      rows: rows.length,
      columns,
    };
    instances.userData.grinderCoordinates = new Float32Array(
      instances.count * 2,
    );
    group.add(instances);
    batches.push({ belt, min, inner, outer, columns, rows, instances });
    // Fixed catcher rails cover the return slots at both moving edges. Their
    // geometry is clipped onto the running triangles, including every bank.
    for (const [a, b] of [
      [min + 0.1, min + 0.7],
      [max - 0.7, max - 0.1],
    ]) {
      const geometry = surface.geometry(
        [
          [
            [a, belt.start + 1.3],
            [b, belt.start + 1.3],
            [b, belt.end - 1.3],
            [a, belt.end - 1.3],
          ],
        ],
        0.17,
        0.04,
      );
      const coordinates = geometry.attributes.roadCoord;
      geometry.setAttribute('uv', coordinates.clone());
      const strip = new T.Mesh(geometry, cast);
      strip.name = belt.id + ' / fixed grinder return-slot cover';
      strip.castShadow = strip.receiveShadow = true;
      strip.userData.presentationOnly = true;
      group.add(strip);
      strips.push(geometry);
    }
  }
  surface.dispose();
  const position = new T.Vector3(),
    rotation = new T.Quaternion();
  const normal = new T.Vector3();
  const scale = new T.Vector3(),
    matrix = new T.Matrix4();
  const reverse = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    Math.PI,
  );
  let disposed = false;
  function update({ time = 0 } = {}) {
    if (disposed) return;
    conveyor.update({ time });
    const travel = crossfeedTravel(time);
    for (const batch of batches) {
      const { belt, min, inner, outer, columns, rows, instances } = batch;
      const period = columns * CROSSFEED_RULES.treadPitch;
      const phase = T.MathUtils.euclideanModulo(travel, period);
      let index = 0;
      for (const row of rows) {
        for (let column = 0; column < columns; column++) {
          const center =
            inner +
            T.MathUtils.euclideanModulo(
              column * CROSSFEED_RULES.treadPitch + phase + row.offset,
              period,
            ) -
            CROSSFEED_RULES.treadPitch;
          const left = Math.max(inner, center - TOOTH_HALF_WIDTH);
          const right = Math.min(outer, center + TOOTH_HALF_WIDTH);
          const width = Math.max(0, right - left);
          const edgeEngagement =
            T.MathUtils.smoothstep(center, inner - 0.2, inner + 1.6) *
            (1 - T.MathUtils.smoothstep(center, outer - 1.6, outer + 0.2));
          const height = row.engagement * edgeEngagement;
          // Compact the live span instead of hiding returned tools with zero
          // scale: singular normal transforms can contaminate the HDR buffer.
          if (width < 0.08 || height < 0.025) continue;
          const lateral =
            belt.side * T.MathUtils.clamp((left + right) * 0.5, inner, outer);
          const offset = T.MathUtils.clamp(
            (lateral - min) / SAMPLE_STEP,
            0,
            row.samples.length - 1,
          );
          const i = Math.min(Math.floor(offset), row.samples.length - 2),
            t = offset - i;
          position.copy(row.samples[i].point).lerp(row.samples[i + 1].point, t);
          rotation
            .copy(row.samples[i].rotation)
            .slerp(row.samples[i + 1].rotation, t);
          if (belt.side < 0) rotation.multiply(reverse);
          // A fixed buried root spans the small changes of plane between road
          // triangles. Edge tools retract into the bed instead of floating as
          // their height falls; fully engaged cutting lips stay at 0.64 m.
          normal.set(0, 1, 0).applyQuaternion(rotation);
          position.addScaledVector(normal, -ROOT_BURIAL * (1 - height));
          scale.set(width / (TOOTH_HALF_WIDTH * 2), height, 1);
          matrix.compose(position, rotation, scale);
          instances.setMatrixAt(index, matrix);
          instances.userData.grinderCoordinates[index * 2] = row.distance;
          instances.userData.grinderCoordinates[index * 2 + 1] = lateral;
          index++;
        }
      }
      instances.count = index;
      instances.instanceMatrix.needsUpdate = true;
    }
  }
  update();
  for (const { instances } of batches) {
    instances.computeBoundingBox();
    instances.boundingBox.expandByScalar(CROSSFEED_RULES.treadPitch + 2);
    instances.boundingSphere = instances.boundingBox.getBoundingSphere(
      new T.Sphere(),
    );
  }
  return {
    group,
    update,
    setReflection(texture) {
      conveyor.setReflection(texture);
      for (const material of [cast, steel]) {
        material.envMap = texture;
        material.envMapIntensity = 0.55;
        material.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      conveyor.dispose();
      group.clear();
      batches.forEach(({ instances }) => instances.dispose());
      strips.forEach((geometry) => geometry.dispose());
      teeth.dispose();
      cast.dispose();
      steel.dispose();
    },
  };
}
