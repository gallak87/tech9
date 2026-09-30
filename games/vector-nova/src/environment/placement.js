import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Ground-owned infrastructure follows the route's map direction, never its roll.
// Keep the road elevation available to callers sizing buildings beneath the deck.
export function groundFrame(track, distance) {
  const frame = track.sample(distance);
  const position = frame.position.clone();
  const tangent = frame.tangent.clone();
  tangent.y = 0;
  if (tangent.lengthSq() < 1e-8) {
    tangent
      .copy(track.sample(distance + 8).position)
      .sub(track.sample(distance - 8).position);
    tangent.y = 0;
  }
  if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
  tangent.normalize();
  return {
    position,
    tangent,
    right: new THREE.Vector3().crossVectors(WORLD_UP, tangent).normalize(),
    up: WORLD_UP.clone(),
  };
}

// Conservative sampled world AABBs around caller-selected local road envelopes.
// No terrain is assumed; pass each object's real bottom/top when groundY is absent.
export function createRouteClearance(
  track,
  {
    spacing = 8,
    sidePadding = 11,
    localVertical = [-14, 22],
    longitudinalHalfLength = 10,
    supportPadding = 2,
  } = {},
) {
  const finite = (name, values) => {
    if (!values.every(Number.isFinite))
      throw new TypeError(`${name} must be finite`);
  };
  finite('Clearance dimensions', [
    track.length,
    track.width,
    spacing,
    sidePadding,
    longitudinalHalfLength,
    supportPadding,
    ...localVertical,
  ]);
  if (
    track.length <= 0 ||
    track.width <= 0 ||
    spacing <= 0 ||
    sidePadding < 0 ||
    longitudinalHalfLength <= 0 ||
    supportPadding < 0 ||
    localVertical.length !== 2 ||
    localVertical[0] >= localVertical[1] ||
    track.length / spacing > 1000000
  )
    throw new RangeError('Invalid clearance envelope or sampling spacing');
  if (typeof track.sample !== 'function')
    throw new TypeError('Clearance needs track.sample');
  const samples = [];
  const halfWidth = track.width / 2 + sidePadding;
  const halfHeight = (localVertical[1] - localVertical[0]) / 2;
  const centreHeight = (localVertical[1] + localVertical[0]) / 2;
  const halfLength = longitudinalHalfLength;
  // -14..+22m along the actual local up includes deck structure, hover craft,
  // rails and the close chase camera even when the surface is fully inverted.
  // Sampling every 8m with overlapping 20m longitudinal spans avoids tiny gaps.
  for (let distance = 0; distance < track.length; distance += spacing) {
    const frame = track.sample(distance);
    for (const key of ['position', 'right', 'up', 'tangent']) {
      if (!frame?.[key]?.isVector3)
        throw new TypeError(`Invalid clearance ${key} at ${distance}m`);
      finite(`Clearance ${key} at ${distance}m`, frame[key].toArray());
    }
    const centre = frame.position
      .clone()
      .addScaledVector(frame.up, centreHeight);
    const extent = new THREE.Vector3();
    for (const axis of ['x', 'y', 'z']) {
      extent[axis] =
        Math.abs(frame.right[axis]) * halfWidth +
        Math.abs(frame.up[axis]) * halfHeight +
        Math.abs(frame.tangent[axis]) * halfLength;
    }
    samples.push({ centre, extent });
  }
  // Track-owned accepted pier/portal footprints also reserve their full height;
  // a tower below an elevated deck must not swallow its structural columns.
  const supports = (track.supportFootprints ?? []).map((support) => {
    finite('Support footprint', [
      support.x,
      support.z,
      support.minY,
      support.maxY,
      support.halfX,
      support.halfZ,
    ]);
    if (support.minY > support.maxY || support.halfX < 0 || support.halfZ < 0)
      throw new RangeError('Invalid support footprint');
    return {
      centre: new THREE.Vector3(
        support.x,
        (support.minY + support.maxY) / 2,
        support.z,
      ),
      extent: new THREE.Vector3(
        support.halfX + supportPadding,
        (support.maxY - support.minY) / 2 + supportPadding,
        support.halfZ + supportPadding,
      ),
    };
  });
  const reservedVolumes = [...samples, ...supports];
  function clears(x, z, width, depth, top, yaw = 0, bottom = track.groundY) {
    finite('Object clearance position, dimensions and yaw', [
      x,
      z,
      width,
      depth,
      yaw,
    ]);
    if (
      !(Number.isFinite(top) || top === Infinity) ||
      !(Number.isFinite(bottom) || bottom === -Infinity)
    )
      throw new TypeError(
        'Object clearance height must be finite or outward-unbounded; supply bottom when track.groundY is absent',
      );
    if (width <= 0 || depth <= 0 || bottom > top)
      throw new RangeError('Invalid object clearance bounds');
    const cosine = Math.cos(yaw),
      sine = Math.sin(yaw);
    for (const { centre, extent } of reservedVolumes) {
      if (top < centre.y - extent.y || bottom > centre.y + extent.y) continue;
      const dx = centre.x - x,
        dz = centre.z - z;
      const projectedX =
        Math.abs(cosine) * extent.x + Math.abs(sine) * extent.z;
      const projectedZ =
        Math.abs(sine) * extent.x + Math.abs(cosine) * extent.z;
      if (
        Math.abs(dx * cosine - dz * sine) < width / 2 + projectedX &&
        Math.abs(dx * sine + dz * cosine) < depth / 2 + projectedZ
      )
        return false;
    }
    return true;
  }
  return {
    clears,
    sampleCount: samples.length,
    supportCount: supports.length,
    halfWidth,
    localVertical: [...localVertical],
    longitudinalHalfLength: halfLength,
  };
}
