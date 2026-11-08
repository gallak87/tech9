import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchworksTrack } from './model.js';
import { createLaunchworksRoad } from './road.js';

test('receiver paint marks the actual accepted lane across its runout without adding a driving surface', () => {
  const track = createLaunchworksTrack();
  const road = createLaunchworksRoad({ track, shape: true });
  try {
    const fields = road.group.children.filter(
      (mesh) => mesh.userData.receiverId,
    );
    assert.equal(
      fields.length,
      track.jumps.filter((jump) => jump.receiverType !== 'tube').length,
    );
    for (const field of fields) {
      const jump = track.jumps.find(
        (entry) => entry.id === field.userData.receiverId,
      );
      const coordinates = field.geometry.getAttribute('roadCoord');
      let minimum = Infinity,
        maximum = -Infinity;
      let start = Infinity,
        end = -Infinity;
      for (let i = 0; i < coordinates.count; i++) {
        minimum = Math.min(minimum, coordinates.getY(i));
        maximum = Math.max(maximum, coordinates.getY(i));
        start = Math.min(start, coordinates.getX(i));
        end = Math.max(end, coordinates.getX(i));
      }
      assert.ok(
        Math.abs(maximum - minimum - jump.catchWidth) < 0.002,
        jump.label,
      );
      assert.ok(Math.abs(minimum + jump.catchWidth / 2) < 0.002, jump.label);
      assert.ok(Math.abs(start - jump.landingStart - 0.5) < 0.002, jump.label);
      assert.ok(Math.abs(end - jump.landingEnd + 0.5) < 0.002, jump.label);
      assert.ok((maximum - minimum) / track.width >= 0.9, jump.label);
      assert.equal(field.userData.drivingSurface, undefined);
      assert.equal(field.userData.roadSurface, undefined);
    }
  } finally {
    road.dispose();
  }
});
