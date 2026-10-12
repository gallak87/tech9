import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLevel3Track } from '../track/model.js';
import {
  createNacreMarineWeather,
  nacreSupportSprayAnchors,
  sampleNacreWeather,
} from './marine-weather.js';

const track = createLevel3Track();
const sites = [
  { kind: 'basalt-spire', x: 250, z: 400, radius: 65, maxY: 100 },
  { kind: 'basalt-spire', x: 500, z: 300, radius: 35, maxY: -20 },
  { kind: 'tide-observatory', x: 100, z: 100, radius: 130, maxY: 300 },
];
const release = (weather) => {
  weather.group.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
};

test('marine weather freezes in simulation time, scales density and clears underwater/overview', () => {
  const weather = createNacreMarineWeather(track, sites);
  const camera = new Vector3(20, 75, 50);
  try {
    weather.update(camera, 12.3);
    const live = weather.getPresentation();
    assert.equal(live.time, 12.3);
    assert.equal(live.strength, 1);
    assert.equal(live.mistSites, 2);
    assert.ok(live.rainQuads > 0 && live.sprayQuads > 0);
    for (let n = 0; n < 5; n++) weather.update(camera, 12.3);
    assert.deepEqual(weather.getPresentation(), live);
    weather.update(camera, 12.3, { quality: 'low' });
    const low = weather.getPresentation();
    assert.ok(low.rainQuads < live.rainQuads);
    assert.equal(low.mistQuads, live.mistSites);
    assert.equal(low.supportSites, live.supportSites);
    weather.update(camera, 12.3, { reducedMotion: true });
    const reduced = weather.getPresentation();
    assert.equal(reduced.time, 0);
    assert.equal(reduced.rainQuads, 0);
    assert.equal(reduced.sprayQuads, 0);
    assert.ok(reduced.mistQuads > 0);
    weather.update(camera, 12.3, { overview: true });
    assert.equal(weather.getPresentation().visible, false);
    camera.y = -20;
    weather.update(camera, 13);
    assert.equal(weather.getPresentation().strength, 0);
    assert.equal(weather.getPresentation().rainQuads, 0);
    assert.equal(weather.getPresentation().sprayQuads, 0);
    assert.equal(weather.getPresentation().mistQuads, 0);
    assert.ok(
      weather.group.children.every(
        (mesh) => mesh.userData.nacreReflectionExclude,
      ),
    );
    weather.clear();
    assert.equal(weather.getPresentation().visible, false);
  } finally {
    release(weather);
  }
});

test('support spindrift belongs to exposed physical stems and never a jump opening', () => {
  const anchors = nacreSupportSprayAnchors(track);
  assert.ok(anchors.length > 12);
  for (const anchor of anchors) {
    assert.ok(Math.abs(anchor.position.y - track.waterY) < 1e-8);
    assert.ok(anchor.deckY > track.waterY + 24);
    assert.equal(track.isGap(anchor.distance), false);
    assert.ok(
      track.jumps.every(
        (jump) =>
          anchor.distance <= jump.takeoff - 7 ||
          anchor.distance >= jump.landingStart + 7,
      ),
    );
  }
  const shifted = { ...track, waterY: 10 };
  for (const anchor of nacreSupportSprayAnchors(shifted))
    assert.ok(Math.abs(anchor.position.y - shifted.waterY) < 1e-8);
  let previous = 0;
  for (let y = -10; y < 40; y += 0.05) {
    const strength = sampleNacreWeather(y);
    assert.ok(strength >= previous && strength - previous < 0.005);
    previous = strength;
  }
  assert.equal(sampleNacreWeather(2), 0);
  assert.equal(sampleNacreWeather(25), 1);
});
