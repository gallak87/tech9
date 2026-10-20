import { Line3, Quaternion, Vector3 } from 'three';
import { ION_WAKE_RADIUS, ION_WAKE_HEIGHT } from './rules.js';

const line = new Line3();
const delta = new Vector3();
const normal = new Vector3();
const quaternion = new Quaternion();
const point = new Vector3();

// Shared geometric footprint. Negative means outside; zero is its boundary.
// Sampling this never consumes a hit or changes the wake's exposure ledger.
export function ionWakeContact(wake, position, nearest = point) {
  line.start.fromArray(wake.a);
  line.end.fromArray(wake.b);
  line.closestPointToPoint(position, true, nearest);
  delta.subVectors(position, nearest);
  quaternion.fromArray(wake.quaternion);
  normal.set(0, 1, 0).applyQuaternion(quaternion);
  const height = Math.abs(delta.dot(normal));
  const distance = delta.length();
  if (height > ION_WAKE_HEIGHT || distance > ION_WAKE_RADIUS) return -1;
  return 1 - Math.max(height / ION_WAKE_HEIGHT, distance / ION_WAKE_RADIUS);
}

export function sampleIonContact(wakes, position, id, lifetime, accept) {
  let strength = 0;
  for (const wake of wakes) {
    if (wake.source === id || wake.age >= lifetime || (accept && !accept(wake)))
      continue;
    const proximity = ionWakeContact(wake, position);
    strength = Math.max(strength, proximity * (1 - wake.age / lifetime));
  }
  return Math.min(1, strength);
}
