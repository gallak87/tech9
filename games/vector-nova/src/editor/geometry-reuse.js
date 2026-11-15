// Reuse only byte-identical immutable buffers. A fresh survey still owns all
// clearance/collision decisions; this cache never decides which objects exist.
const geometryLeases = new WeakMap();
const instanceLeases = new WeakMap();

export function retainGeometry(geometry) {
  geometryLeases.set(geometry, (geometryLeases.get(geometry) ?? 0) + 1);
}
export function releaseGeometry(geometry) {
  const count = (geometryLeases.get(geometry) ?? 1) - 1;
  if (count) geometryLeases.set(geometry, count);
  else {
    geometryLeases.delete(geometry);
    geometry.dispose();
  }
}
export function retainInstances(mesh) {
  const key = mesh.instanceMatrix;
  const lease = instanceLeases.get(key) ?? { count: 0, mesh };
  lease.count++;
  instanceLeases.set(key, lease);
}
export function releaseInstances(mesh) {
  const lease = instanceLeases.get(mesh.instanceMatrix);
  if (!lease) return mesh.dispose();
  if (--lease.count) return;
  instanceLeases.delete(mesh.instanceMatrix);
  lease.mesh.dispose();
}
export function equalArray(a, b) {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    a.constructor !== b.constructor ||
    a.byteLength !== b.byteLength
  )
    return false;
  const aa = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}
export function equalGeometry(a, b) {
  if (a === b) return true;
  if (
    JSON.stringify(a.groups) !== JSON.stringify(b.groups) ||
    JSON.stringify(a.drawRange) !== JSON.stringify(b.drawRange)
  )
    return false;
  const names = Object.keys(a.attributes).sort();
  if (names.join() !== Object.keys(b.attributes).sort().join()) return false;
  if (!equalArray(a.index?.array, b.index?.array)) {
    if (a.index || b.index) return false;
  }
  return names.every((name) => {
    const aa = a.getAttribute(name),
      bb = b.getAttribute(name);
    return (
      aa.itemSize === bb.itemSize &&
      aa.normalized === bb.normalized &&
      aa.offset === bb.offset &&
      aa.data?.stride === bb.data?.stride &&
      equalArray(aa.array ?? aa.data?.array, bb.array ?? bb.data?.array)
    );
  });
}
