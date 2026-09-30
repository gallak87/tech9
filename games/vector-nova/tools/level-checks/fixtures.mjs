import { Vector3, Quaternion } from 'three';

// An analytic vertical loop passes through exact upward/downward tangents and
// inversion. No renderer, DOM, assets, copied runtime or level descriptor needed.
export function loop() {
  const radius = 100;
  const length = 2 * Math.PI * radius;
  const axis = new Vector3(1, 0, 0);
  return {
    id: 'test-vertical-loop',
    name: 'Test vertical loop',
    length,
    width: 28,
    sections: [
      { id: 'loop', name: 'Loop', start: 0, end: length, showcase: length / 2 },
    ],
    checkpoints: [{ index: 0, distance: 0, s: 0 }],
    scenarios: { staging: { distance: 0, lateral: 0, speed: 0, heading: 0 } },
    sample(distance) {
      const angle = (((distance % length) + length) % length) / radius;
      const quaternion = new Quaternion().setFromAxisAngle(axis, -angle);
      return {
        position: new Vector3(
          0,
          radius * (1 - Math.cos(angle)),
          radius * Math.sin(angle),
        ),
        right: new Vector3(1, 0, 0).applyQuaternion(quaternion),
        up: new Vector3(0, 1, 0).applyQuaternion(quaternion),
        tangent: new Vector3(0, 0, 1).applyQuaternion(quaternion),
        quaternion,
        bank: 0,
        curvature: 0,
      };
    },
  };
}
