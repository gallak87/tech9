import * as THREE from 'three';
const framePoint = (frame, x, y) =>
  frame.position
    .clone()
    .addScaledVector(frame.right, x)
    .addScaledVector(frame.up, y);

const EPSILON = 1e-9;

function segmentIntersectsBox(from, to, halfX, minY, maxY, halfZ) {
  let first = 0;
  let last = 1;
  for (const [axis, minimum, maximum] of [
    ['x', -halfX, halfX],
    ['y', minY, maxY],
    ['z', -halfZ, halfZ],
  ]) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < EPSILON) {
      if (from[axis] < minimum || from[axis] > maximum) return false;
      continue;
    }
    const a = (minimum - from[axis]) / delta;
    const b = (maximum - from[axis]) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return true;
}

// A local racing-space envelope is tested against the actual entire route,
// including inverted frames and nonadjacent crossings. Portal foundations and
// hangers can never be accepted merely because their centre is outside the road.
export function createSupportClearance(track) {
  const step = 6;
  const frames = Array.from(
    { length: Math.ceil(track.length / step) },
    (_, i) => track.sample(i * step),
  );
  const local = (point, frame) => {
    const delta = point.clone().sub(frame.position);
    return new THREE.Vector3(
      delta.dot(frame.right),
      delta.dot(frame.up),
      delta.dot(frame.tangent),
    );
  };
  return (from, to, radius = 1) =>
    frames.every((frame) => {
      if (
        Math.max(from.y, to.y) < frame.position.y - 32 ||
        Math.min(from.y, to.y) > frame.position.y + 32
      )
        return true;
      return !segmentIntersectsBox(
        local(from, frame),
        local(to, frame),
        track.width / 2 + radius,
        -0.15 - radius,
        11 + radius,
        step * 0.58 + radius,
      );
    });
}

export function createSupportLayout(track) {
  const clears = createSupportClearance(track);
  const standard = [];
  const portals = [];
  const cables = [];
  const anchors = [];
  const segments = [];
  const zones = track.structuralZones;
  for (let s = 24; s < track.length; s += 72) {
    if (zones.some(({ start, end }) => s > start && s < end)) continue;
    const frame = track.sample(s);
    const tops = [-1, 1].map((side) => framePoint(frame, side * 6.2, -7.2));
    if (
      !tops.every((top) =>
        clears(new THREE.Vector3(top.x, track.groundY + 1.3, top.z), top, 2.8),
      )
    )
      continue;
    standard.push({ distance: s, tops });
    for (const top of tops)
      segments.push({
        kind: 'pier',
        from: new THREE.Vector3(top.x, track.groundY + 1.3, top.z),
        to: top,
        radius: 2.8,
      });
  }
  for (const zone of zones) {
    for (let s = zone.start + 24; s < zone.end; s += 108) {
      const frame = track.sample(s);
      const across = new THREE.Vector3(
        frame.tangent.z,
        0,
        -frame.tangent.x,
      ).normalize();
      let accepted;
      for (const span of [44, 54, 68]) {
        const heads = [-1, 1].map((side) =>
          frame.position
            .clone()
            .addScaledVector(across, side * span)
            .add(new THREE.Vector3(0, 43, 0)),
        );
        const feet = heads.map(
          (head) => new THREE.Vector3(head.x, track.groundY + 1.2, head.z),
        );
        if (
          !heads.every((head, i) => clears(feet[i], head, 2.5)) ||
          !clears(heads[0], heads[1], 1.8)
        )
          continue;
        accepted = { heads, feet };
        break;
      }
      if (!accepted) continue;
      const { heads, feet } = accepted;
      for (let i = 0; i < 2; i += 1) {
        portals.push({ from: feet[i], to: heads[i], width: 3.2, depth: 4.4 });
        segments.push({
          kind: 'portal-leg',
          from: feet[i],
          to: heads[i],
          radius: 2.5,
        });
        anchors.push({
          position: feet[i].clone().add(new THREE.Vector3(0, -0.55, 0)),
        });
      }
      portals.push({ from: heads[0], to: heads[1], width: 2.4, depth: 3.6 });
      segments.push({
        kind: 'portal-crown',
        from: heads[0],
        to: heads[1],
        radius: 1.8,
      });
      for (const side of [-1, 1]) {
        const anchor = framePoint(frame, side * 17.6, -6.9);
        const candidates = heads
          .map((head) => ({ head, length: head.distanceTo(anchor) }))
          .sort((a, b) => a.length - b.length);
        const candidate = candidates.find(({ head }) =>
          clears(anchor, head, 0.38),
        );
        if (!candidate) continue;
        cables.push({ from: anchor, to: candidate.head });
        segments.push({
          kind: 'suspension-stay',
          from: anchor,
          to: candidate.head,
          radius: 0.38,
        });
      }
    }
  }
  return {
    standard,
    portals,
    cables,
    anchors,
    segments,
    zones,
  };
}
