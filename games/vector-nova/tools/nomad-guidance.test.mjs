import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as T from 'three';
import { createNomadGuidance } from '../src/levels/nomad/guidance.js';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { createNomadRoad } from '../src/levels/nomad/track/road.js';
import {
  installNomadMotion,
  sampleCarrierMotion,
} from '../src/levels/nomad/motion.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';
import { createSurfaceProjector } from '../src/pickups/surface-projector.js';

const track = installNomadMotion(createNomadTrack());
const road = createNomadRoad({ track, shape: true });
road.group.updateWorldMatrix(true, true);
const surfaces = collectRoadSurfaces(road.group);
after(() => road.dispose());
const hash = (group) =>
  group.children.map((mesh) => {
    const digest = createHash('sha256');
    for (const attr of Object.values(mesh.geometry.attributes))
      digest.update(Buffer.from(attr.array.buffer));
    return digest.digest('hex');
  });
const near = (a, b, message) => assert.ok(a.distanceTo(b) < 1e-6, message);

test('all ten real gaps have broad forward paint with supported, widened receiver marks', () => {
  const guidance = createNomadGuidance({ track, surfaces });
  try {
    assert.equal(guidance.group.children.length, 11, 'one draw per carrier');
    assert.equal(
      new Set(guidance.group.children.map((mesh) => mesh.material)).size,
      1,
    );
    for (const jump of track.jumps) {
      const departure = guidance.group.children.find(
        (mesh) => mesh.userData.motionGroup === jump.departureCarrierId,
      );
      const receiver = guidance.group.children.find(
        (mesh) => mesh.userData.motionGroup === jump.receivingCarrierId,
      );
      const white = (mesh, center) => {
        const coords = mesh.geometry.attributes.roadCoord,
          colors = mesh.geometry.attributes.color;
        const points = [];
        for (let i = 0; i < coords.count; i++)
          if (colors.getZ(i) > 0.5 && Math.abs(coords.getY(i) - center) < 11)
            points.push([coords.getX(i), coords.getY(i)]);
        return points;
      };
      for (const before of [140, 95, 50]) {
        const center = jump.takeoff - before;
        const points = white(departure, center);
        assert.ok(points.length > 6, `${jump.id}: broad ${before} m warning`);
        assert.ok(
          Math.max(...points.map((point) => point[0])) -
            Math.min(...points.map((point) => point[0])) >
            30,
        );
        const tip = points.reduce((a, b) => (b[1] > a[1] ? b : a));
        const outerTail =
          Math.max(...points.map((point) => Math.abs(point[0]))) * 0.9;
        assert.ok(
          Math.abs(tip[0]) < 0.001 && tip[1] > center + 6.9,
          'the central point faces increasing route distance',
        );
        assert.ok(
          points
            .filter((point) => Math.abs(point[0]) > outerTail)
            .every((point) => point[1] < center - 5),
          'wide tails are behind the point, even on winding or banked decks',
        );
      }
      for (const after of [50, 100]) {
        const center = jump.landingStart + after;
        const points = white(receiver, center);
        assert.ok(points.length > 6);
        const span =
          Math.max(...points.map((point) => point[0])) -
          Math.min(...points.map((point) => point[0]));
        const width = track.halfWidthAt(center) * 2;
        assert.ok(
          width > track.mainWidth + 1,
          'the receiving skin is genuinely wider',
        );
        assert.ok(
          span > width * 0.52 && span < width * 0.62,
          `${jump.id}: the receiver glyph should occupy over half of its actual ${width}m deck`,
        );
      }
      const coordinates = departure.geometry.attributes.roadCoord;
      const warning = [];
      for (let i = 0; i < coordinates.count; i++)
        if (
          coordinates.getY(i) > jump.takeoff - 8 &&
          coordinates.getY(i) < jump.takeoff
        )
          warning.push([coordinates.getX(i), coordinates.getY(i)]);
      assert.ok(warning.length > 12);
      assert.ok(
        Math.max(...warning.map((point) => point[1])) <= jump.takeoff - 0.99,
      );
      assert.ok(
        Math.min(...warning.map((point) => point[1])) >= jump.takeoff - 7.01,
      );
      assert.ok(
        Math.max(...warning.map((point) => point[0])) -
          Math.min(...warning.map((point) => point[0])) >
          45,
        'caution strip crosses the usable lane before the bare takeoff lip',
      );
    }
    for (const mesh of guidance.group.children) {
      assert.equal(mesh.material.transparent, false);
      assert.equal(mesh.material.emissiveIntensity, 1);
      assert.ok(
        mesh.material.emissive.equals(new T.Color(0)),
        'paint carries no bloom or light source',
      );
      assert.equal(mesh.castShadow, false);
    }
  } finally {
    guidance.dispose();
  }
});

test('paint is seated on the exact tessellated nominal skin and never bridges unsupported space', () => {
  const guidance = createNomadGuidance({ track, surfaces });
  const projector = createSurfaceProjector(track, surfaces, { nominal: true });
  const point = new T.Vector3();
  try {
    for (const mesh of guidance.group.children) {
      const { position, roadCoord } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const x = roadCoord.getX(i),
          s = roadCoord.getY(i);
        assert.equal(track.surfaceCoverage(s, x), 1);
        assert.equal(track.carrierAt(s).id, mesh.userData.motionGroup);
        const rest = projector.sample(s, x);
        const lift = point.fromBufferAttribute(position, i).sub(rest);
        assert.ok(
          lift.length() >= 0.061 && lift.length() <= 0.079,
          'paint rests 4–8 cm above the rendered face',
        );
        assert.ok(
          lift.dot(track.nominalSample(s).up) > 0.06,
          'paint lifts onto the visible top face',
        );
      }
      for (let i = 0; i < roadCoord.count; i += 3) {
        const center =
          (roadCoord.getY(i) + roadCoord.getY(i + 1) + roadCoord.getY(i + 2)) /
          3;
        assert.equal(
          track.isGap(center),
          false,
          'no paint triangle crosses a real transfer gap',
        );
      }
    }
  } finally {
    projector.dispose();
    guidance.dispose();
  }
});

test('nonzero-phase builds, pause and reset translate only the owning carrier without rebaking paint', () => {
  const guidance = createNomadGuidance({ track, surfaces });
  const initial = hash(guidance.group);
  let rebuilt;
  try {
    track.presentationTime = 12.4;
    road.update();
    road.group.updateWorldMatrix(true, true);
    const liveMatrices = surfaces.map((mesh) => mesh.matrixWorld.toArray());
    rebuilt = createNomadGuidance({ track, surfaces });
    assert.deepEqual(
      hash(rebuilt.group),
      initial,
      'quality/session rebuild never bakes the live road translation',
    );
    assert.deepEqual(
      surfaces.map((mesh) => mesh.matrixWorld.toArray()),
      liveMatrices,
    );
    for (const component of [guidance, rebuilt]) {
      component.update({ dt: 1 / 60, time: 900 });
      for (const mesh of component.group.children) {
        const carrier = track.carriers.find(
          (entry) => entry.id === mesh.userData.motionGroup,
        );
        near(mesh.position, sampleCarrierMotion(carrier, 12.4).translation);
      }
      const paused = component.group.children.map((mesh) =>
        mesh.position.toArray(),
      );
      component.update({ dt: 0, time: 1200 });
      assert.deepEqual(
        component.group.children.map((mesh) => mesh.position.toArray()),
        paused,
        'render time never advances physical carrier motion during pause',
      );
      assert.deepEqual(hash(component.group), initial);
    }
    track.presentationTime = 0;
    guidance.update({ reset: true });
    rebuilt.update({ reset: true });
    for (const mesh of [...guidance.group.children, ...rebuilt.group.children])
      near(mesh.position, new T.Vector3());
  } finally {
    guidance.dispose();
    rebuilt?.dispose();
    track.presentationTime = 0;
    road.update();
    road.group.updateWorldMatrix(true, true);
  }
});

test('guidance disposes its merged buffers and single material once, leaving borrowed road resources intact', () => {
  const guidance = createNomadGuidance({ track, surfaces });
  const meshes = [...guidance.group.children];
  let geometriesDisposed = 0,
    materialsDisposed = 0,
    borrowedDisposed = 0;
  for (const mesh of meshes)
    mesh.geometry.addEventListener('dispose', () => geometriesDisposed++);
  meshes[0].material.addEventListener('dispose', () => materialsDisposed++);
  const listener = () => borrowedDisposed++;
  for (const mesh of surfaces)
    mesh.geometry.addEventListener('dispose', listener);
  guidance.dispose();
  guidance.dispose();
  guidance.update({ time: 90 });
  assert.equal(geometriesDisposed, 11);
  assert.equal(materialsDisposed, 1);
  assert.equal(borrowedDisposed, 0);
  assert.equal(guidance.group.children.length, 0);
  for (const mesh of surfaces)
    mesh.geometry.removeEventListener('dispose', listener);
});
