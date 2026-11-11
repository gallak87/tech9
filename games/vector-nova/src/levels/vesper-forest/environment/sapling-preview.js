import * as T from 'three';

/** The candidate is opt-in authoring work, never a replacement for normal entries. */
export function saplingPreviewRequested({ developer } = {}) {
  return Boolean(
    developer &&
    new URLSearchParams(globalThis.location?.search ?? '').get('tree') ===
      'sapling',
  );
}

/** Keep one existing early roadside windward tree's footing, height and yaw. */
export function placeSaplingPreview({ prototype, stands, routeClearance }) {
  const target = stands[1][1];
  if (!target) throw new Error('Sapling comparison tree is missing');
  const position = new T.Vector3(),
    quaternion = new T.Quaternion(),
    originalScale = new T.Vector3();
  target.matrix.decompose(position, quaternion, originalScale);
  const scale = target.height / prototype.height;
  const matrix = new T.Matrix4().compose(
    position,
    quaternion,
    new T.Vector3(scale, scale, scale),
  );
  for (const part of prototype.treeParts) {
    if (
      part.kind === 'wood' &&
      routeClearance.intersectsGeometry(part.geometry, matrix)
    )
      throw new Error(
        'Sapling comparison tree crosses the road/camera corridor',
      );
  }
  stands[1].splice(1, 1);
  return {
    position,
    matrix,
    scale,
    height: target.height,
    detailCenter: position
      .clone()
      .add(new T.Vector3(0, target.height * 0.6, 0)),
  };
}
