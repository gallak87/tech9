import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createSaffronTrack } from './model.js';
import { createSaffronRoad } from './road.js';
import { deckSkinGeometry } from './skins.js';

const track = createSaffronTrack();
const lift = 0.045;
const halfWidth = 16.5;
// World positions and route metres are Float32 attributes, including distances
// beyond 4.7 km. One millimetre allows quantization without hiding intersections.
const positionTolerance = 0.001;

function triangles(geometry) {
  const p = geometry.getAttribute('position');
  const uv = geometry.getAttribute('roadCoord');
  const index = geometry.index;
  const result = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const vertices = [0, 1, 2].map((offset) => {
      const vertex = index ? index.getX(i + offset) : i + offset;
      return {
        point: new T.Vector3().fromBufferAttribute(p, vertex),
        coordinate: new T.Vector3(uv.getX(vertex), uv.getY(vertex), 0),
      };
    });
    const coordinates = new T.Triangle(
      ...vertices.map((vertex) => vertex.coordinate),
    );
    const surface = new T.Triangle(...vertices.map((vertex) => vertex.point));
    result.push({
      vertices,
      coordinates,
      surface,
      min: Math.min(...vertices.map((vertex) => vertex.coordinate.x)),
      max: Math.max(...vertices.map((vertex) => vertex.coordinate.x)),
    });
  }
  return result;
}

function containsCoordinate(triangle, point) {
  const barycentric = triangle.coordinates.getBarycoord(point, new T.Vector3());
  return barycentric && Math.min(...barycentric.toArray()) >= -0.0001;
}

for (const id of ['sandfall', 'return']) {
  test(`${id} bank skin follows individual rendered slab triangles with 45 mm clearance`, () => {
    const road = createSaffronRoad({ track }, { shape: true });
    let skin;
    try {
      const surfaces = road.group.children
        .filter((object) => object.name === 'Smoked gold travel ribbon')
        .map((object) => ({
          start: object.userData.interval[0],
          end: object.userData.interval[1],
          geometry: object.geometry,
        }));
      const section = track.sections.find((section) => section.id === id);
      // Cut between existing slab stations and through both lateral triangle
      // edges, so coverage checks exercise real clipped polygons on the bank.
      const start = section.start + 0.713;
      const end = section.end - 0.927;
      assert.ok(Math.abs(track.sample((start + end) / 2).bank) > 0.4);
      const source = surfaces.flatMap((surface) => triangles(surface.geometry));
      skin = deckSkinGeometry(surfaces, track, start, end, halfWidth, lift);
      const patches = triangles(skin);
      assert.ok(patches.length > 100, 'check a substantial banked stretch');
      const reached = { start: false, end: false, left: false, right: false };
      for (const patch of patches) {
        // Every output triangle must belong to one original source facet. A
        // separate sweep bridges diagonal slab edges and fails this condition.
        const original = source.find(
          (candidate) =>
            candidate.min <= patch.max + positionTolerance &&
            candidate.max >= patch.min - positionTolerance &&
            patch.vertices.every((vertex) =>
              containsCoordinate(candidate, vertex.coordinate),
            ),
        );
        assert.ok(
          original,
          'skin triangle crossed a rendered slab triangle edge',
        );
        for (const vertex of patch.vertices) {
          const [distance, lateral] = vertex.coordinate.toArray();
          assert.ok(distance >= start - positionTolerance);
          assert.ok(distance <= end + positionTolerance);
          assert.ok(Math.abs(lateral) <= halfWidth + positionTolerance);
          reached.start ||= Math.abs(distance - start) < positionTolerance;
          reached.end ||= Math.abs(distance - end) < positionTolerance;
          reached.left ||= Math.abs(lateral + halfWidth) < positionTolerance;
          reached.right ||= Math.abs(lateral - halfWidth) < positionTolerance;

          // Undo only the declared lift and compare with the real rendered
          // facet, independently reconstructed from its barycentric position.
          const barycentric = original.coordinates.getBarycoord(
            vertex.coordinate,
            new T.Vector3(),
          );
          const expected = new T.Vector3()
            .addScaledVector(original.surface.a, barycentric.x)
            .addScaledVector(original.surface.b, barycentric.y)
            .addScaledVector(original.surface.c, barycentric.z);
          const unlifted = vertex.point
            .clone()
            .addScaledVector(track.sample(distance).up, -lift);
          assert.ok(
            expected.distanceTo(unlifted) < positionTolerance,
            `skin departed from its source plane at ${distance.toFixed(3)} m`,
          );
        }

        // Ray-test interiors as well as the edges. This catches an overlay
        // that intersects the bank despite placing its vertices above it.
        const plane = original.surface.getPlane(new T.Plane());
        for (const weights of [
          [1 / 3, 1 / 3, 1 / 3],
          [0.6, 0.2, 0.2],
        ]) {
          const point = new T.Vector3();
          let distance = 0;
          patch.vertices.forEach((vertex, index) => {
            point.addScaledVector(vertex.point, weights[index]);
            distance += vertex.coordinate.x * weights[index];
          });
          const direction = track.sample(distance).up.clone().negate();
          const ray = new T.Ray(point, direction);
          const hit = ray.intersectPlane(plane, new T.Vector3());
          assert.ok(hit, 'skin interior is beneath its source plane');
          assert.ok(
            Math.abs(point.distanceTo(hit) - lift) < positionTolerance,
            'skin interior does not retain its declared 45 mm separation',
          );
          const nearest = original.surface.closestPointToPoint(
            hit,
            new T.Vector3(),
          );
          assert.ok(nearest.distanceTo(hit) < positionTolerance);
        }
      }
      assert.deepEqual(reached, {
        start: true,
        end: true,
        left: true,
        right: true,
      });
    } finally {
      skin?.dispose();
      road.dispose();
    }
  });
}
