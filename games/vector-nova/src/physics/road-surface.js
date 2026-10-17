import { Matrix4, Quaternion, Vector3 } from 'three';

// Route coordinates identify a deck even where different roads cross in space.
// Retain its actual planar triangles rather than a second analytic road skin.
export function roadTop(triangle) {
  const p = triangle.roadCoordinates;
  return (
    triangle.kind === 'deck' &&
    p &&
    (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
      (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]) >
      1e-8
  );
}

export function createRoadSurface(triangles) {
  const cells = new Map(),
    vertices = new Map(),
    faces = [];
  const basis = new Matrix4();
  for (const source of triangles) {
    if (!roadTop(source)) continue;
    const [a, b, c] = source.roadCoordinates;
    const ds1 = b[0] - a[0],
      dx1 = b[1] - a[1];
    const ds2 = c[0] - a[0],
      dx2 = c[1] - a[1];
    const determinant = ds1 * dx2 - ds2 * dx1;
    if (determinant < 1e-8) continue;
    const points = source.points.map((p) => new Vector3(...p));
    const e1 = points[1].clone().sub(points[0]);
    const e2 = points[2].clone().sub(points[0]);
    const along = e1
      .clone()
      .multiplyScalar(dx2)
      .addScaledVector(e2, -dx1)
      .divideScalar(determinant);
    const across = e2
      .clone()
      .multiplyScalar(ds1)
      .addScaledVector(e1, -ds2)
      .divideScalar(determinant);
    const smooth = points.map((point, i) => {
      const key = [...source.roadCoordinates[i], ...point.toArray()]
        .map((v) => v.toFixed(4))
        .join(':');
      if (!vertices.has(key))
        vertices.set(key, {
          along: new Vector3(),
          across: new Vector3(),
          count: 0,
          owners: new Set(),
        });
      const vertex = vertices.get(key);
      vertex.along.add(along);
      vertex.across.add(across);
      vertex.count++;
      vertex.owners.add(source.id);
      return vertex;
    });
    const face = {
      source,
      a,
      ds1,
      ds2,
      dx1,
      dx2,
      determinant,
      points,
      along,
      across,
      smooth,
    };
    faces.push(face);
    const from = Math.floor(Math.min(a[0], b[0], c[0]) / 16);
    const to = Math.floor(Math.max(a[0], b[0], c[0]) / 16);
    for (let key = from; key <= to; key++) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(face);
    }
  }
  for (const vertex of vertices.values()) {
    vertex.along.divideScalar(vertex.count);
    vertex.across.divideScalar(vertex.count);
  }
  for (const face of faces)
    face.owners = Object.freeze([
      ...new Set(face.smooth.flatMap((vertex) => [...vertex.owners])),
    ]);
  vertices.clear();
  const sample = (distance, lateral, reference) => {
    let result = null,
      nearest = Infinity;
    for (const f of cells.get(Math.floor(distance / 16)) ?? []) {
      const s = distance - f.a[0],
        x = lateral - f.a[1];
      const u = (s * f.dx2 - x * f.ds2) / f.determinant;
      const v = (x * f.ds1 - s * f.dx1) / f.determinant;
      if (u < -1e-5 || v < -1e-5 || u + v > 1 + 1e-5) continue;
      const position = f.points[0]
        .clone()
        .addScaledVector(f.along, s)
        .addScaledVector(f.across, x);
      const elevation = position
        .clone()
        .sub(reference.position)
        .dot(reference.up);
      if (Math.abs(elevation) > 2 || Math.abs(elevation) > nearest) continue;
      // Interpolated shared-vertex derivatives keep orientation continuous
      // across tessellation diagonals; height still comes from the real face.
      const along = f.smooth[0].along
        .clone()
        .multiplyScalar(1 - u - v)
        .addScaledVector(f.smooth[1].along, u)
        .addScaledVector(f.smooth[2].along, v);
      const across = f.smooth[0].across
        .clone()
        .multiplyScalar(1 - u - v)
        .addScaledVector(f.smooth[1].across, u)
        .addScaledVector(f.smooth[2].across, v);
      const right = across.clone().normalize();
      const longitudinalShear = along.dot(right);
      const tangent = along.clone().addScaledVector(right, -longitudinalShear);
      const longitudinalMetric = tangent.length();
      tangent.normalize();
      const up = tangent.clone().cross(right).normalize();
      // Crossed decks and back faces cannot become the current support skin.
      if (up.dot(reference.up) < 0.5) continue;
      nearest = Math.abs(elevation);
      result = {
        roadOwners: f.owners,
        position,
        right,
        tangent,
        up,
        quaternion: new Quaternion().setFromRotationMatrix(
          basis.makeBasis(right, up, tangent),
        ),
        longitudinalMetric,
        lateralMetric: across.length(),
        longitudinalShear,
      };
    }
    return result;
  };
  sample.dispose = () => {
    cells.clear();
    faces.length = 0;
  };
  return sample;
}
