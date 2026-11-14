import * as T from 'three';
import { createReferenceFrames } from '../track/frames.js';

const smooth = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (10 + t * (-15 + 6 * t));
const TAU = Math.PI * 2;
const routeCache = new Map();
const arcCache = new Map();
export function routeCurve(doc, arcDivisions = null) {
  const points = doc.points.map((p) => new T.Vector3(p.x, p.y, p.z));
  const closed = doc.courseType !== 'downhill';
  let roughLength = 0;
  for (let i = 1; i < points.length; i++)
    roughLength += points[i].distanceTo(points[i - 1]);
  if (closed && points.length > 1)
    roughLength += points[0].distanceTo(points.at(-1));
  const requestedDivisions =
    arcDivisions ??
    Math.min(131072, Math.max(8192, Math.ceil(roughLength * 4)));
  // Catmull-Rom changes its parameter speed at authored nodes. Put every
  // knot exactly on an arc-table boundary instead of interpolating across it.
  const segments = Math.max(1, closed ? points.length : points.length - 1);
  const divisions = Math.ceil(requestedDivisions / segments) * segments;
  const curve = new T.CatmullRomCurve3(points, closed, 'centripetal');
  curve.arcLengthDivisions = divisions;
  const key = JSON.stringify([
    closed,
    divisions,
    doc.points.map((p) => [p.x, p.y, p.z]),
  ]);
  const cached = arcCache.get(key);
  if (cached) {
    arcCache.delete(key);
    arcCache.set(key, cached);
    curve.cacheArcLengths = cached;
    curve.needsUpdate = false;
  } else {
    curve.updateArcLengths();
    // Each returned curve owns its editable vectors. Only the immutable length
    // table is shared, so settings/name edits do not rebuild 80k arc samples.
    Object.freeze(curve.cacheArcLengths);
    if (arcCache.size >= 8) arcCache.delete(arcCache.keys().next().value);
    arcCache.set(key, curve.cacheArcLengths);
  }
  return curve;
}

/** One pure CPU sampler shared by authoring validation, rendering and physics. */
export function createRouteSampler(doc) {
  const key = JSON.stringify([
    doc.courseType ?? 'circuit',
    doc.points,
    doc.rolls ?? [],
    doc.autoCloseRoll ?? false,
    doc.autoCloseRoll
      ? (doc.jumps ?? []).map((j) => [j.start, j.end, j.receiving])
      : null,
  ]);
  const cached = routeCache.get(key);
  if (cached) {
    routeCache.delete(key);
    routeCache.set(key, cached);
    return cached;
  }
  // Samplers own immutable input copies; mutating an authoring draft cannot
  // change cached frames used by a live test drive.
  doc = {
    ...doc,
    points: doc.points.map((p) => ({ ...p })),
    rolls: (doc.rolls ?? []).map((r) => ({ ...r })),
  };
  const curve = routeCurve(doc),
    length = curve.getLength();
  if (!Number.isFinite(length) || length < 1)
    throw new Error('The road points do not form a circuit');
  const closed = doc.courseType !== 'downhill';
  const wrap = (s) =>
    closed
      ? T.MathUtils.euclideanModulo(s, length)
      : T.MathUtils.clamp(s, 0, length);
  const positionAt = (s) => {
    const position = curve.getPointAt(wrap(s) / length);
    if (!closed && s < 0)
      position.addScaledVector(curve.getTangentAt(0).normalize(), s);
    return position;
  };
  const tangentAt = (s) =>
    positionAt(s + 0.5)
      .sub(positionAt(s - 0.5))
      .normalize();
  const count = Math.ceil(length / 1.5),
    step = length / count;
  const tangents = Array.from({ length: count + 1 }, (_, i) =>
    tangentAt(i * step),
  );
  const references = createReferenceFrames(tangents, step, closed);
  // The transported reference axes remain defined at vertical route tangents.
  const raw = Array.from({ length: count }, (_, i) => {
    const right = new T.Vector3(1, 0, 0).applyQuaternion(references[i]);
    return T.MathUtils.clamp(
      -tangentAt(i * step + 2)
        .sub(tangentAt(i * step - 2))
        .multiplyScalar(0.25)
        .dot(right) * 110,
      -0.38,
      0.38,
    );
  });
  const bankRadius = Math.ceil(48 / step);
  const banks = raw.map((_, i) => {
    let value = 0,
      weight = 0;
    for (let offset = -bankRadius; offset <= bankRadius; offset++) {
      const w = bankRadius + 1 - Math.abs(offset);
      value +=
        raw[
          closed
            ? T.MathUtils.euclideanModulo(i + offset, count)
            : T.MathUtils.clamp(i + offset, 0, count - 1)
        ] * w;
      weight += w;
    }
    return value / weight;
  });
  let rollClosure = null;
  if (closed && doc.autoCloseRoll) {
    const first = doc.points[0].roll ?? 0,
      last = doc.points.at(-1).roll ?? 0;
    const winding = (last - first) / TAU;
    let turns = Math.round(winding);
    if (Math.abs(Math.abs(winding - turns) - 0.5) < 1e-8)
      turns = winding < 0 ? Math.floor(winding) : Math.ceil(winding);
    const correction = first + turns * TAU - last;
    if (Math.abs(correction) > 1e-7) {
      let changed = 0;
      for (let i = 1; i < doc.points.length; i++)
        if (
          Math.abs((doc.points[i].roll ?? 0) - (doc.points[i - 1].roll ?? 0)) >
          1e-7
        )
          changed = i;
      const lengths = curve.getLengths(),
        parameter = (changed / doc.points.length) * (lengths.length - 1),
        low = Math.floor(parameter);
      const authoredEnd = T.MathUtils.lerp(
        lengths[low],
        lengths[Math.min(low + 1, lengths.length - 1)],
        parameter - low,
      );
      const required = Math.ceil((Math.abs(correction) * 1.875) / 0.022),
        desired = Math.max(160, (Math.abs(correction) * 1.875) / 0.018);
      const jumpEnd = Math.max(
        0,
        ...(doc.jumps ?? []).map((j) => j.end * length + j.receiving + 80),
      );
      const start = Math.min(
        length,
        Math.max(authoredEnd, jumpEnd, length - desired),
      );
      const valid = length - start >= required;
      const reason =
        jumpEnd >= authoredEnd && jumpEnd > length - desired
          ? `Not enough clear road after the final jump for a smooth circuit return. Leave at least ${required} m after its receiving corridor, or complete another rotation before it.`
          : `This circuit return needs at least ${required} m after the shaped section. End the section earlier or add the next chunk to complete a full turn.`;
      rollClosure = Object.freeze({
        start,
        end: length,
        angle: correction,
        required,
        valid,
        reason: valid ? null : reason,
      });
    }
  }
  function anglesAt(s) {
    const distance = wrap(s),
      index = distance / step,
      low = Math.min(count - 1, Math.floor(index)),
      blend = index - low;
    const t = curve.getUtoTmapping(distance / length),
      p = t * (closed ? doc.points.length : doc.points.length - 1);
    const node = Math.min(
        closed ? doc.points.length - 1 : doc.points.length - 2,
        Math.floor(p),
      ),
      fraction = p - node,
      first = doc.points[node % doc.points.length],
      next = doc.points[(node + 1) % doc.points.length];
    const bank = T.MathUtils.clamp(
      T.MathUtils.lerp(
        banks[low % count],
        banks[closed ? (low + 1) % count : Math.min(low + 1, count - 1)],
        blend,
      ) + T.MathUtils.lerp(first.bank, next.bank, smooth(fraction)),
      -0.6,
      0.6,
    );
    const firstRoll = first.roll ?? 0;
    // Ordinary edges preserve intentional unwrapped turns. The closing edge
    // reaches the equivalent first angle nearest the final authored angle.
    let nextRoll = next.roll ?? 0;
    if (closed && node === doc.points.length - 1) {
      if (rollClosure) nextRoll = firstRoll;
      else nextRoll += TAU * Math.round((firstRoll - nextRoll) / TAU);
    }
    let authoredRoll = T.MathUtils.lerp(firstRoll, nextRoll, smooth(fraction));
    if (rollClosure)
      authoredRoll +=
        rollClosure.angle *
        smoother(
          T.MathUtils.clamp(
            (distance - rollClosure.start) /
              Math.max(1e-6, length - rollClosure.start),
            0,
            1,
          ),
        );
    for (const feature of doc.rolls ?? []) {
      const u = T.MathUtils.clamp(
        (distance / length - feature.start) / (feature.end - feature.start),
        0,
        1,
      );
      authoredRoll += feature.turns * TAU * smoother(u);
    }
    return { bank, authoredRoll, roll: bank + authoredRoll };
  }
  function sample(s) {
    const distance = wrap(s),
      index = distance / step,
      low = Math.min(count - 1, Math.floor(index));
    const rotation = references[low]
      .clone()
      .slerp(references[low + 1], index - low);
    const tangent = tangentAt(distance),
      angles = anglesAt(distance);
    rotation.multiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), angles.roll),
    );
    const right = new T.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    );
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(right);
    return {
      position: positionAt(distance),
      tangent,
      right,
      up,
      quaternion,
      curvature,
      bank: Math.atan2(Math.sin(angles.roll), Math.cos(angles.roll)),
      roll: angles.roll,
      authoredRoll: angles.authoredRoll,
      automaticBank: angles.bank,
    };
  }
  const result = {
    curve,
    length,
    closed,
    sample,
    anglesAt,
    positionAt,
    frameStep: step,
    rollClosure,
  };
  if (routeCache.size >= 4) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(key, result);
  return result;
}
