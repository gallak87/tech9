import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Group, Mesh, MeshBasicMaterial } from 'three';
import { sweepGeometry } from '../track/geometry.js';
import { createLevel3Track } from '../levels/nacre/track/model.js';
import { buildNacreTrack } from '../levels/nacre/track/production.js';
import { createDevices } from '../levels/nacre/devices.js';
import { createRoadProjector } from './geometry.js';
import { collectRoadSurfaces, roadDeviceMountHeight } from './device-mount.js';

import {
  createHelionTrack,
  buildHelionRoad,
} from '../levels/helion/track/index.js';
import { createDevices as helionDevices } from '../levels/helion/devices.js';

for (const [name, createTrack, buildRoad, devices] of [
  ['Nacre', createLevel3Track, buildNacreTrack, createDevices],
  ['Helion', createHelionTrack, buildHelionRoad, helionDevices],
])
  test(`${name} boost casings clear the raised running skins at every strip`, () => {
    const track = createTrack();
    const built = buildRoad(track);
    const road = built.group ?? built;
    const projector = createRoadProjector(track);
    const surfaces = collectRoadSurfaces(road);
    let oldPenetrations = 0;
    try {
      for (const device of devices(track)) {
        const lift = roadDeviceMountHeight(surfaces, device, projector);
        if (device.type !== 'vector') {
          assert.equal(lift, 0);
          continue;
        }
        assert.ok(
          lift >= 0 && lift < 0.6,
          `${device.id}: mount exceeds the hull clearance`,
        );
        let samples = 0;
        for (const { geometry } of surfaces) {
          const coord = geometry.getAttribute('roadCoord');
          const position = geometry.getAttribute('position');
          const index = geometry.getIndex();
          for (let i = 0; i < (index?.count ?? position.count); i += 3) {
            const indices = [0, 1, 2].map((j) =>
              index ? index.getX(i + j) : i + j,
            );
            const s = indices.map((j) => coord.getX(j));
            const x = indices.map((j) => coord.getY(j));
            if (
              Math.max(...s) < device.distance - device.length / 2 ||
              Math.min(...s) > device.distance + device.length / 2 ||
              Math.max(...x) < device.lateral - device.width / 2 ||
              Math.min(...x) > device.lateral + device.width / 2
            )
              continue;
            const vertices = indices.map((j) =>
              new Vector3().fromBufferAttribute(position, j),
            );
            for (let a = 0; a <= 4; a++)
              for (let b = 0; b <= 4 - a; b++) {
                const weights = [a / 4, b / 4, 1 - (a + b) / 4];
                const distance = weights.reduce(
                  (sum, w, j) => sum + w * s[j],
                  0,
                );
                const lateral = weights.reduce(
                  (sum, w, j) => sum + w * x[j],
                  0,
                );
                if (
                  Math.abs(distance - device.distance) > device.length / 2 ||
                  Math.abs(lateral - device.lateral) > device.width / 2
                )
                  continue;
                const surface = weights.reduce(
                  (p, w, j) => p.addScaledVector(vertices[j], w),
                  new Vector3(),
                );
                const relativeHeight = surface
                  .sub(projector.sample(distance, lateral))
                  .dot(track.sample(distance).up);
                if (relativeHeight > 0.063) oldPenetrations++;
                assert.ok(
                  0.063 + lift - relativeHeight > 0.005,
                  `${device.id}: skin penetrates casing at ${distance}, ${lateral}`,
                );
                samples++;
              }
          }
        }
        assert.ok(samples > 100, `${device.id}: missing road coverage`);
      }
      assert.ok(
        oldPenetrations > 0,
        'fixture must exercise the old mounting defect',
      );
    } finally {
      projector.dispose();
      if (built.dispose) built.dispose();
      else road.userData.dispose();
    }
  });

test('shared mounting measures authored geometry independently of UVs and level identity', () => {
  const track = {
    length: 100,
    width: 20,
    sample: (distance) => ({
      position: new Vector3(0, 0, distance),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      tangent: new Vector3(0, 0, 1),
      quaternion: new Quaternion(),
    }),
  };
  const device = {
    type: 'vector',
    distance: 40,
    length: 20,
    width: 10,
    lateral: 0,
  };
  const projector = createRoadProjector(track);
  const road = new Group();
  const material = new MeshBasicMaterial();
  try {
    assert.throws(() => collectRoadSurfaces(road), /must declare/);
    for (const indexed of [true, false]) {
      let geometry = sweepGeometry(
        track,
        [
          [-10, 0.17],
          [10, 0.17],
        ],
        { uvScale: 3 },
      );
      if (!indexed) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        geometry = flat;
      }
      geometry.getAttribute('uv').array.fill(100);
      const mesh = new Mesh(geometry, material);
      mesh.userData.roadSurface = true;
      mesh.position.y = 0.04;
      road.add(mesh);
      const surfaces = collectRoadSurfaces(road);
      assert.ok(
        Math.abs(roadDeviceMountHeight(surfaces, device, projector) - 0.172) <
          1e-5,
      );
      assert.equal(
        roadDeviceMountHeight(
          surfaces,
          { ...device, type: 'aegis' },
          projector,
        ),
        0,
      );
      geometry.deleteAttribute('roadCoord');
      assert.throws(() => collectRoadSurfaces(road), /requires roadCoord/);
      road.remove(mesh);
      geometry.dispose();
    }
  } finally {
    projector.dispose();
    material.dispose();
  }
});
