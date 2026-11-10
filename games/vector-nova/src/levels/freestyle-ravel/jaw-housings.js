import * as T from 'three';

export const SPINDLE_JAWS = [
  new T.Vector3(115.83758, 90.50218, 0),
  new T.Vector3(115.83758, -90.50218, 0),
];

/** Privately remove only the two authored 35x28x45 m service housings. The
 * canonical C keel, seated titanium pins, winding crowns and source GLB stay
 * intact. The new fitted saddle occupies these same real source joints. */
export function createOpenJawGeometry(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(),
    replacements = new Map();
  let removedTriangles = 0;
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material.name !== 'Ceramic / cool service') return;
    const source = mesh.geometry,
      position = source.getAttribute('position');
    const native = inverse.clone().multiply(mesh.matrixWorld),
      points = [];
    for (let i = 0; i < position.count; i++)
      points.push(
        new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(native),
      );
    const indices = [],
      count = source.index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map(
        (offset) => source.index?.getX(i + offset) ?? i + offset,
      );
      const housing = SPINDLE_JAWS.some((center) =>
        triangle.every((index) => {
          const point = points[index];
          return (
            Math.abs(point.x - center.x) <= 17.501 &&
            Math.abs(point.y - center.y) <= 14.001 &&
            Math.abs(point.z) <= 22.501
          );
        }),
      );
      if (housing) removedTriangles++;
      else indices.push(...triangle);
    }
    if (indices.length === count) return;
    const geometry = source.clone();
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    replacements.set(source, geometry);
  });
  if (!removedTriangles)
    throw new Error('Sailbreak source jaw housings were not found');
  return { replacements, removedTriangles };
}
