/** Validate authored integration data before allocating a renderer or listeners. */
export function validateDefinition(definition) {
  if (
    !definition ||
    typeof definition.id !== 'string' ||
    !definition.id ||
    typeof definition.title !== 'string' ||
    typeof definition.groundHeight !== 'function' ||
    typeof definition.createWorld !== 'function'
  ) {
    throw new Error(
      'A scene definition requires id, title, groundHeight and createWorld.',
    );
  }
  const bounds = definition.bounds;
  if (
    !bounds ||
    !['minX', 'maxX', 'minZ', 'maxZ', 'minY', 'maxY'].every((key) =>
      Number.isFinite(bounds[key]),
    ) ||
    bounds.minX >= bounds.maxX ||
    bounds.minZ >= bounds.maxZ ||
    bounds.minY >= bounds.maxY
  ) {
    throw new Error('Scene bounds require finite, ordered X, Z and Y limits.');
  }
  const views = definition.views;
  if (!views || !Object.hasOwn(views, definition.initialView)) {
    throw new Error('The initial scene view must exist in views.');
  }
  for (const view of Object.values(views)) {
    for (const key of ['position', 'target']) {
      if (
        !Array.isArray(view[key]) ||
        view[key].length !== 3 ||
        !view[key].every(Number.isFinite)
      ) {
        throw new Error(
          'Scene view positions and targets must be finite three-element arrays.',
        );
      }
    }
  }
  const environment = definition.environment;
  if (
    !environment ||
    !environment.fog ||
    !environment.sun ||
    !environment.hemisphere ||
    !environment.sky ||
    !Number.isFinite(environment.exposure) ||
    !Number.isFinite(environment.fog.density) ||
    !Number.isFinite(environment.sun.intensity) ||
    !Number.isFinite(environment.hemisphere.intensity) ||
    !Array.isArray(environment.sun.position) ||
    environment.sun.position.length !== 3 ||
    !environment.sun.position.every(Number.isFinite) ||
    !environment.sun.shadowBounds
  ) {
    throw new Error(
      'Scene environment requires fog, sunlight, hemisphere light, sky and exposure.',
    );
  }
  return definition;
}
