import * as T from 'three';

const Y = new T.Vector3(0, 1, 0);
const ONE = new T.Vector3(1, 1, 1);
const CELL = 256;

function nativeSocket(root, name) {
  const node =
    root.getObjectByName(name) ?? root.getObjectByName(`${root.name}__${name}`);
  if (!node) throw new Error(`Sailbreak wing is missing ${root.name}/${name}`);
  return new T.Vector3().setFromMatrixPosition(
    root.matrixWorld.clone().invert().multiply(node.matrixWorld),
  );
}

function sourcePoints(root) {
  const points = [],
    inverse = root.matrixWorld.clone().invert();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const matrix = inverse.clone().multiply(object.matrixWorld);
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++)
      points.push(
        new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix),
      );
  });
  if (!points.length)
    throw new Error(`Sailbreak wing prototype ${root.name} has no vertices`);
  return points;
}

function transformSockets(source, matrix) {
  return Object.fromEntries(
    Object.entries(source).map(([name, point]) => [
      name,
      point.clone().applyMatrix4(matrix),
    ]),
  );
}

// Hash full corridor boxes once, then test every actual source vertex without
// the O(vertices * entire-course) cost during environment construction.
function corridorIndex(track, step = 24) {
  const cells = new Map(),
    segments = [];
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let start = 0; start < track.length; start += step) {
    const end = Math.min(track.length, start + step);
    const a = track.sample(start),
      b = track.sample(end);
    const airborne = track.jumps.some(
      (jump) => end >= jump.takeoff - 50 && start < jump.landingStart,
    );
    const width = track.width / 2 + (airborne ? 55 : 9),
      top = airborne ? 420 : 90;
    const box = new T.Box3();
    for (const frame of [a, b])
      for (const side of [-width, width])
        for (const height of [-8, top])
          box.expandByPoint(
            frame.position
              .clone()
              .addScaledVector(frame.right, side)
              .addScaledVector(frame.up, height),
          );
    box.expandByScalar(16);
    const index = segments.length;
    segments.push({ a, b, start, end, width, top });
    for (
      let x = Math.floor(box.min.x / CELL);
      x <= Math.floor(box.max.x / CELL);
      x++
    )
      for (
        let y = Math.floor(box.min.y / CELL);
        y <= Math.floor(box.max.y / CELL);
        y++
      )
        for (
          let z = Math.floor(box.min.z / CELL);
          z <= Math.floor(box.max.z / CELL);
          z++
        ) {
          const id = key(x, y, z);
          if (!cells.has(id)) cells.set(id, []);
          cells.get(id).push(index);
        }
  }
  return { cells, segments, key };
}

function checkPlan(plan, native, corridor) {
  const blockers = new Map(),
    line = new T.Line3(),
    closest = new T.Vector3();
  let meshVertices = 0,
    segmentSamples = 0,
    hits = 0,
    minMargin = Infinity;
  function check(point, radius, name) {
    const nearby = new Set();
    for (
      let x = Math.floor((point.x - radius) / CELL);
      x <= Math.floor((point.x + radius) / CELL);
      x++
    )
      for (
        let y = Math.floor((point.y - radius) / CELL);
        y <= Math.floor((point.y + radius) / CELL);
        y++
      )
        for (
          let z = Math.floor((point.z - radius) / CELL);
          z <= Math.floor((point.z + radius) / CELL);
          z++
        )
          for (const index of corridor.cells.get(corridor.key(x, y, z)) ?? [])
            nearby.add(index);
    for (const index of nearby) {
      const segment = corridor.segments[index];
      line.set(segment.a.position, segment.b.position);
      const alpha = line.closestPointToPointParameter(point, true);
      line.at(alpha, closest);
      const delta = point.clone().sub(closest);
      const up = segment.a.up.clone().lerp(segment.b.up, alpha).normalize();
      const right = segment.a.right
        .clone()
        .lerp(segment.b.right, alpha)
        .normalize();
      const tangent = segment.a.tangent
        .clone()
        .lerp(segment.b.tangent, alpha)
        .normalize();
      const lateral = Math.abs(delta.dot(right)),
        height = delta.dot(up);
      const longitudinal = Math.abs(delta.dot(tangent));
      const margin =
        Math.max(
          lateral - segment.width,
          -8 - height,
          height - segment.top,
          longitudinal - 16,
        ) - radius;
      minMargin = Math.min(minMargin, margin);
      if (margin >= 0) continue;
      hits++;
      if (!blockers.has(name))
        blockers.set(name, {
          name,
          station: T.MathUtils.lerp(segment.start, segment.end, alpha),
          point: point.toArray(),
          lateral,
          height,
          radius,
        });
      break;
    }
  }
  for (const prototype of plan.prototypes)
    for (const point of native[prototype.prototype]) {
      meshVertices++;
      check(point.clone().applyMatrix4(prototype.matrix), 0, prototype.name);
    }
  for (const stay of plan.stays) {
    const count = Math.max(1, Math.ceil(stay.a.distanceTo(stay.b) / 8));
    for (let i = 0; i <= count; i++) {
      segmentSamples++;
      check(stay.a.clone().lerp(stay.b, i / count), stay.width / 2, stay.name);
    }
  }
  return {
    safe: blockers.size === 0,
    blockers: [...blockers.values()],
    hits,
    meshVertices,
    segmentSamples,
    corridorSegments: corridor.segments.length,
    minMargin: Number.isFinite(minMargin) ? minMargin : null,
  };
}

/** Complete CPU-only wing/cutter attachment graph. Every candidate keeps the
 * wing root fixed to the same actual spindle socket. Only the complete wing
 * transform changes; its cutter hardpoints and all six stays follow together.
 * Clearance is conservative sampled scenery guidance, not a replacement for
 * the level's exact triangle/native-camera audit.
 */
export function createReceiverWingPlan({
  track,
  station,
  anchor,
  wingRoot,
  cutterRoot,
  preferredScale = 1,
  preferredAlongScale = 1,
  preferredYaw = 0,
  candidates = [
    [1, 0],
    [1, 0.25],
    [1, -0.25],
    [1, 0.45],
    [1, -0.45],
    [1, 0.65],
    [1, -0.65],
    [1, 0, 0.7],
    [1, 0.25, 0.7],
    [1, -0.25, 0.7],
    [1, 0.45, 0.7],
    [1, -0.45, 0.7],
    [1, 0, 0.55],
    [1, 0.25, 0.55],
    [1, -0.25, 0.55],
    [1, 0.45, 0.55],
    [1, -0.45, 0.55],
  ],
}) {
  wingRoot.updateWorldMatrix(true, true);
  cutterRoot.updateWorldMatrix(true, true);
  const wingNative = Object.fromEntries(
    [
      'wing_root',
      'wing_inner_a',
      'wing_inner_b',
      'wing_outer_a',
      'wing_outer_b',
    ].map((name) => [name, nativeSocket(wingRoot, name)]),
  );
  const cutterNative = {
    cable_socket_starboard: nativeSocket(cutterRoot, 'cable_socket_starboard'),
    tow_eye: nativeSocket(cutterRoot, 'tow_eye'),
  };
  const native = {
    receiver_foil_wing: sourcePoints(wingRoot),
    anchor_cutter: sourcePoints(cutterRoot),
  };
  const corridor = corridorIndex(track);
  const attachment = anchor.sockets.spindle.cable_socket_2.clone();
  const baseRotation = station.frame.quaternion
    .clone()
    .multiply(
      new T.Quaternion().setFromAxisAngle(Y, station.side < 0 ? Math.PI : 0),
    );
  const attempts = [];
  let best = null;
  const seen = new Set();
  for (const [scale, yaw, alongScale = 1] of [
    [preferredScale, preferredYaw, preferredAlongScale],
    ...candidates,
  ]) {
    const key = `${scale},${yaw},${alongScale}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      !(scale > 0 && alongScale > 0) ||
      !Number.isFinite(scale + yaw + alongScale)
    )
      throw new RangeError(
        'Sailbreak wing needs finite yaw and strictly positive scales',
      );
    const scaleVector = new T.Vector3(scale, scale, scale * alongScale);
    const rotation = baseRotation
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(Y, yaw));
    const position = attachment
      .clone()
      .sub(
        wingNative.wing_root
          .clone()
          .multiply(scaleVector)
          .applyQuaternion(rotation),
      );
    const matrix = new T.Matrix4().compose(position, rotation, scaleVector);
    const wingSockets = transformSockets(wingNative, matrix);
    const outboard = new T.Vector3(1, 0, 0).applyQuaternion(rotation);
    const along = new T.Vector3(0, 0, 1).applyQuaternion(rotation);
    const prototypes = [
      {
        prototype: 'receiver_foil_wing',
        matrix,
        name: 'connected curled receiver foil wing',
      },
    ];
    const stays = ['a', 'b'].map((suffix, i) => ({
      a: anchor.sockets.spindle[`cable_socket_${i}`].clone(),
      b: wingSockets[`wing_inner_${suffix}`].clone(),
      width: 1.5,
      name: `spindle to fixed inner wing hem ${suffix}`,
    }));
    const cutters = [];
    for (const [index, suffix] of ['a', 'b'].entries()) {
      const corner = wingSockets[`wing_outer_${suffix}`];
      const cutterPosition = corner
        .clone()
        .addScaledVector(outboard, 230)
        .addScaledVector(Y, 180)
        .addScaledVector(along, index ? 120 : -120);
      // Keep both tugs upright, with their bows toward their own foil corner.
      // The low aft tow eye's stay then falls below the hull rather than
      // passing through a source ship simply to reach a convenient endpoint.
      const forward = corner.clone().sub(cutterPosition).setY(0).normalize();
      const right = Y.clone().cross(forward).normalize();
      const cutterRotation = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, Y, forward),
      );
      const cutterMatrix = new T.Matrix4().compose(
        cutterPosition,
        cutterRotation,
        ONE,
      );
      const worldSockets = transformSockets(cutterNative, cutterMatrix);
      prototypes.push({
        prototype: 'anchor_cutter',
        matrix: cutterMatrix,
        name: `outer wing tension cutter ${suffix}`,
      });
      cutters.push({ suffix, matrix: cutterMatrix, sockets: worldSockets });
      for (const socket of ['cable_socket_starboard', 'tow_eye'])
        stays.push({
          a: worldSockets[socket].clone(),
          b: corner.clone(),
          width: 1.3,
          name: `cutter ${suffix} actual ${socket} to outer foil hem`,
        });
    }
    const plan = {
      prototypes,
      stays,
      sockets: { wing: wingSockets, cutters },
      attachment,
      scale,
      yaw,
      alongScale,
      rootContactError: wingSockets.wing_root.distanceTo(attachment),
    };
    plan.clearance = checkPlan(plan, native, corridor);
    attempts.push({
      scale,
      yaw,
      alongScale,
      safe: plan.clearance.safe,
      hits: plan.clearance.hits,
      blockers: plan.clearance.blockers.map((blocker) => blocker.name),
    });
    if (!best || plan.clearance.hits < best.clearance.hits) best = plan;
    if (plan.clearance.safe) break;
  }
  return { ...best, attempts };
}

/** Sample the actual fitted working-bay mesh against the same complete
 * road/flight corridor used by its parent wing. No individual parts move. */
export function assessReceiverBay(track, root, matrix) {
  root.updateWorldMatrix(true, true);
  return checkPlan(
    {
      prototypes: [
        { prototype: 'bay', matrix, name: 'attached receiver working bay' },
      ],
      stays: [],
    },
    { bay: sourcePoints(root) },
    corridorIndex(track),
  );
}
