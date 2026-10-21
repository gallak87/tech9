import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLivingHollow } from '../src/hollow.js';

const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 1000)).join(',');
const pointsOf = (geometry) => {
  const p = geometry.attributes.position, result = new Set();
  for (let i = 0; i < p.count; i++) result.add(key(p.getX(i), p.getY(i), p.getZ(i)));
  return result;
};

function samplePolyline(points, step = 3) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], count = Math.ceil(a.distanceTo(b) / step);
    for (let j = 0; j < count; j++) samples.push(a.clone().lerp(b, j / count));
  }
  samples.push(points.at(-1).clone());
  return samples;
}

// Independent closest-point checks against complete triangles catch intrusion
// between grid vertices, including buttress and rounded-rim interpolation.
function minimumClearance(group, route, required) {
  const triangle = new T.Triangle(), closest = new T.Vector3();
  let minimum = Infinity;
  for (const mesh of group.children) {
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      triangle.a.fromBufferAttribute(position, index.getX(i));
      triangle.b.fromBufferAttribute(position, index.getX(i + 1));
      triangle.c.fromBufferAttribute(position, index.getX(i + 2));
      const minX = Math.min(triangle.a.x, triangle.b.x, triangle.c.x) - required - 8;
      const maxX = Math.max(triangle.a.x, triangle.b.x, triangle.c.x) + required + 8;
      const minY = Math.min(triangle.a.y, triangle.b.y, triangle.c.y) - required - 8;
      const maxY = Math.max(triangle.a.y, triangle.b.y, triangle.c.y) + required + 8;
      const minZ = Math.min(triangle.a.z, triangle.b.z, triangle.c.z) - required - 8;
      const maxZ = Math.max(triangle.a.z, triangle.b.z, triangle.c.z) + required + 8;
      for (const point of route) {
        if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY || point.z < minZ || point.z > maxZ) continue;
        const distance = triangle.closestPointToPoint(point, closest).distanceTo(point);
        minimum = Math.min(minimum, distance);
        assert.ok(distance >= required, `${mesh.name} intrudes: ${distance.toFixed(3)}m`);
      }
    }
  }
  return minimum;
}

test('fresh hollow makes two closed rounded portals, preserves the swept road and borrows materials', () => {
  const material = new T.MeshStandardMaterial({vertexColors: true});
  let materialDisposals = 0; material.addEventListener('dispose', () => materialDisposals++);
  const center = new T.Vector3(47, 11, -83);
  const localRoute = [new T.Vector3(-400, 62, -24), new T.Vector3(-75, 76, -24), new T.Vector3(0, 118, 72), new T.Vector3(80, 168, 65), new T.Vector3(400, 185, 65)];
  const route = localRoute.map((point) => point.clone().add(center));
  const hollow = createLivingHollow({center, radius: 185, base: -112, top: 410, routePoints: route, clearance: 34, materials: {bark: material, inner: material, rim: material}});
  assert.equal(hollow.metrics.source, 'fresh-living-forest');
  assert.equal(hollow.metrics.portalLoops, 2);
  assert.equal(hollow.metrics.openPortalVertices, 0);
  assert.equal(hollow.metrics.draws, 4);
  assert.ok(hollow.metrics.triangles < 110000);
  assert.ok(hollow.metrics.branches >= 4);
  assert.deepEqual(hollow.group.position.toArray(), center.toArray());
  const [outer, inner, rim] = hollow.group.children;
  const outerPoints = pointsOf(outer.geometry), innerPoints = pointsOf(inner.geometry);
  const p = rim.geometry.attributes.position, n = rim.geometry.attributes.normal;
  const rows = hollow.metrics.rimRows;
  for (let i = 0; i < p.count; i += rows) {
    assert.ok(outerPoints.has(key(p.getX(i), p.getY(i), p.getZ(i))), 'outer rim is welded to actual shell boundary');
    assert.ok(innerPoints.has(key(p.getX(i + rows - 1), p.getY(i + rows - 1), p.getZ(i + rows - 1))), 'inner rim is welded to actual shell boundary');
    const middle = new T.Vector3().fromBufferAttribute(p, i + 3);
    if (middle.y < 300) {
      const candidates = samplePolyline(localRoute, 8);
      const nearest = candidates.sort((a, b) => a.distanceToSquared(middle) - b.distanceToSquared(middle))[0];
      assert.ok(new T.Vector3().fromBufferAttribute(n, i + 3).dot(nearest.sub(middle)) > 0, 'portal mid-profile normal faces the open passage');
    }
  }
  // Every rolled-rim triangle needs a useful texture footprint. In the old
  // angle+height projection, opposing diagonal slopes collapsed this area.
  const uv = rim.geometry.attributes.uv, indices = rim.geometry.index;
  const ab = new T.Vector3(), ac = new T.Vector3(), start = new T.Vector3();
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    const textureArea = Math.abs((uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) - (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a)));
    start.fromBufferAttribute(p, a);
    ab.fromBufferAttribute(p, b).sub(start); ac.fromBufferAttribute(p, c).sub(start);
    const surfaceArea = ab.cross(ac).length();
    if (surfaceArea > 1e-5) assert.ok(textureArea / surfaceArea > 0.0005, 'rim texture chart does not collapse at diagonal bends');
  }
  for (const mesh of hollow.group.children) for (const attribute of Object.values(mesh.geometry.attributes))
    assert.ok([...attribute.array].every(Number.isFinite), `${mesh.name} has finite attributes`);
  const actualClearance = minimumClearance(hollow.group, samplePolyline(localRoute, 3), 34);
  assert.ok(actualClearance < 65, 'portals follow the route, rather than deleting a large arbitrary wall section');
  const counts = hollow.group.children.map((mesh) => {
    const count = {value: 0}; mesh.geometry.addEventListener('dispose', () => count.value++); return count;
  });
  hollow.dispose(); hollow.dispose();
  assert.ok(counts.every((count) => count.value === 1));
  assert.equal(materialDisposals, 0, 'consumer retains material ownership');
  material.dispose();
});

test('generic hollow without a route has intact shell and a jagged open crown', () => {
  const material = new T.MeshStandardMaterial();
  const hollow = createLivingHollow({radius: 110, base: -80, top: 300, routePoints: [], materials: {bark: material, inner: material, rim: material}});
  assert.equal(hollow.metrics.portalLoops, 0);
  assert.equal(hollow.metrics.portalEdges, 0);
  const box = hollow.group.children[0].geometry.boundingBox;
  assert.ok(box.max.y > 325 && box.max.y < 390);
  hollow.dispose(); material.dispose();
});
