import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLevel3Track } from '../levels/nacre/track/model.js';
import { buildNacreTrack } from '../levels/nacre/track/production.js';
import { createDevices } from '../levels/nacre/devices.js';
import { createRoadProjector } from './geometry.js';

import {
  createHelionTrack,
  buildHelionRoad,
} from '../levels/helion/track/index.js';
import { createDevices as helionDevices } from '../levels/helion/devices.js';

for (const [name, createTrack, buildRoad, devices, isSkin] of [
  [
    'Nacre',
    createLevel3Track,
    buildNacreTrack,
    createDevices,
    (mesh) => mesh.userData.drivingSurface,
  ],
  [
    'Helion',
    createHelionTrack,
    buildHelionRoad,
    helionDevices,
    (mesh) => /Formed cassettes|Broad graphite reinforcement/.test(mesh.name),
  ],
])
  test(`${name} boost casings clear the raised running skins at every strip`, () => {
    const track = createTrack();
    const built = buildRoad(track);
    const road = built.group ?? built;
    const projector = createRoadProjector(track);
    const surfaces = road.children.filter(isSkin);
    let oldPenetrations = 0;
    try {
      for (const device of devices(track)) {
        const lift = road.userData.deviceMountHeight(device, projector);
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
