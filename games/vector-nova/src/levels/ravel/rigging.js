import * as T from 'three';
import { createIndustrialKit } from '@worldkit/environment/industrial';

const Y = new T.Vector3(0, 1, 0);
const ONE = new T.Vector3(1, 1, 1);
const clamp = T.MathUtils.clamp;
const valueAt = (value, distance) =>
  typeof value === 'function' ? value(distance) : value;
const routeGap = (track, distance) =>
  track.jumps.some(
    (jump) =>
      !jump.optional && distance > jump.takeoff && distance < jump.landingStart,
  );
const routeDelta = (track, a, b) =>
  Math.min(Math.abs(a - b), track.length - Math.abs(a - b));

/** Connected sail-edge machinery. The supplied finish remains parent-owned. */
export function createRavelRigging({ track, finish = null }) {
  const group = new T.Group();
  group.name = 'Ravel / connected sail rigging';
  const kit = createIndustrialKit({ finish });
  kit.materials.shell.color.set('#d4ccbb');
  kit.materials.dark.color.set('#293035');
  kit.materials.cast.color.set('#454641');
  kit.materials.steel.color.set('#889092');
  kit.materials.machined.color.set('#b7bec0');
  kit.materials.amber.color.set('#a5744b');
  const ownGeometry = new Set();
  const normalized = new Map();
  const batches = new Map();
  const assembled = [];
  const rejected = [];
  let cableCount = 0;

  function geometry(source, material) {
    const key =
      source.uuid +
      (material === kit.materials.machined ? '/machined' : '/plain');
    if (!normalized.has(key)) {
      const result = source.index ? source.toNonIndexed() : source.clone();
      if (
        material === kit.materials.machined &&
        !result.hasAttribute('industrialCoord')
      )
        result.setAttribute(
          'industrialCoord',
          result.attributes.position.clone(),
        );
      if (material !== kit.materials.machined)
        result.deleteAttribute('industrialCoord');
      ownGeometry.add(result);
      normalized.set(key, result);
    }
    return normalized.get(key);
  }
  function add(source, material, matrix, name) {
    const resolved = geometry(source, material);
    if (!batches.has(material)) batches.set(material, new Map());
    const entries = batches.get(material);
    if (!entries.has(resolved))
      entries.set(resolved, { geometry: resolved, matrices: [], name });
    entries.get(resolved).matrices.push(matrix.clone());
  }
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const cableGeometry = new T.CylinderGeometry(1, 1, 1, 8, 1);
  const barrelGeometry = new T.CylinderGeometry(1, 1, 1, 24, 1);
  const coilGeometry = new T.TorusGeometry(5.75, 0.3, 6, 32);
  [boxGeometry, cableGeometry, barrelGeometry, coilGeometry].forEach((item) =>
    ownGeometry.add(item),
  );
  const qX = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    Math.PI / 2,
  );
  const qAxle = new T.Quaternion().setFromAxisAngle(Y, Math.PI / 2);
  const matrixAt = (point, quaternion, scale = ONE) =>
    new T.Matrix4().compose(point, quaternion, scale);
  function box(
    point,
    quaternion,
    dimensions,
    material = kit.materials.dark,
    name = 'formed load carrier',
  ) {
    add(
      boxGeometry,
      material,
      matrixAt(point, quaternion, new T.Vector3(...dimensions)),
      name,
    );
  }
  function beam(
    from,
    to,
    thickness,
    material = kit.materials.dark,
    depth = thickness,
    name = 'load tie',
  ) {
    const delta = to.clone().sub(from);
    if (delta.lengthSq() < 1e-6) return;
    const q = new T.Quaternion().setFromUnitVectors(
      Y,
      delta.clone().normalize(),
    );
    add(
      boxGeometry,
      material,
      matrixAt(
        from.clone().add(to).multiplyScalar(0.5),
        q,
        new T.Vector3(thickness, delta.length(), depth),
      ),
      name,
    );
  }
  function cable(from, to, radius = 0.42) {
    const delta = to.clone().sub(from);
    if (delta.lengthSq() < 1e-6) return;
    add(
      cableGeometry,
      kit.materials.steel,
      matrixAt(
        from.clone().add(to).multiplyScalar(0.5),
        new T.Quaternion().setFromUnitVectors(Y, delta.clone().normalize()),
        new T.Vector3(radius, delta.length(), radius),
      ),
      'taut multi-strand sail stay',
    );
    cableCount++;
  }
  function assembly(name, point, quaternion, scale) {
    const matrix = matrixAt(
      point,
      quaternion,
      new T.Vector3(scale, scale, scale),
    );
    for (const part of kit.prototypes[name])
      add(part.geometry, part.material, matrix, name);
  }
  function offset(frame, origin, across, up, along = 0) {
    return origin
      .clone()
      .addScaledVector(frame.right, across)
      .addScaledVector(frame.up, up)
      .addScaledVector(frame.tangent, along);
  }
  function surface(distance, lateral) {
    return (
      track.surfaceAtTime?.(distance, lateral, 0) ??
      track.sampleBranchSurface(distance, lateral)
    );
  }
  function outerBounds(distance) {
    const sheet = track.sheetBoundsAt?.(distance);
    if (sheet) return sheet;
    const available = track.roadBands.filter(
      (band) => distance >= band.start && distance <= band.end,
    );
    if (!available.length) return null;
    return {
      min: Math.min(...available.map((band) => valueAt(band.min, distance))),
      max: Math.max(...available.map((band) => valueAt(band.max, distance))),
    };
  }

  // Conservative samples protect unrelated crossings and all real flight
  // corridors. A fitting's own short outer-edge attachment remains intentional.
  const roadCloud = [];
  for (let distance = 0; distance < track.length; distance += 55) {
    for (const band of track.roadBands) {
      if (distance < band.start || distance > band.end) continue;
      const min = valueAt(band.min, distance),
        max = valueAt(band.max, distance);
      const count = Math.max(2, Math.ceil((max - min) / 65));
      for (let i = 0; i <= count; i++) {
        const lateral = T.MathUtils.lerp(min, max, i / count);
        if ((track.surfaceCoverage?.(distance, lateral) ?? 1) <= 0) continue;
        roadCloud.push({
          distance,
          point: (
            track.pointAtTime?.(distance, lateral, 0) ??
            surface(distance, lateral).position
          ).clone(),
        });
      }
    }
  }
  const flightCloud = [];
  for (const jump of track.jumps) {
    const x = jump.lane === 'outer' ? 100 : jump.lane === 'crest' ? 30 : 0;
    const start = surface(jump.takeoff, x);
    const receiver = track.sample(jump.landingEnd);
    const extent = start.position.distanceTo(receiver.position) + 120;
    for (const speed of [110, jump.targetSpeed ?? 145, 200]) {
      for (let time = 0; time <= 8; time += 0.22) {
        const point = start.position
          .clone()
          .addScaledVector(start.tangent, speed * time);
        point.y -= 13 * time * time;
        if (point.distanceTo(start.position) > extent && time > 1) break;
        flightCloud.push(point);
      }
    }
  }
  function free(point, radius, sourceDistance) {
    const radiusSq = (radius + 25) ** 2;
    for (const sample of roadCloud) {
      if (routeDelta(track, sourceDistance, sample.distance) < 100) continue;
      if (point.distanceToSquared(sample.point) < radiusSq + 600) return false;
    }
    const airRadiusSq = (radius + 45) ** 2;
    for (const sample of flightCloud)
      if (point.distanceToSquared(sample) < airRadiusSq) return false;
    return true;
  }
  function clearStay(from, to, distance) {
    for (let i = 0; i <= 8; i++)
      if (!free(from.clone().lerp(to, i / 8), 1.5, distance)) return false;
    return true;
  }

  function spool(point, frame, scale = 1) {
    const rotation = frame.quaternion.clone().multiply(qAxle);
    const axle = frame.tangent;
    // Turned shaft, separate enamel bearing caps, and actual wound cable make
    // the load path visible from the adjoining foil, including on curled walls.
    add(
      barrelGeometry,
      kit.materials.dark,
      matrixAt(
        point,
        rotation.clone().multiply(qX),
        new T.Vector3(5.5 * scale, 12 * scale, 5.5 * scale),
      ),
      'winding drum',
    );
    add(
      barrelGeometry,
      kit.materials.machined,
      matrixAt(
        point,
        rotation.clone().multiply(qX),
        new T.Vector3(1.1 * scale, 21 * scale, 1.1 * scale),
      ),
      'exposed reel shaft',
    );
    for (let i = -6; i <= 6; i++) {
      const ringPoint = point.clone().addScaledVector(axle, i * 0.82 * scale);
      const ringRotation = frame.quaternion.clone();
      // Torus axis is Z; the local tangent is the drum axle.
      add(
        coilGeometry,
        kit.materials.steel,
        matrixAt(ringPoint, ringRotation, new T.Vector3(scale, scale, scale)),
        'seated steel cable winding',
      );
    }
    for (const side of [-1, 1]) {
      assembly(
        'driveWheel',
        point.clone().addScaledVector(axle, side * 7.1 * scale),
        rotation,
        0.31 * scale,
      );
      assembly(
        'driveBearing',
        point.clone().addScaledVector(axle, side * 8.4 * scale),
        rotation,
        0.36 * scale,
      );
    }
    const motorPoint = offset(
      frame,
      point,
      9 * scale,
      -5.5 * scale,
      8.5 * scale,
    );
    assembly('motor', motorPoint, frame.quaternion, 0.3 * scale);
    beam(
      motorPoint,
      point.clone().addScaledVector(axle, 10.5 * scale),
      1.2 * scale,
      kit.materials.machined,
    );
  }

  function rig(distance, side, importance = 1) {
    if (
      distance <= 40 ||
      distance >= track.length - 40 ||
      routeGap(track, distance)
    )
      return;
    const bounds = outerBounds(distance);
    if (!bounds) return;
    const lateral = side < 0 ? bounds.min : bounds.max;
    const edge = surface(distance, lateral);
    // Massive bodies sit completely outside and beneath the real rolled edge.
    const toe = offset(edge, edge.position, side * 5, -42);
    const machinery = offset(edge, edge.position, side * 60, -62);
    let anchor = null;
    for (const [reach, drop, advance] of [
      [180, 100, 38],
      [240, 145, -45],
      [260, 190, 55],
    ]) {
      const candidate = offset(
        edge,
        edge.position,
        side * reach,
        -drop,
        advance * side,
      );
      if (!free(machinery, 16, distance) || !free(candidate, 24, distance))
        continue;
      if (!clearStay(toe, candidate, distance)) continue;
      anchor = candidate;
      break;
    }
    if (!anchor) {
      rejected.push({ distance, side });
      return;
    }
    const scale = importance > 1 ? 1.08 : 0.9;
    const local = (x, y, z = 0) => offset(edge, machinery, x * side, y, z);
    box(
      local(0, -10),
      edge.quaternion,
      [23, 5, 29],
      kit.materials.dark,
      'deep reel load bed',
    );
    box(
      local(0, -6.5),
      edge.quaternion,
      [25, 2.2, 31],
      kit.materials.shell,
      'formed ivory reel saddle',
    );
    for (const z of [-12, 12]) {
      beam(local(-10, -11, z), local(10, -11, z), 2.3, kit.materials.machined);
      beam(
        offset(edge, toe, 0, -3, z),
        local(-10, -11, z),
        2.8,
        kit.materials.cast,
      );
    }
    box(
      toe,
      edge.quaternion,
      [9, 4, 30],
      kit.materials.cast,
      'underside sail clevis',
    );
    box(
      offset(edge, toe, 0, 2.5),
      edge.quaternion,
      [11, 1.8, 32],
      kit.materials.shell,
      'fitted clamp cover',
    );
    spool(machinery, edge, scale);
    // A service gallery runs on the same fixed load carrier as the reel.
    const gallery = local(17, -13);
    assembly('serviceDeck', gallery, edge.quaternion, 0.34);
    for (const z of [-19, 19])
      beam(
        local(0, -12, z),
        offset(edge, gallery, 0, -2, z),
        1.5,
        kit.materials.dark,
      );
    const anchorBed = anchor.clone().addScaledVector(edge.up, -10);
    box(
      anchorBed,
      edge.quaternion,
      [31, 8, 37],
      kit.materials.dark,
      'remote tension anchor carrier',
    );
    box(
      anchorBed.clone().addScaledVector(edge.up, 5.5),
      edge.quaternion,
      [29, 3, 34],
      kit.materials.shell,
      'remote anchor formed cap',
    );
    assembly(
      'driveGearbox',
      anchor.clone().addScaledVector(edge.up, -2),
      edge.quaternion,
      0.24,
    );
    assembly(
      'serviceDeck',
      anchor
        .clone()
        .addScaledVector(edge.right, -side * 20)
        .addScaledVector(edge.up, -12),
      edge.quaternion,
      0.28,
    );
    for (const z of [-13, 13])
      beam(
        offset(edge, machinery, 0, -10, z),
        offset(edge, anchor, 0, -10, z),
        2.5,
        kit.materials.dark,
        4.5,
        'continuous tension service carrier',
      );
    // Five spread stays terminate in real folded clevises along the sail edge.
    for (let i = -2; i <= 2; i++) {
      const spread = i * 12;
      const edgeStation = clamp(distance + spread, 1, track.length - 1);
      const nearbyBounds = outerBounds(edgeStation);
      if (!nearbyBounds || routeGap(track, edgeStation)) continue;
      const nearby = surface(
        edgeStation,
        side < 0 ? nearbyBounds.min : nearbyBounds.max,
      );
      const from = offset(nearby, nearby.position, side * 5, -43);
      const to = offset(edge, anchor, 0, 2, i * 2.4);
      if (!clearStay(from, to, distance)) continue;
      cable(from, to, 0.48 + importance * 0.05);
      box(
        from,
        nearby.quaternion,
        [4.5, 3, 6.5],
        kit.materials.machined,
        'seated cable socket',
      );
    }
    const reelLead = offset(edge, machinery, side * 5.5, 1.6, -4);
    cable(reelLead, anchor.clone().addScaledVector(edge.up, 2), 0.56);
    assembled.push({
      distance,
      side,
      lateral,
      edge: edge.position.toArray(),
      machinery: machinery.toArray(),
      anchor: anchor.toArray(),
      sheet: track.sheetProfileAt?.(distance)?.id ?? null,
    });
  }

  // Establish the selected concept's near/middle-distance construction first.
  for (const [distance, side] of [
    [560, 1],
    [810, -1],
    [1020, 1],
  ])
    rig(distance, side, 1.2);
  for (const profile of (track.sheetProfiles ?? []).slice(1)) {
    const span = profile.plateauEnd - profile.entryEnd;
    rig(profile.entryEnd + span * 0.22, -1, 1.1);
    rig(profile.entryEnd + span * 0.76, 1, 1.1);
  }
  // Sparse clustered carrier machinery is tied to real spaces, not evenly
  // spaced pins. Every narrow connector gets continuous twin underside keels.
  const occupied = new Set(
    assembled.map((item) => Math.round(item.distance / 100)),
  );
  for (const [index, section] of track.sections.entries()) {
    const fraction = [0.27, 0.64, 0.42, 0.77][index % 4];
    const distance = section.start + (section.end - section.start) * fraction;
    if (
      track.sheetProfileAt?.(distance) ||
      (track.braid &&
        distance > track.braid.start &&
        distance < track.braid.end)
    )
      continue;
    if (
      track.jumps.some(
        (jump) =>
          distance > jump.takeoff - 150 && distance < jump.landingEnd + 80,
      )
    )
      continue;
    const key = Math.round(distance / 100);
    if (occupied.has(key)) continue;
    occupied.add(key);
    rig(distance, index % 2 ? -1 : 1);
  }
  for (const band of track.roadBands) {
    if (band.sheetId || band.branch !== 'main' || band.end - band.start < 70)
      continue;
    const low = valueAt(band.min, (band.start + band.end) / 2),
      high = valueAt(band.max, (band.start + band.end) / 2);
    if (high - low > 110) continue;
    const count = Math.max(2, Math.ceil((band.end - band.start) / 24));
    for (const side of [-1, 1]) {
      let previous = null;
      for (let i = 0; i <= count; i++) {
        const s = band.start + ((band.end - band.start) * i) / count;
        const x = side < 0 ? valueAt(band.min, s) : valueAt(band.max, s);
        const f = surface(s, x);
        const point = offset(f, f.position, side * 3, -42);
        if (previous)
          beam(
            previous,
            point,
            1.45,
            kit.materials.dark,
            2.2,
            'continuous under-edge keel rail',
          );
        previous = point;
      }
    }
  }

  const rendered = [];
  for (const [material, entries] of batches) {
    const values = [...entries.values()];
    const count = values.reduce((sum, entry) => sum + entry.matrices.length, 0);
    const vertices = values.reduce(
      (sum, entry) => sum + entry.geometry.attributes.position.count,
      0,
    );
    const batch = new T.BatchedMesh(count, vertices, 0, material);
    batch.name = `Ravel / culled rigging / ${material.name}`;
    batch.perObjectFrustumCulled = true;
    batch.sortObjects = true;
    for (const entry of values) {
      const geometryId = batch.addGeometry(entry.geometry);
      for (const matrix of entry.matrices)
        batch.setMatrixAt(batch.addInstance(geometryId), matrix);
    }
    batch.castShadow = false;
    batch.receiveShadow = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    group.add(batch);
    rendered.push(batch);
  }
  group.userData.ravelRigging = {
    version: 'ravel-connected-rigging-v1',
    assemblyCount: assembled.length,
    cableCount,
    batchCount: rendered.length,
    assemblies: assembled,
    rejected,
  };
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      rendered.forEach((batch) => batch.dispose());
      ownGeometry.forEach((item) => item.dispose());
      kit.dispose();
    },
  };
}
