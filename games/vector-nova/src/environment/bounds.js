import { Matrix4 } from 'three';

// Bound actual geometry after local and parent transforms. Materials, palettes,
// batching and disposal remain with the caller; this helper owns no resources.
export function transformedPartBounds(entries, parent = new Matrix4()) {
  const matrix = (value) =>
    value?.isMatrix4 && value.elements.every(Number.isFinite);
  if (!Array.isArray(entries) || !matrix(parent))
    throw new TypeError('Bounds need entries and a finite parent matrix');
  const transform = new Matrix4();
  return entries.map((entry, index) => {
    if (!entry.geometry?.isBufferGeometry || !matrix(entry.matrix))
      throw new TypeError(
        `Invalid geometry or matrix for bounds entry ${index}`,
      );
    if (!entry.geometry.boundingBox) entry.geometry.computeBoundingBox();
    const bounds = entry.geometry.boundingBox;
    if (
      !bounds ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(
        Number.isFinite,
      ) ||
      bounds.isEmpty()
    )
      throw new TypeError(`Invalid geometry bounds for entry ${index}`);
    transform.multiplyMatrices(parent, entry.matrix);
    return bounds.clone().applyMatrix4(transform);
  });
}
