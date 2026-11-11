import { Matrix3, Vector3 } from 'three';

export const FOLIAGE_WIND_ATTRIBUTES = {
  windAnchor: 3,
  windWeight: 1,
  windGradient: 3,
  windPhase: 1,
};

/** Transform custom anchors/weight gradients alongside an already transformed mesh. */
export function transformFoliageWindGeometry(geometry, matrix) {
  const anchor = geometry.getAttribute('windAnchor');
  const gradient = geometry.getAttribute('windGradient');
  if (!anchor && !gradient) return geometry;
  if (!anchor || !gradient)
    throw new Error('Foliage wind requires both anchors and weight gradients');
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  const value = new Vector3();
  for (let index = 0; index < anchor.count; index++) {
    value.fromBufferAttribute(anchor, index).applyMatrix4(matrix);
    anchor.setXYZ(index, value.x, value.y, value.z);
    // A gradient is a covector. Preserve its magnitude: normalization would
    // amplify leaf bending incorrectly after giant/instance scaling.
    value.fromBufferAttribute(gradient, index).applyMatrix3(normalMatrix);
    gradient.setXYZ(index, value.x, value.y, value.z);
  }
  anchor.needsUpdate = gradient.needsUpdate = true;
  return geometry;
}

/** Canonical exported custom attributes use glTF's underscore namespace. */
export function decodeFoliageWindAttributes(geometry) {
  for (const name of Object.keys(FOLIAGE_WIND_ATTRIBUTES)) {
    const exported = `_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toLowerCase()}`;
    if (!geometry.hasAttribute(name) && geometry.hasAttribute(exported)) {
      geometry.setAttribute(name, geometry.getAttribute(exported));
      geometry.deleteAttribute(exported);
    }
  }
  return geometry;
}

export function validateFoliageWindGeometry(geometry) {
  const count = geometry?.getAttribute('position')?.count;
  if (!count) throw new TypeError('Foliage wind requires mesh positions');
  for (const [name, size] of Object.entries(FOLIAGE_WIND_ATTRIBUTES)) {
    const attribute = geometry.getAttribute(name);
    if (!attribute || attribute.itemSize !== size || attribute.count !== count)
      throw new TypeError(`Foliage wind requires ${name} for every vertex`);
  }
  return geometry;
}
