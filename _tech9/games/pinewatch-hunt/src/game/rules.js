/** Pure hunt rules. Rendering and input live outside this state machine. */
export function newHunt() {
  return {
    phase: 'stalk',
    arrows: 3,
    alert: 0,
    animal: 'grazing',
    elapsed: 0,
    shots: 0,
    hitRange: 0,
    fleeTime: 0,
    message: '',
    messageTime: 0,
  };
}
export function stepHunt(state, dt, { distance, moving, quiet, visible }) {
  if (!['stalk', 'retrieve'].includes(state.phase)) return;
  state.elapsed += dt;
  state.messageTime = Math.max(0, state.messageTime - dt);
  if (state.phase === 'retrieve') return;
  if (state.animal === 'fleeing') {
    state.fleeTime += dt;
    if (state.fleeTime > 4) {
      state.phase = 'lost';
      state.message = 'The deer reached the deep forest.';
    }
    return;
  }
  const noise = moving && distance < (quiet ? 8 : 23);
  const proximity = distance < 5 || (visible && distance < 10 && !quiet);
  state.alert = Math.max(
    0,
    Math.min(
      1,
      state.alert +
        dt * (proximity ? 0.65 : noise ? (quiet ? 0.16 : 0.26) : -0.12),
    ),
  );
  state.animal =
    state.alert >= 1 ? 'fleeing' : state.alert > 0.35 ? 'alert' : 'grazing';
}
export function shoot(state, { draw, aiming, hit, range }) {
  if (state.phase !== 'stalk' || state.arrows <= 0 || draw < 0.22) return false;
  state.arrows--;
  state.shots++;
  if (aiming && draw >= 0.65 && hit && range <= 26) {
    state.phase = 'retrieve';
    state.animal = 'down';
    state.hitRange = range;
    state.message = 'Clean hit. Walk to the deer and press E to retrieve.';
  } else {
    state.alert = Math.min(1, state.alert + 0.48);
    state.message =
      draw < 0.65
        ? 'Short draw. Hold until the draw meter is full.'
        : range > 26
          ? 'Out of range. Quietly approach within 26 m.'
          : 'Miss. Stay still and let the deer settle.';
    if (state.arrows === 0) {
      state.phase = 'lost';
      state.message = 'Your quiver is empty. A fresh trail awaits.';
    }
  }
  state.messageTime = 5;
  return true;
}
export function retrieve(state, distance) {
  if (state.phase !== 'retrieve' || distance > 3) return false;
  state.phase = 'won';
  return true;
}
export function resolveMovement(
  position,
  dx,
  dz,
  colliders,
  bounds,
  radius = 0.32,
) {
  const result = { x: position.x, z: position.z };
  // Axis separation lets the walker slide around circular trunks and rocks.
  for (const [axis, delta] of [
    ['x', dx],
    ['z', dz],
  ]) {
    result[axis] += delta;
    result.x = Math.max(
      bounds.minX + radius,
      Math.min(bounds.maxX - radius, result.x),
    );
    result.z = Math.max(
      bounds.minZ + radius,
      Math.min(bounds.maxZ - radius, result.z),
    );
    for (const c of colliders) {
      const x = result.x - c.x,
        z = result.z - c.z,
        distance = Math.hypot(x, z),
        limit = c.radius + radius;
      if (distance < limit) {
        if (distance < 0.0001) result.x = c.x + limit;
        else {
          result.x = c.x + (x / distance) * limit;
          result.z = c.z + (z / distance) * limit;
        }
      }
    }
  }
  return result;
}
