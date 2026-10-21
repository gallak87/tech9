import { Vector3 } from 'three';

// Filter projected motion, not the ship: road bumps and camera movement should
// not make a small text label vibrate. No per-frame allocations or world lag.
export function createReadoutAnchor() {
  const projected = new Vector3();
  const position = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };
  let ready = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  function reset() {
    ready = false;
    velocity.x = velocity.y = 0;
  }
  function follow(axis, target, frequency, dt) {
    // Exact critically damped spring step: steady across frame rates and no
    // overshoot on acquisition. Vertical motion gets slightly more damping.
    const error = position[axis] - target;
    const delta = (velocity[axis] + frequency * error) * dt;
    const decay = Math.exp(-frequency * dt);
    position[axis] = target + (error + delta) * decay;
    velocity[axis] = (velocity[axis] - frequency * delta) * decay;
  }
  return {
    reset,
    update({ ship, camera, width, height, dt }) {
      // Runtime presentation runs before renderer.render(), which would
      // otherwise leave projection using the previous camera transform.
      camera.updateWorldMatrix(true, false);
      ship.localToWorld(projected.set(0, 1.6, 0));
      projected.project(camera);
      if (projected.z < -1 || projected.z > 1) {
        reset();
        return null;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height - 12;
      const cutDistance = Math.max(140, Math.min(width, height) * 0.25);
      if (
        !ready ||
        width !== viewportWidth ||
        height !== viewportHeight ||
        Math.hypot(x - position.x, y - position.y) > cutDistance
      ) {
        position.x = x;
        position.y = y;
        velocity.x = velocity.y = 0;
        ready = true;
      } else {
        const step = Math.max(0, Math.min(0.1, dt));
        follow('x', x, 28, step);
        follow('y', y, 20, step);
      }
      viewportWidth = width;
      viewportHeight = height;
      return position;
    },
  };
}
