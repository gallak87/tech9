import * as T from 'three';

// Static construction pass against the actual placed closed geology. No runtime
// probing, moving calving skin, collision proxy or shared physics change.
export function groundGlasswakeSupports(track, anchors, terrain) {
  const ray = new T.Raycaster();
  ray.near = 2;
  ray.far = 850;
  const samples = [];
  for (let s = 0; s < track.length; s += 6) samples.push(track.sample(s));
  const up = new T.Vector3(0, 1, 0),
    down = up.clone().negate();
  const matrix = new T.Matrix4(),
    normalMatrix = new T.Matrix3();
  const beam = new T.Vector3(),
    delta = new T.Vector3(),
    nearest = new T.Vector3();
  const clear = (from, to) => {
    beam.copy(to).sub(from);
    const lengthSq = beam.lengthSq();
    for (const f of samples) {
      delta.copy(f.position).sub(from);
      const t = T.MathUtils.clamp(delta.dot(beam) / lengthSq, 0, 1);
      nearest.copy(from).addScaledVector(beam, t).sub(f.position);
      if (
        Math.abs(nearest.dot(f.tangent)) < 7 &&
        Math.abs(nearest.dot(f.right)) < 21 &&
        nearest.dot(f.up) > -13 &&
        nearest.dot(f.up) < 42
      )
        return false;
    }
    return true;
  };
  const result = [];
  for (const anchor of anchors) {
    const f = track.sample(anchor.distance);
    const outward = new T.Vector3(f.tangent.z, 0, -f.tangent.x)
      .normalize()
      .multiplyScalar(anchor.side);
    const nominal = anchor.nominal.clone().sub(anchor.knee).normalize();
    const directions = [
      nominal,
      outward.clone().addScaledVector(down, 0.7).normalize(),
      down,
      outward,
      up,
      outward.clone().addScaledVector(up, 0.65).normalize(),
      f.tangent.clone().addScaledVector(down, 1.4).normalize(),
      f.tangent.clone().negate().addScaledVector(down, 1.4).normalize(),
    ];
    let contact;
    for (const direction of directions) {
      ray.set(anchor.knee, direction);
      for (const hit of ray.intersectObjects(terrain, false)) {
        if (!clear(anchor.knee, hit.point)) continue;
        matrix.copy(hit.object.matrixWorld);
        if (hit.instanceId !== undefined) {
          const instance = new T.Matrix4();
          hit.object.getMatrixAt(hit.instanceId, instance);
          matrix.multiply(instance);
        }
        normalMatrix.getNormalMatrix(matrix);
        const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix);
        if (normal.dot(direction) > 0) normal.negate();
        contact = {
          ...anchor,
          point: hit.point.clone(),
          normal,
          root: hit.point.clone().addScaledVector(normal, 0.7),
          terrain: hit.object.name,
          terrainUuid: hit.object.uuid,
          instanceId: hit.instanceId,
        };
        break;
      }
      if (contact) break;
    }
    if (!contact)
      throw new Error(
        `No clear geological support contact at ${anchor.distance.toFixed(1)}m / ${anchor.side}`,
      );
    result.push(contact);
  }
  return result;
}
