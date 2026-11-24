import * as T from 'three';

export function glasswakeOrbitClearance(placements = []) {
  const walls = placements
    .filter(({ asset }) => asset?.startsWith('glacier-'))
    .map(
      ({ bounds }) =>
        new T.Box3(
          new T.Vector3().fromArray(bounds.min),
          new T.Vector3().fromArray(bounds.max),
        ),
    );
  const ray = new T.Ray();
  const hit = new T.Vector3();

  // Pull only the rendered orbit camera forward. The requested zoom and
  // orbit angles are retained, so they return as soon as the wall clears.
  return (target, camera, radius) => {
    ray.origin.copy(target);
    ray.direction.subVectors(camera, target).normalize();
    let clearRadius = radius;
    for (const wall of walls) {
      if (wall.containsPoint(target) || !ray.intersectBox(wall, hit)) continue;
      const entry = hit.distanceTo(target);
      if (entry < radius)
        clearRadius = Math.min(clearRadius, Math.max(2, entry - 8));
    }
    return clearRadius;
  };
}
