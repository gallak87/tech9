import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Local process machinery batches share the mission palette/kit, but own only
// their baked geometry. Original kit prototypes and materials stay borrowed.
export function createProcessBuilder(kit, name) {
  const group = new T.Group();
  group.name = name;
  const parts = new Map(),
    bounds = [];
  const up = new T.Vector3(0, 1, 0);
  const identity = new T.Quaternion();
  function add(
    geometry,
    material,
    position = [0, 0, 0],
    rotation = identity,
    scale = 1,
  ) {
    if (
      material === kit.materials.machined &&
      !geometry.attributes.industrialCoord
    )
      geometry.setAttribute(
        'industrialCoord',
        geometry.attributes.position.clone(),
      );
    geometry.applyMatrix4(
      new T.Matrix4().compose(
        new T.Vector3(...position),
        rotation,
        new T.Vector3(scale, scale, scale),
      ),
    );
    geometry.computeBoundingBox();
    bounds.push(geometry.boundingBox.clone());
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(flat);
  }
  function box(material, size, position, rotation = identity, bevel = 1) {
    add(
      new RoundedBoxGeometry(
        ...size,
        1,
        Math.min(bevel, Math.min(...size) * 0.12),
      ),
      material,
      position,
      rotation,
    );
  }
  function beam(material, a, b, width, depth = width) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    box(
      material,
      [width, delta.length(), depth],
      start.add(end).multiplyScalar(0.5).toArray(),
      new T.Quaternion().setFromUnitVectors(up, delta.normalize()),
      0.8,
    );
  }
  function assembly(name, position, scale = 1, yaw = 0) {
    const rotation = new T.Quaternion().setFromAxisAngle(up, yaw);
    for (const part of kit.prototypes[name])
      add(part.geometry.clone(), part.material, position, rotation, scale);
  }
  function pipe(points, radius, material = kit.materials.steel) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    );
    add(
      new T.TubeGeometry(curve, points.length * 5, radius, 12, false),
      material,
    );
    for (const fraction of [0, 1])
      add(
        new T.CylinderGeometry(radius * 1.35, radius * 1.35, radius * 0.8, 24),
        kit.materials.machined,
        curve.getPoint(fraction).toArray(),
        new T.Quaternion().setFromUnitVectors(up, curve.getTangent(fraction)),
      );
  }
  function finish() {
    const geometries = [];
    for (const [material, source] of parts) {
      const geometry = mergeGeometries(source, false);
      source.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      const mesh = new T.Mesh(geometry, material);
      mesh.name = name + ' / ' + material.name;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    parts.clear();
    let disposed = false;
    return {
      group,
      bounds,
      dispose() {
        if (disposed) return;
        disposed = true;
        geometries.forEach((g) => g.dispose());
        group.clear();
      },
    };
  }
  return { add, box, beam, assembly, pipe, finish };
}

export function seatProcessDistrict(
  component,
  track,
  { fraction, side, offset, y, reverse = false },
) {
  const frame = track.sample(track.length * fraction),
    up = new T.Vector3(0, 1, 0);
  const forward = frame.tangent.clone().setY(0).normalize(),
    right = up.clone().cross(forward);
  component.group.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, up, forward),
  );
  if (reverse)
    component.group.quaternion.multiply(
      new T.Quaternion().setFromAxisAngle(up, Math.PI),
    );
  const expanded = component.bounds.map((box) =>
    box.clone().expandByVector(new T.Vector3(42, 24, 42)),
  );
  for (const trial of [offset, offset + 30, offset + 60, offset + 100]) {
    component.group.position
      .copy(frame.position)
      .addScaledVector(right, side * trial);
    component.group.position.y = y;
    component.group.updateMatrixWorld(true);
    const inverse = component.group.matrixWorld.clone().invert();
    let clear = true;
    for (let distance = 0; clear && distance < track.length; distance += 8) {
      const point = track
        .sample(distance)
        .position.clone()
        .applyMatrix4(inverse);
      if (expanded.some((box) => box.containsPoint(point))) clear = false;
    }
    if (clear) return component;
  }
  component.dispose();
  throw new Error(component.group.name + ' intersects the fixed race corridor');
}
