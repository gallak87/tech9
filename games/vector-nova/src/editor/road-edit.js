import * as T from 'three';
import { createRouteSampler, editorDragCurve } from './route.js';

// Swept meshes retain a longitudinal coordinate on every vertex. Bind those
// rows to spline parameters once, then move the existing surface, underside,
// stripes and rails together. Geometry, materials and topology stay in place.
export function createRoadEdit(base, roadGroup, pickups) {
  const route = createRouteSampler(base);
  const count = base.points.length;
  const spans = route.closed ? count : count - 1;
  const previous = base.points.map((p) => ({ ...p }));
  const liveCurve = editorDragCurve(base);
  const rows = new Map();
  function rowAt(distance) {
    let row = rows.get(distance);
    if (!row) {
      row = { distance, ranges: [], instances: [], groups: [] };
      rows.set(distance, row);
    }
    return row;
  }

  const deckRows = [];
  for (const mesh of roadGroup.children) {
    if (mesh.isInstancedMesh) {
      const mounts = mesh.userData.instanceMetadata ?? [];
      const buffer = { mesh, attribute: mesh.instanceMatrix, original: null };
      for (const [instance, mount] of mounts.entries())
        if (mount)
          rowAt(mount.distance).instances.push({ buffer, instance, mount });
      continue;
    }
    const coord = mesh.geometry?.getAttribute('roadCoord');
    if (!coord) continue;
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const buffer = {
      mesh,
      position,
      normal,
      originalPosition: null,
      originalNormal: null,
    };
    let previousDistance = Infinity;
    let strip;
    for (let start = 0; start < coord.count;) {
      const distance = coord.getX(start);
      let end = start + 1;
      while (end < coord.count && coord.getX(end) === distance) end++;
      // A new profile face starts a new sweep down the route. Keep dirty
      // upload ranges separate for each face, even on a long folded course.
      if (distance <= previousDistance)
        strip = { buffer, first: Infinity, last: 0 };
      previousDistance = distance;
      const row = rowAt(distance);
      row.ranges.push({ strip, start, end });
      if (mesh.userData.drivingSurface) {
        row.deck = { position, start, end };
        deckRows.push(row);
      }
      start = end;
    }
  }
  for (const [index, device] of (pickups?.devices ?? []).entries()) {
    const group = pickups.group.children[index];
    group.updateMatrix();
    rowAt(device.distance).groups.push({
      group,
      original: group.matrix.clone(),
    });
  }
  const stations = [...rows.values()];
  const samples = route.prepareRollStations(
    stations.map((row) => row.distance),
  );
  const restAngles = samples.reader(base.points);
  const nearest = Array(count).fill(null);
  const nearestDelta = new Float64Array(count).fill(Infinity);
  for (const [i, row] of stations.entries()) {
    const { parameter, node, distance } = samples.stations[i];
    Object.assign(row, {
      parameter,
      node,
      index: i,
      center: route.positionAt(distance),
      tangent: route.tangentAt(distance),
      roll: restAngles.at(i),
    });
  }
  // Store actual mesh rows for diagnostics; a point in a gap has its closest
  // supported lip, and Point 1 can use either end of a closed surface.
  for (const row of deckRows) {
    if (row.distance < 0) continue;
    const p = row.parameter * spans;
    for (const side of [Math.floor(p), Math.ceil(p)]) {
      const index = side % count;
      const delta = Math.abs(p - side);
      if (delta < nearestDelta[index]) {
        nearestDelta[index] = delta;
        nearest[index] = row;
      }
    }
  }
  for (let i = 0; i < count; i++) {
    if (nearest[i]) continue;
    for (const row of deckRows) {
      const distance = Math.abs(row.parameter * spans - i);
      const delta = route.closed
        ? Math.min(distance, count - distance)
        : distance;
      if (delta < nearestDelta[i]) {
        nearest[i] = row;
        nearestDelta[i] = delta;
      }
    }
  }

  let active = false,
    revision = 0,
    changedRows = 0,
    lastPoint = -1;
  let lastClosure = restAngles.closure;
  const tangent = new T.Vector3(),
    center = new T.Vector3(),
    translated = new T.Vector3();
  const align = new T.Quaternion(),
    roll = new T.Quaternion();
  const transform = new T.Matrix4(),
    instanceMatrix = new T.Matrix4();
  const hidden = new T.Matrix4().makeScale(0, 0, 0);
  const pierTop = new T.Vector3();
  const strips = new Set();
  const originalCulling = new Map();
  function markMesh(mesh) {
    if (!originalCulling.has(mesh))
      originalCulling.set(mesh, mesh.frustumCulled);
    mesh.frustumCulled = false;
  }
  const changedSpans = new Uint8Array(spans),
    deformedSpans = new Uint8Array(spans);
  function mark(array, from, to) {
    for (let node = from; node <= to; node++) {
      if (route.closed) array[((node % spans) + spans) % spans] = 1;
      else if (node >= 0 && node < spans) array[node] = 1;
    }
  }
  const differentPosition = (a, b) => a.x !== b.x || a.y !== b.y || a.z !== b.z;
  const differentRoll = (a, b) => a.roll !== b.roll || a.bank !== b.bank;

  function applyRow(row, unchanged) {
    const m = transform.elements;
    for (const { strip, start, end } of row.ranges) {
      const b = strip.buffer;
      b.originalPosition ??= b.position.array.slice();
      b.originalNormal ??= b.normal.array.slice();
      const source = b.originalPosition,
        normals = b.originalNormal;
      const dest = b.position.array,
        directions = b.normal.array;
      const first = start * 3,
        last = end * 3;
      if (unchanged) {
        dest.set(source.subarray(first, last), first);
        directions.set(normals.subarray(first, last), first);
      } else {
        for (let j = first; j < last; j += 3) {
          const x = source[j],
            y = source[j + 1],
            z = source[j + 2];
          const nx = normals[j],
            ny = normals[j + 1],
            nz = normals[j + 2];
          dest[j] = m[0] * x + m[4] * y + m[8] * z + m[12];
          dest[j + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          dest[j + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          directions[j] = m[0] * nx + m[4] * ny + m[8] * nz;
          directions[j + 1] = m[1] * nx + m[5] * ny + m[9] * nz;
          directions[j + 2] = m[2] * nx + m[6] * ny + m[10] * nz;
        }
      }
      strip.first = Math.min(strip.first, first);
      strip.last = Math.max(strip.last, last);
      strips.add(strip);
      markMesh(b.mesh);
    }
    for (const { buffer, instance, mount } of row.instances) {
      const attribute = buffer.attribute;
      buffer.original ??= attribute.array.slice();
      instanceMatrix.fromArray(buffer.original, instance * 16);
      if (!unchanged) {
        if (mount.pierTop) {
          // Ordinary piers extend down to their last surveyed ground elevation.
          pierTop.copy(mount.pierTop).applyMatrix4(transform);
          const height = pierTop.y - mount.base;
          if (height <= 0) instanceMatrix.copy(hidden);
          else {
            instanceMatrix.setPosition(
              pierTop.x,
              mount.footing ? mount.base + 1.5 : mount.base + height / 2,
              pierTop.z,
            );
            if (!mount.footing) instanceMatrix.elements[5] = height;
          }
        } else if (mount.grounded) {
          // Cross-braced portals have to clear the surrounding decks. Leave
          // those affected pieces off until their surveyed geometry is ready.
          instanceMatrix.copy(hidden);
        } else instanceMatrix.premultiply(transform);
      }
      instanceMatrix.toArray(attribute.array, instance * 16);
      attribute.addUpdateRange(instance * 16, 16);
      attribute.needsUpdate = true;
      markMesh(buffer.mesh);
    }
    for (const { group, original } of row.groups) {
      group.matrix.copy(original);
      if (!unchanged) group.matrix.premultiply(transform);
      group.matrixAutoUpdate = unchanged;
      group.matrixWorldNeedsUpdate = true;
    }
  }

  function update(doc, selected = []) {
    if (
      doc.id !== base.id ||
      doc.courseType !== base.courseType ||
      doc.width !== base.width ||
      doc.points.length !== count ||
      doc.points.some((p, i) => p.id !== base.points[i].id)
    ) {
      clear();
      return false;
    }
    if (selected.length) lastPoint = selected[0];
    changedSpans.fill(0);
    deformedSpans.fill(0);
    let anyChange = false,
      anyDeviation = false;
    for (const [i, p] of doc.points.entries()) {
      const prev = previous[i],
        initial = base.points[i];
      if (differentPosition(p, initial)) {
        mark(deformedSpans, i - 2, i + 1);
        anyDeviation = true;
      }
      anyDeviation ||= differentRoll(p, initial);
      const moved = differentPosition(p, prev);
      const rotated = differentRoll(p, prev);
      if (!moved && !rotated) continue;
      // Four controls influence each centripetal segment. A roll uses two.
      mark(changedSpans, moved ? i - 2 : i - 1, moved ? i + 1 : i);
      if (moved) liveCurve.points[i].set(p.x, p.y, p.z);
      Object.assign(prev, {
        x: p.x,
        y: p.y,
        z: p.z,
        roll: p.roll,
        bank: p.bank,
      });
      anyChange = true;
    }
    if (!anyChange) return true;
    const angles = samples.reader(doc.points);
    const closure = angles.closure;
    const changedReturn =
      closure?.start !== lastClosure?.start ||
      closure?.angle !== lastClosure?.angle;
    const returnStart = changedReturn
      ? Math.min(closure?.start ?? Infinity, lastClosure?.start ?? Infinity)
      : Infinity;
    if (Boolean(closure) !== Boolean(lastClosure)) changedSpans[spans - 1] = 1;
    lastClosure = closure;
    changedRows = 0;
    for (const row of stations) {
      if (!changedSpans[row.node] && row.distance < returnStart) continue;
      const turn = angles.at(row.index) - row.roll;
      const moved = Boolean(deformedSpans[row.node]);
      const unchanged = !moved && Math.abs(turn) < 1e-12;
      if (!unchanged) {
        if (moved) {
          liveCurve.getPoint(row.parameter, center);
          liveCurve.getTangent(row.parameter, tangent);
          if (tangent.lengthSq() < 1e-12) tangent.copy(row.tangent);
        } else {
          center.copy(row.center);
          tangent.copy(row.tangent);
        }
        align.setFromUnitVectors(row.tangent, tangent);
        roll.setFromAxisAngle(tangent, turn).multiply(align);
        // p' = newCenter + Q (p - baseCenter)
        translated.copy(row.center).applyQuaternion(roll).negate().add(center);
        transform.makeRotationFromQuaternion(roll).setPosition(translated);
      }
      applyRow(row, unchanged);
      changedRows++;
    }
    for (const strip of strips) {
      for (const attribute of [strip.buffer.position, strip.buffer.normal]) {
        attribute.addUpdateRange(strip.first, strip.last - strip.first);
        attribute.needsUpdate = true;
      }
      strip.first = Infinity;
      strip.last = 0;
    }
    strips.clear();
    if (!anyDeviation) {
      for (const [mesh, culling] of originalCulling)
        mesh.frustumCulled = culling;
      originalCulling.clear();
    }
    active = anyDeviation;
    revision++;
    return true;
  }
  function clear() {
    if (active) update(base);
  }
  function getState(index = lastPoint) {
    const row = nearest[index];
    let sample = null;
    if (row) {
      const { position, start, end } = row.deck;
      const left = new T.Vector3().fromBufferAttribute(position, start);
      const right = new T.Vector3().fromBufferAttribute(position, end - 1);
      sample = {
        pointIndex: index,
        station: row.distance,
        left: left.toArray(),
        right: right.toArray(),
        center: left.add(right).multiplyScalar(0.5).toArray(),
      };
    }
    return { active, revision, changedRows, sample };
  }
  return { update, clear, getState };
}
