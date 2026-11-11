import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperTrack } from './model.js';
import { createVesperRoad } from './road.js';
import { sampleVesperSurface } from '../surface.js';

test('visible sap covers the authored resistance zones while the marked dry corridor stays clear', () => {
  const track = createVesperTrack();
  const road = createVesperRoad({ track });
  try {
    const films = [];
    road.group.traverse((mesh) => {
      if (mesh.userData.sapFilm) films.push(mesh);
    });
    assert.ok(films.length >= track.sapZones.length);
    assert.ok(road.group.getObjectByName('Sap flow / pale dry-lane margins'));
    const represented = new Set();
    for (const mesh of films) {
      const { uv } = mesh.geometry.attributes;
      const index = mesh.geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        let distance = 0,
          lateral = 0;
        for (let j = 0; j < 3; j++) {
          distance += (uv.getY(index.getX(i + j)) * 16) / 3;
          lateral += (uv.getX(index.getX(i + j)) * 28 - 14) / 3;
        }
        const sample = sampleVesperSurface(track, {
          distance,
          lateral,
          speed: 90,
        });
        assert.equal(
          sample.id,
          'sap',
          `painted sap must resist at ${distance}/${lateral}`,
        );
        represented.add(sample.zone);
      }
    }
    assert.deepEqual(
      [...represented].sort(),
      track.sapZones.map((zone) => zone.id).sort(),
    );
    for (const zone of track.sapZones) {
      assert.equal(
        sampleVesperSurface(track, {
          distance: (zone.start + zone.end) / 2,
          lateral: zone.resinCenter,
          speed: 90,
        }).id,
        'resin',
      );
    }
  } finally {
    road.dispose();
  }
});
