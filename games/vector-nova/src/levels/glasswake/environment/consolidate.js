import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Material-split glTF primitives are baked into vertex colour/response within
 * each template. Geometry, normals, bounds and special emissive/metal parts stay
 * intact; each spatial batch draws its opaque ice once rather than per colour.
 */
export function consolidateIceParts(parts, material) {
  const ice = [],
    other = [];
  for (const part of parts) {
    const m = part.material;
    if (
      !m.isMeshStandardMaterial ||
      /Titanium|Warm navigation|Deep cavity/.test(m.name)
    ) {
      other.push(part);
      continue;
    }
    const g = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry.clone();
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3),
      roughness = new Float32Array(count),
      roles = new Float32Array(count);
    const role = /buried|meteoric/.test(m.name)
      ? 0
      : /frost/.test(m.name)
        ? 2
        : /Fresh fracture/.test(m.name)
          ? 3
          : 1;
    const rough =
      role === 0 ? 0.83 : role === 2 ? 0.93 : role === 3 ? 0.23 : 0.44;
    for (let i = 0; i < count; i++) {
      m.color.toArray(colors, i * 3);
      roughness[i] = rough;
      roles[i] = role;
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    g.setAttribute('iceRoughness', new T.BufferAttribute(roughness, 1));
    g.setAttribute('iceRole', new T.BufferAttribute(roles, 1));
    ice.push(g);
  }
  if (!ice.length) return { parts: other, geometry: null };
  const geometry = mergeGeometries(ice, false);
  for (const g of ice) g.dispose();
  if (!geometry)
    throw new Error('Glasswake ice primitive consolidation failed');
  geometry.computeBoundingBox();
  return { parts: [{ geometry, material }, ...other], geometry };
}
