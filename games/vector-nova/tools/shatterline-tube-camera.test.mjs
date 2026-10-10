import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createCameraRig } from '../src/camera/index.js';
import { interpolateSurfaceLateral } from '../src/track/surface.js';

const track = createShatterlineTrack();
const options = { chaseHeight: 7.5, chaseDistance: 16, lookAhead: 65 };

for (const tube of track.tubes) {
  const period = Math.PI * tube.radius * 2;
  const canonical = (value) =>
    ((((value + period / 2) % period) + period) % period) - period / 2;
  test(`${tube.id}: chase follows three full turns without a seam flip`, () => {
    const camera = new T.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
    const rig = createCameraRig(camera, options);
    let previous;
    for (let i = 0; i <= 720; i++) {
      const state = {
        distance:
          tube.entryEnd +
          20 +
          (i / 720) * (tube.exitStart - tube.entryEnd - 40),
        lateral: canonical((i / 720) * period * 3),
        speed: 150,
      };
      const surface = track.sampleSurface(state.distance, state.lateral);
      rig.update(track, state, 1 / 60);
      const back = track.sample(state.distance - 16 - state.speed * 0.025);
      const center = back.position
        .clone()
        .addScaledVector(back.up, tube.radius);
      const radial = camera.position.clone().sub(center);
      radial.addScaledVector(back.tangent, -radial.dot(back.tangent));
      assert.ok(
        radial.length() < tube.radius - 2,
        `camera stays inside bore: ${radial.length()}`,
      );
      assert.ok(
        camera.up.dot(surface.up) > 0.85,
        'horizon follows player around full circumference',
      );
      if (previous) {
        assert.ok(
          camera.quaternion.angleTo(previous.quaternion) < 0.09,
          'no seam rotation snap',
        );
        assert.ok(
          camera.position.distanceTo(previous.position) < 3,
          'no seam translation snap',
        );
      }
      previous = camera.clone();
    }
  });
}

test('entry and collector smoothly hand camera back to the ordinary road', () => {
  const camera = new T.PerspectiveCamera(64, 16 / 9, 0.2, 14000);
  const rig = createCameraRig(camera, options);
  let previous;
  for (
    let distance = track.overturn.start - 100;
    distance <= track.overturn.end + 100;
    distance += 2
  ) {
    const profile = track.tubeProfile(distance);
    const lateral = (profile?.halfWidth ?? 25) * 0.55;
    rig.update(track, { distance, lateral, speed: 150 }, 1 / 60);
    assert.ok(
      [...camera.position, ...camera.quaternion].every(Number.isFinite),
    );
    if (previous) {
      assert.ok(
        camera.position.distanceTo(previous.position) < 4,
        `position at ${distance}`,
      );
      assert.ok(
        camera.quaternion.angleTo(previous.quaternion) < 0.12,
        `orientation at ${distance}`,
      );
    }
    previous = camera.clone();
  }
});

test('render interpolation crosses both periodic seams by the short physical arc', () => {
  for (const tube of track.tubes) {
    const period = Math.PI * tube.radius * 2;
    const distance = (tube.entryEnd + tube.exitStart) / 2;
    for (const direction of [-1, 1]) {
      const a = direction * (period / 2 - 0.2),
        b = -direction * (period / 2 - 0.3);
      const previous = { distance, lateral: a },
        current = { distance: distance + 1, lateral: b };
      const middle = interpolateSurfaceLateral(track, previous, current, 0.5);
      const point = track.sampleSurface(distance + 0.5, middle).position;
      const physical = track
        .sampleSurface(distance, a)
        .position.clone()
        .lerp(track.sampleSurface(distance + 1, b).position, 0.5);
      assert.ok(point.distanceTo(physical) < 0.01);
      assert.equal(interpolateSurfaceLateral(track, previous, current, 1), b);
    }
  }
});
