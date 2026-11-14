const KINDS = new Set(['deck', 'rail', 'terrain', 'structure']);

// Authoring metadata belongs to the mesh, independently of its display name,
// material UVs and rendering flags. Only the existing physical fields reach
// collider triangles; these declarations do not create a new replay identity.
function declaration(metadata) {
  const { id, kind, roadBoundary, routeCoordinates } = metadata ?? {};
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    !KINDS.has(kind) ||
    (roadBoundary !== undefined && typeof roadBoundary !== 'boolean')
  )
    throw new TypeError('Collision solids require a stable id and solid kind.');
  if ((kind === 'deck' || kind === 'rail' || roadBoundary) && !routeCoordinates)
    throw new TypeError('Road solids require explicit route coordinates.');
  if (
    routeCoordinates &&
    (typeof routeCoordinates.attribute !== 'string' ||
      !routeCoordinates.attribute ||
      !Number.isInteger(routeCoordinates.distance) ||
      routeCoordinates.distance < 0 ||
      !Number.isInteger(routeCoordinates.lateral) ||
      routeCoordinates.lateral < 0 ||
      routeCoordinates.distance === routeCoordinates.lateral)
  )
    throw new TypeError('Invalid collision route-coordinate declaration.');
  return Object.freeze({
    id,
    kind,
    ...(roadBoundary ? { roadBoundary: true } : {}),
    ...(routeCoordinates
      ? { routeCoordinates: Object.freeze({ ...routeCoordinates }) }
      : {}),
  });
}

export function declareCollisionSolid(object, metadata) {
  if (!object?.isMesh) throw new TypeError('Collision solids require a mesh.');
  object.userData.collisionSolid =
    metadata === false ? false : declaration(metadata);
  return object;
}

// Undefined means an unmigrated mesh may use its level's legacy selector.
// False is an explicit exclusion and must never fall back to art-name matching.
export function readCollisionSolid(object) {
  const metadata = object.userData.collisionSolid;
  if (metadata === undefined) return undefined;
  if (metadata === false) return null;
  // Validate declarations again when consuming externally authored/cloned data.
  const { id, kind, roadBoundary, routeCoordinates } = declaration(metadata);
  let coordinates = null;
  if (routeCoordinates) {
    const attribute = object.geometry.getAttribute(routeCoordinates.attribute);
    if (
      object.isInstancedMesh ||
      !attribute ||
      attribute.count !== object.geometry.attributes.position.count ||
      Math.max(routeCoordinates.distance, routeCoordinates.lateral) >=
        attribute.itemSize
    )
      throw new TypeError(
        'Collision route coordinates must match mesh vertices.',
      );
    // Reject malformed route values before interval filtering can silently drop
    // a declared face (NaN/Infinity stations do not match any ownership span).
    for (let index = 0; index < attribute.count; index++)
      if (
        !Number.isFinite(
          attribute.getComponent(index, routeCoordinates.distance),
        ) ||
        !Number.isFinite(
          attribute.getComponent(index, routeCoordinates.lateral),
        )
      )
        throw new TypeError('Collision route coordinates must be finite.');
    coordinates = {
      getX: (index) => attribute.getComponent(index, routeCoordinates.distance),
      getY: (index) => attribute.getComponent(index, routeCoordinates.lateral),
    };
  }
  return {
    id,
    info: { kind, ...(roadBoundary ? { roadBoundary: true } : {}) },
    coordinates,
  };
}
