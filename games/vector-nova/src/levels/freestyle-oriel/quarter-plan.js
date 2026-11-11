import * as T from 'three';
import { createOrielTrack } from '../oriel/track/model.js';
import { foundedSunvaultFootY } from './civic-works.js';

const Y = new T.Vector3(0, 1, 0);
const TARGET_DISTANCE = 6100;
const QUARTER_HEIGHT_OFFSET = -80;
const SEATS = [
  { name: 'south quay and low loggia', distance: 390, lateral: -76 },
  { name: 'north quay and low loggia', distance: 716, lateral: -76 },
  { name: 'south residential wing', distance: 390, lateral: -160 },
  { name: 'north civic wing', distance: 713, lateral: -165 },
  { name: 'rear garden gallery south', distance: 490, lateral: -250 },
  { name: 'rear garden gallery north', distance: 640, lateral: -250 },
];

function frameMatrix(frame) {
  return new T.Matrix4()
    .makeBasis(frame.right, frame.up, frame.tangent)
    .setPosition(frame.position);
}

function sourceParts(sourceGroup, matrix) {
  const parts = [];
  sourceGroup.traverse((mesh) => {
    if (!mesh.isMesh) return;
    parts.push({
      geometry: mesh.geometry,
      matrix: matrix.clone().multiply(mesh.matrixWorld),
      material: mesh.material,
    });
  });
  if (!parts.length)
    throw new Error('Sunvault quarter requires actual source geometry');
  return parts;
}

// Query real lower limestone faces, never an architectural AABB interpreted
// as a solid. World-vertical rays also respect the quarter's tilted foundation.
function lowerSeat(parts, x, z) {
  const ray = new T.Ray(new T.Vector3(x, -6000, z), Y),
    triangle = new T.Triangle(),
    point = new T.Vector3();
  let best = null;
  for (const part of parts) {
    if (!/warm limestone/.test(part.material?.name ?? '')) continue;
    const p = part.geometry.getAttribute('position'),
      index = part.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      triangle.a
        .fromBufferAttribute(p, index ? index.getX(i) : i)
        .applyMatrix4(part.matrix);
      triangle.b
        .fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1)
        .applyMatrix4(part.matrix);
      triangle.c
        .fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2)
        .applyMatrix4(part.matrix);
      const hit = ray.intersectTriangle(
        triangle.a,
        triangle.b,
        triangle.c,
        false,
        point,
      );
      if (
        !hit ||
        triangle.getNormal(new T.Vector3()).y >= -0.03 ||
        (best && hit.y >= best.point.y)
      )
        continue;
      best = {
        point: point.clone(),
        triangle: i / 3,
        material: part.material.name,
      };
    }
  }
  return best;
}

/** CPU validation phase follows actual transfer ownership. Before takeoff
 * the ship/camera remain on the road; the full wide transfer envelope stays
 * active through the complete landing and recovery, not only the open gap. */
export function sunvaultQuarterClearanceEnvelope(track, distance) {
  const airborne = track.jumps.some(
    (jump) => distance >= jump.takeoff && distance <= jump.recovery,
  );
  const width = track.width / 2 + (airborne ? 55 : 14);
  return {
    phase: airborne ? 'transfer' : 'grounded',
    min: new T.Vector3(-width, -12, -16),
    max: new T.Vector3(width, airborne ? 420 : 90, 16),
  };
}

function clearPlan(track, parts) {
  const box = new T.Box3(),
    triangle = new T.Triangle(),
    blockers = [];
  let frames = 0,
    triangles = 0;
  const localBounds = parts.map((part) => {
    const positions = part.geometry.getAttribute('position'),
      bounds = new T.Box3();
    for (let i = 0; i < positions.count; i++)
      bounds.expandByPoint(new T.Vector3().fromBufferAttribute(positions, i));
    return bounds;
  });
  for (let s = 0; s <= track.length; s += 16) {
    frames++;
    const frame = track.sample(s),
      inverse = frameMatrix(frame).invert();
    const envelope = sunvaultQuarterClearanceEnvelope(track, s);
    box.set(envelope.min, envelope.max);
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j],
        matrix = inverse.clone().multiply(part.matrix);
      if (!localBounds[j].clone().applyMatrix4(matrix).intersectsBox(box))
        continue;
      const p = part.geometry.getAttribute('position'),
        index = part.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        triangle.a
          .fromBufferAttribute(p, index ? index.getX(i) : i)
          .applyMatrix4(matrix);
        triangle.b
          .fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1)
          .applyMatrix4(matrix);
        triangle.c
          .fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2)
          .applyMatrix4(matrix);
        triangles++;
        if (box.intersectsTriangle(triangle)) {
          blockers.push({ distance: s, part: j, triangle: i / 3 });
          break;
        }
      }
    }
    if (blockers.length > 8) break;
  }
  return {
    safe: !blockers.length,
    frames,
    triangles,
    blockers,
    box: 'Banked road/camera X ±40 m, Y −12..90 m; actual takeoff through full recovery X ±81 m,Y −12..420 m;16 m longitudinal overlapping halves',
  };
}

/** One rigid, complete canonical quarter with measured lower-foundation
 * bearings and existing formed piers reaching the actual inhabited shell.
 * Inputs remain borrowed and unchanged; the returned matrices own no GPU data.
 */
export function createSunvaultQuarterPlan({ track, sourceGroup, pierParts }) {
  if (!pierParts?.length)
    throw new Error('Sunvault quarter requires the formed anchor_pier');
  const original = createOrielTrack(),
    sourceFrame = original.sample(560),
    targetFrame = track.sample(TARGET_DISTANCE);
  // Architecture follows the habitat's world-upright civic language; the
  // banked stunt-road frame remains solely the protected driving envelope.
  const forward = targetFrame.tangent.clone().setY(0).normalize();
  const civicRight = Y.clone().cross(forward).normalize();
  const target = new T.Matrix4().makeBasis(civicRight, Y, forward);
  target.setPosition(
    targetFrame.position
      .clone()
      .addScaledVector(civicRight, -35)
      .addScaledVector(Y, QUARTER_HEIGHT_OFFSET),
  );
  const matrix = target.multiply(frameMatrix(sourceFrame).invert()),
    parts = sourceParts(sourceGroup, matrix);
  const pierBounds = new T.Box3();
  for (const part of pierParts) {
    const p = part.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      pierBounds.expandByPoint(new T.Vector3().fromBufferAttribute(p, i));
  }
  const heading = targetFrame.tangent.clone().setY(0).normalize();
  const yaw = new T.Quaternion().setFromAxisAngle(
    Y,
    Math.atan2(heading.x, heading.z),
  );
  const foundations = [],
    bearings = [],
    seats = [];
  for (const definition of SEATS) {
    const f = original.sample(definition.distance);
    const nominal = f.position
      .clone()
      .addScaledVector(f.right, definition.lateral)
      .applyMatrix4(matrix);
    const hit = lowerSeat(parts, nominal.x, nominal.z);
    if (!hit)
      throw new Error(
        `Sunvault quarter lower foundation missing: ${definition.name}`,
      );
    // The canonical quarter retains its gentle curved foundation. A
    // restrained positive horizontal scale gives each formed cap a real
    // inset seat beneath its occupied gallery rather than a projecting slab.
    const horizontal = 0.45,
      capHeight = hit.point.y + 6;
    const foot = foundedSunvaultFootY(hit.point, yaw);
    const scaleY = (capHeight - foot) / (pierBounds.max.y - pierBounds.min.y);
    if (!(scaleY > 0))
      throw new Error('Sunvault quarter bearing lies below its shell footing');
    const position = new T.Vector3(
      hit.point.x,
      foot - pierBounds.min.y * scaleY,
      hit.point.z,
    );
    const transform = new T.Matrix4().compose(
      position,
      yaw,
      new T.Vector3(horizontal, scaleY, horizontal),
    );
    foundations.push(transform);
    bearings.push(hit.point.clone());
    seats.push({
      ...definition,
      point: hit.point.toArray(),
      actualSourceTriangle: hit.triangle,
      material: hit.material,
      capInsetMetres: 6,
      footY: foot,
      positiveScale: [horizontal, scaleY, horizontal],
    });
  }
  return {
    matrix,
    foundations,
    bearings,
    provenance: {
      source:
        'Public canonical Oriel garden quarter, source-frame560→Sunvault6100, world-upright flattened heading, camera-high physical side, −35 m civic-right, unit rigid scale',
      sourceAsset: 'public/assets/levels/oriel/oriel-garden-quarter.glb',
      foundationAsset:
        'public/assets/levels/freestyle-oriel/sunvault-civic-works.glb#anchor_pier',
      sourceFrame: 560,
      targetFrame: TARGET_DISTANCE,
      worldVerticalOffset: QUARTER_HEIGHT_OFFSET,
      seats,
      shellContact:
        'Full canonical foot-corner minimum radius5000 shell height, including centre crossing;10 m embedment; narrower positive foot is contained in this conservative footprint',
      clearanceVerifier: 'verifySunvaultQuarterPlan',
    },
  };
}

/** CPU/source audit only. Runtime planning retains real bearing queries but
 * does not repeat a complete route-versus-source triangle audit on each load. */
export function verifySunvaultQuarterPlan({
  track,
  sourceGroup,
  pierParts,
  plan,
}) {
  const parts = sourceParts(sourceGroup, plan.matrix);
  for (const matrix of plan.foundations)
    for (const part of pierParts)
      parts.push({ geometry: part.geometry, matrix, material: part.material });
  return clearPlan(track, parts);
}
