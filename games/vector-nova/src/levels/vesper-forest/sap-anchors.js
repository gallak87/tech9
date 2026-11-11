import * as T from 'three';

/** Cache genuine underside skin intersections per visible hull model/LOD. */
export function createSapAnchorCache() {
  const cache = new WeakMap();
  const ray = new T.Raycaster();
  const origin = new T.Vector3(),
    direction = new T.Vector3(),
    inverse = new T.Matrix4();
  return {
    read(ship, bounds) {
      if (!ship) return [];
      const meshes = [];
      ship.traverse((source) => {
        if (!source.isMesh || !source.geometry?.getAttribute('normal')) return;
        for (let node = source; node && node !== ship; node = node.parent)
          if (
            !node.visible ||
            node.userData.aoExclude ||
            node.userData.exhaustHeat
          )
            return;
        const materials = Array.isArray(source.material)
          ? source.material
          : [source.material];
        if (materials.every((material) => material.transparent)) return;
        meshes.push(source);
      });
      const signature = meshes.map((mesh) => mesh.uuid).join(':');
      const saved = cache.get(ship);
      if (saved?.model === ship.userData && saved.signature === signature)
        return saved.points;
      ship.updateWorldMatrix(true, true);
      inverse.copy(ship.matrixWorld).invert();
      direction.set(0, 1, 0).transformDirection(ship.matrixWorld);
      const width = (bounds.max[0] - bounds.min[0]) * 0.5;
      const midX = (bounds.max[0] + bounds.min[0]) * 0.5;
      const length = bounds.max[2] - bounds.min[2];
      const points = [];
      const sample = (x, z) => {
        origin.set(x, bounds.min[1] - 2, z).applyMatrix4(ship.matrixWorld);
        ray.set(origin, direction);
        ray.far =
          (bounds.max[1] - bounds.min[1] + 4) *
          Math.max(1, ship.getWorldScale(new T.Vector3()).length());
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) return null;
        return hit.point
          .clone()
          .applyMatrix4(inverse)
          .add(new T.Vector3(0, 0.012, 0));
      };
      for (const z of [0.14, 0.31, 0.48, 0.65, 0.81])
        for (const side of [-1, 1])
          for (const inset of [0.94, 0.78, 0.62, 0.46, 0.3]) {
            const point = sample(
              midX + side * width * inset,
              bounds.min[2] + length * z,
            );
            if (point) {
              points.push(point);
              break;
            }
          }
      for (const z of [0.07, 0.9]) {
        const point = sample(midX, bounds.min[2] + length * z);
        if (point) points.push(point);
      }
      cache.set(ship, { model: ship.userData, signature, points });
      return points;
    },
  };
}
