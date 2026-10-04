import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
import {
  createCindercoilAtmosphere,
  sampleCindercoilAtmosphere,
} from '../src/levels/cindercoil/atmosphere.js';
const track = createCindercoilTrack();
test('ash clears under the inverted deck and hot response follows actual contact', () => {
  const inverted =
    track.landmarks.coil.start +
    (track.landmarks.coil.end - track.landmarks.coil.start) * 0.5;
  assert.equal(
    sampleCindercoilAtmosphere(track, {
      distance: inverted,
      lateral: 0,
      time: 4,
    }).ash,
    0,
  );
  const zone = track.surgeZones[0];
  const protectedState = {
    distance: (zone.start + zone.end) / 2,
    lateral: -zone.side * 10,
    time: 4 - zone.phaseOffset,
  };
  const exposedState = { ...protectedState, lateral: zone.side * 10 };
  const protectedAir = sampleCindercoilAtmosphere(track, protectedState);
  const exposedAir = sampleCindercoilAtmosphere(track, exposedState);
  assert.equal(protectedAir.contact, false);
  assert.equal(exposedAir.contact, true);
  assert.ok(exposedAir.hot > protectedAir.hot);
  assert.deepEqual(sampleCindercoilAtmosphere(track, exposedState), exposedAir);
});
test('low bounds particle counts and reduced motion removes ash, embers and shimmer', () => {
  const field = createCindercoilAtmosphere(track, new T.Vector3(0, 0, 0));
  const frame = {
    time: 3.4,
    state: { time: 3.4, distance: track.jumps[0].takeoff - 50, lateral: 0 },
  };
  field.update({ ...frame, settings: { quality: 'high' } });
  assert.ok(field.group.children.every((n) => n.visible));
  field.update({ ...frame, settings: { quality: 'low' } });
  assert.equal(field.group.children[0].geometry.drawRange.count, 180);
  assert.equal(field.group.children[1].geometry.drawRange.count, 28);
  assert.equal(field.group.children[2].visible, false);
  field.update({
    ...frame,
    settings: { quality: 'high', reducedMotion: true },
  });
  assert.ok(field.group.children.slice(0, 3).every((n) => !n.visible));
  for (const node of field.group.children) {
    node.geometry.dispose();
    node.material.dispose();
  }
});
