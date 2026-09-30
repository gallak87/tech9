import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Ground-owned infrastructure follows the route's map direction, never its roll.
// Keep the road elevation available to callers sizing buildings beneath the deck.
export function groundFrame(track, distance) {
  const frame = track.sample(distance);
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
    position: frame.position.clone(),
    tangent,
    right: new THREE.Vector3().crossVectors(WORLD_UP, tangent).normalize(),
    up: WORLD_UP.clone(),
  };
}

export function createRouteClearance(track) {
  const samples = [];
  const halfWidth = track.width / 2 + 11;
  const halfHeight = 18;
  const halfLength = 10;
  // -14..+22m along the actual local up includes deck structure, hover craft,
  // rails and the close chase camera even when the surface is fully inverted.
  // Sampling every 8m with overlapping 20m longitudinal spans avoids tiny gaps.
  for (let distance = 0; distance < track.length; distance += 8) {
    const frame = track.sample(distance);
    const centre = frame.position.clone().addScaledVector(frame.up, 4);
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
  const supports = (track.supportFootprints ?? []).map((support) => ({
    centre: new THREE.Vector3(
      support.x,
      (support.minY + support.maxY) / 2,
      support.z,
    ),
    extent: new THREE.Vector3(
      support.halfX + 2,
      (support.maxY - support.minY) / 2 + 2,
      support.halfZ + 2,
    ),
  }));
  const reservedVolumes = [...samples, ...supports];
  function clears(x, z, width, depth, top, yaw = 0, bottom = track.groundY) {
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
    localVertical: [-14, 22],
    longitudinalHalfLength: halfLength,
  };
}
