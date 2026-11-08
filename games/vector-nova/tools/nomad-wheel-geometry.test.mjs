import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { COLLISION_HULLS } from '../src/ships/collision-hulls.js';

const folder = new URL('../assets/levels/nomad/blender/', import.meta.url);
const record = JSON.parse(
  await readFile(new URL('carrier-kit-provenance.json', folder), 'utf8'),
);
const hulls = JSON.parse(
  await readFile(new URL('carrier-collision.json', folder), 'utf8'),
);
const saltwind = JSON.parse(
  await readFile(
    new URL('saltwind-gallery/saltwind-gallery-collision.json', folder),
    'utf8',
  ),
);
const anchors = record.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');
const bytes = await readFile(
  new URL('../' + record.runtimeAsset, import.meta.url),
);
const loaded = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
loaded.scene.updateMatrixWorld(true);
function vertices(name) {
  const root = loaded.scene.getObjectByName(name),
    inverse = root.matrixWorld.clone().invert(),
    result = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld),
      attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++)
      result.push(
        new T.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(matrix),
      );
  });
  return result;
}
const near = vertices('nomad_wheel');

test('all real wheel tiers retain the R30 rolling circle, original width and seated axle height', () => {
  assert.equal(record.wheelGeometry.rollingRadius, 30);
  assert.equal(record.wheelGeometry.axialScale, 1);
  assert.equal(anchors.length, 18);
  for (const anchor of anchors) {
    assert.equal(anchor.rollingRadius, 30);
    assert.equal(
      anchor.position[1],
      30,
      'larger radius and axle height preserve the actual ground origin',
    );
  }
  for (const name of ['nomad_wheel', 'nomad_wheel_mid', 'nomad_wheel_far']) {
    const points = vertices(name),
      radius = Math.max(...points.map((point) => Math.hypot(point.y, point.z)));
    assert.ok(Math.abs(radius - 30) < 0.02, `${name}: real radial envelope`);
    assert.ok(
      points.every((point) => Math.abs(point.x) <= 11.901),
      `${name}: accepted axial width`,
    );
    for (let index = 0; index < 48; index++) {
      const angle = (index * Math.PI * 2) / 48;
      const support = Math.max(
        ...points.map(
          (point) => -(point.y * Math.cos(angle) - point.z * Math.sin(angle)),
        ),
      );
      assert.ok(
        Math.abs(support - 30) < 0.1,
        `${name}: rolling ground tangency at ${index}`,
      );
    }
  }
});

// Upper concave radial profile of the actual rendered wheel encloses every
// possible rotation, including the real tread and hub lips. Its circumscribed
// half-planes let us check hull faces without substituting a box for the tyre.
function rotorPlanes() {
  const points = near
      .map((point) => ({ x: point.x, r: Math.hypot(point.y, point.z) }))
      .sort((a, b) => a.x - b.x || b.r - a.r),
    unique = [];
  for (const point of points)
    if (!unique.length || point.x - unique.at(-1).x > 1e-6) unique.push(point);
  const upper = [];
  for (const p of unique) {
    while (upper.length >= 2) {
      const a = upper.at(-2),
        b = upper.at(-1);
      if ((b.x - a.x) * (p.r - b.r) - (b.r - a.r) * (p.x - b.x) < -1e-7) break;
      upper.pop();
    }
    upper.push(p);
  }
  const planes = [
    { n: new T.Vector3(-1, 0, 0), d: -upper[0].x },
    { n: new T.Vector3(1, 0, 0), d: upper.at(-1).x },
  ];
  for (let i = 1; i < upper.length; i++) {
    const a = upper[i - 1],
      b = upper[i],
      slope = (b.r - a.r) / (b.x - a.x);
    for (let side = 0; side < 32; side++) {
      const angle = (side * Math.PI * 2) / 32,
        n = new T.Vector3(-slope, Math.cos(angle), Math.sin(angle)),
        length = n.length();
      planes.push({
        n: n.divideScalar(length),
        d: (a.r - slope * a.x) / length,
      });
    }
  }
  return planes;
}
function entersRotor(corners, planes) {
  let polygon = corners;
  for (const { n, d } of planes) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = n.dot(a) - d,
        db = n.dot(b) - d;
      if (da <= -1e-5) output.push(a);
      if (da < -1e-5 !== db < -1e-5)
        output.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = output;
    if (!polygon.length) return false;
  }
  return true;
}

test('actual canonical and Saltwind wheelwell/guard hull faces clear the complete rotating wheel envelope', () => {
  const planes = rotorPlanes(),
    ratios = [
      ...new Set(
        createNomadTrack().carriers.map(
          (carrier) => carrier.scale.z / carrier.scale.x,
        ),
      ),
    ];
  for (const prototype of [
    hulls.prototypes.find((part) => part.name === 'nomad_carrier'),
    saltwind.prototypes.find((part) => part.name === 'nomad_saltwind_hull'),
  ]) {
    const triangles = [];
    for (let i = 0; i < prototype.indices.length; i += 3) {
      const points = [0, 1, 2].map((corner) =>
        new T.Vector3().fromArray(
          prototype.positions,
          prototype.indices[i + corner] * 3,
        ),
      );
      triangles.push({
        points,
        bounds: new T.Box3().setFromPoints(points),
        part: prototype.parts.find(
          (part) =>
            i >= part.indexStart && i < part.indexStart + part.indexCount,
        )?.name,
      });
    }
    for (const ratio of ratios)
      for (const anchor of anchors) {
        const centre = new T.Vector3().fromArray(anchor.position),
          bounds = new T.Box3(
            centre.clone().sub(new T.Vector3(12, 30.1, 30.1 / ratio)),
            centre.clone().add(new T.Vector3(12, 30.1, 30.1 / ratio)),
          );
        for (const triangle of triangles) {
          if (!triangle.bounds.intersectsBox(bounds)) continue;
          const local = triangle.points.map((point) =>
            point
              .clone()
              .sub(centre)
              .multiply(new T.Vector3(1, 1, ratio)),
          );
          assert.ok(
            !entersRotor(local, planes),
            `${prototype.name}/${triangle.part}: wheel ${anchor.name}, stretch${ratio}`,
          );
        }
      }
  }
});

test('actual formed guards and world-round enlarged tyres clear every full-width banked driving skin and fleet footprint', () => {
  const track = createNomadTrack(),
    fleet = new T.Box3();
  for (const hull of Object.values(COLLISION_HULLS))
    for (const point of [hull.bounds.min, hull.bounds.max])
      fleet.expandByPoint(new T.Vector3().fromArray(point));
  const shape = {
      halfWidth: Math.max(-fleet.min.x, fleet.max.x),
      halfLength: Math.max(-fleet.min.z, fleet.max.z),
      hover: (fleet.max.y - fleet.min.y) / 2,
    },
    lift = (fleet.max.y + fleet.min.y) / 2 + 0.045;
  for (const carrier of track.carriers) {
    const prototype =
      carrier.id === 'nomad-saltwind'
        ? saltwind.prototypes.find(
            (part) => part.name === 'nomad_saltwind_hull',
          )
        : hulls.prototypes.find((part) => part.name === 'nomad_carrier');
    const matrix = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion,
      carrier.scale,
    );
    const triangles = prototype.parts
      .filter((part) => part.name.includes('formed wheel guard'))
      .flatMap((part) =>
        indexedTriangles(
          prototype.positions,
          prototype.indices.slice(
            part.indexStart,
            part.indexStart + part.indexCount,
          ),
          { id: part.name, kind: 'structure' },
          matrix,
        ),
      );
    const radius = 30 / Math.cos(Math.PI / 32),
      cylinder = new T.CylinderGeometry(radius, radius, 20, 32, 1, false);
    cylinder.rotateZ(Math.PI / 2);
    for (const anchor of anchors) {
      const position = new T.Vector3()
          .fromArray(anchor.position)
          .multiply(carrier.scale)
          .applyQuaternion(carrier.quaternion)
          .add(carrier.origin),
        wheelMatrix = new T.Matrix4().compose(
          position,
          carrier.quaternion,
          new T.Vector3().setScalar(carrier.scale.x),
        );
      triangles.push(
        ...indexedTriangles(
          Array.from(cylinder.attributes.position.array),
          Array.from(cylinder.index.array),
          { id: anchor.name, kind: 'structure' },
          wheelMatrix,
        ),
      );
    }
    cylinder.dispose();
    const world = createCollisionWorld({
      id: carrier.id,
      version: 1,
      geometryId: 'real-r30-guards',
      triangles,
    });
    try {
      for (
        let distance = carrier.start + 0.01;
        distance < carrier.end - 0.01;
        distance += 0.5
      ) {
        const next = Math.min(distance + 0.5, carrier.end - 0.01),
          half = track.halfWidthAt(distance),
          nextHalf = track.halfWidthAt(next);
        const inverse = matrix.clone().invert(),
          row = [-half, half].map((lateral) =>
            track
              .sampleSurface(distance, lateral)
              .position.clone()
              .applyMatrix4(inverse),
          );
        if (
          row.every((point) => point.y > 85) ||
          row.every((point) => Math.abs(point.x) < 65)
        )
          continue;
        const divisions = Math.ceil(half * 2);
        for (let index = 0; index <= divisions; index++) {
          const fraction = (index / divisions) * 2 - 1;
          const a = track.sampleSurface(distance, fraction * half),
            b = track.sampleSurface(next, fraction * nextHalf);
          for (const frame of [a, b]) {
            frame.position.addScaledVector(frame.up, lift);
            frame.quaternion = new T.Quaternion().setFromRotationMatrix(
              new T.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
            );
          }
          const hit = world.sweepHull(a, b, shape);
          assert.ok(
            !hit,
            `${carrier.id}/${hit?.shape.id}: full banked fleet footprint at ${distance}, lateral${fraction * half}`,
          );
        }
      }
    } finally {
      world.dispose();
    }
  }
});

test.after(() => {
  loaded.scene.traverse((mesh) => {
    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      material?.dispose();
  });
});
