import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const signedAngle = (from, to, axis) =>
  Math.atan2(
    axis.dot(new THREE.Vector3().crossVectors(from, to)),
    THREE.MathUtils.clamp(from.dot(to), -1, 1),
  );
const unwrapNear = (angle, reference) =>
  reference +
  Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));

// Discrete parallel transport never reconstructs a frame from world-up × forward.
// A bounded horizon correction levels ordinary roads, but freezes through the
// vertical singularity and recovers continuously after it. The final distributed
// holonomy correction closes the frame as well as the centreline.
export function createReferenceFrames(tangents, step, closed = true) {
  const first = tangents[0];
  const initialUp = WORLD_UP.clone().addScaledVector(first, -first.y);
  if (initialUp.lengthSq() < 0.001)
    initialUp.set(1, 0, 0).addScaledVector(first, -first.x);
  initialUp.normalize();
  const right = new THREE.Vector3().crossVectors(initialUp, first).normalize();
  const rights = [right.clone()];
  let horizonTwist = 0;
  for (let i = 1; i < tangents.length; i += 1) {
    const tangent = tangents[i];
    right.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangent),
    );
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const transportedUp = new THREE.Vector3()
      .crossVectors(tangent, right)
      .normalize();
    const guideUp = WORLD_UP.clone().addScaledVector(tangent, -tangent.y);
    if (guideUp.lengthSq() > 0.02) {
      const target = unwrapNear(
        signedAngle(transportedUp, guideUp.normalize(), tangent),
        horizonTwist,
      );
      horizonTwist += THREE.MathUtils.clamp(
        target - horizonTwist,
        -0.01 * step,
        0.01 * step,
      );
    }
    rights.push(right.clone().applyAxisAngle(tangent, horizonTwist));
  }
  const seamTwist = closed ? signedAngle(rights.at(-1), rights[0], first) : 0;
  return rights.map((transportedRight, index) => {
    const tangent = tangents[index];
    const right = transportedRight
      .clone()
      .applyAxisAngle(tangent, (seamTwist * index) / (rights.length - 1));
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
  });
}
