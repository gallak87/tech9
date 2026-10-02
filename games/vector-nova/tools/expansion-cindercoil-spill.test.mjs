import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
import {
  createSpillGeometry,
  spillAnchors,
  spillRoadIntervals,
  spillOpenings,
} from '../src/levels/cindercoil/spill.js';
import { createCalderaHeight } from '../src/levels/cindercoil/environment/geometry.js';
import { createCindercoilCues } from '../src/levels/cindercoil/cues.js';
import { createCindercoilRuntime } from '../src/levels/cindercoil/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
const track = createCindercoilTrack(),
  zone = track.surgeZones[1];

test('spill descends from the crater through both road edges into a terrain receiving pool', () => {
  const anchors = spillAnchors(track, zone),
    heightAt = createCalderaHeight(track);
  assert.ok(anchors.entry.position.y > anchors.exit.position.y);
  const geometry = createSpillGeometry(track, zone, heightAt);
  assert.ok(geometry.source.y > anchors.entry.position.y + 25);
  assert.ok(
    Math.abs(
      geometry.outfall.y -
        heightAt(geometry.outfall.x, geometry.outfall.z) -
        0.7,
    ) < 1e-7,
  );
  const bounds = new T.Box3().setFromBufferAttribute(
    geometry.flow.attributes.position,
  );
  assert.ok(bounds.max.y > anchors.entry.position.y + 20);
  assert.ok(bounds.min.y < anchors.exit.position.y - 30);
  for (const value of geometry.flow.attributes.position.array)
    assert.ok(Number.isFinite(value));
  for (const side of [-1, 1]) {
    const gaps = spillOpenings(track, side);
    assert.equal(gaps.length, 1);
    for (const segment of spillRoadIntervals(track, side, 0, track.length))
      assert.ok(segment.end <= gaps[0].start || segment.start >= gaps[0].end);
  }
  geometry.flow.dispose();
  geometry.bed.dispose();
});

test('continuous cue retains geometry in every phase, freezes advection and disposes once', () => {
  const cues = createCindercoilCues(track);
  const mesh = cues.group.getObjectByName(
    'Cindercoil / continuous diagonal crater spill',
  );
  assert.ok(mesh);
  const original = Array.from(mesh.geometry.attributes.position.array);
  for (const time of [0, 2, 4, 8, 29]) {
    cues.update({ time });
    assert.equal(mesh.visible, true);
    assert.deepEqual(
      Array.from(mesh.geometry.attributes.position.array),
      original,
    );
  }
  const shader = {
    uniforms: {},
    vertexShader: `#include <common>
#include <begin_vertex>`,
    fragmentShader: `#include <common>
#include <color_fragment>
#include <emissivemap_fragment>`,
  };
  mesh.material.onBeforeCompile(shader);
  cues.update({ time: 7, settings: { reducedMotion: true } });
  assert.equal(shader.uniforms.cinderFlowTime.value, 0);
  let disposed = 0;
  mesh.geometry.addEventListener('dispose', () => disposed++);
  cues.dispose();
  cues.dispose();
  assert.equal(disposed, 1);
});

test('permanent flow contact costs reserve while the dry shoulder keeps baseline response', () => {
  for (const time of [0, 4, 9]) {
    const results = [];
    for (const lateral of [0, -8.5]) {
      const runtime = createCindercoilRuntime({ track });
      const state = {
        ...createVehicleState(),
        distance: (zone.start + zone.end) / 2,
        time,
        speed: 60,
        lateral,
      };
      for (let i = 0; i < 30; i++) runtime.advance(state, {}, 1 / 120);
      results.push({ state, contact: runtime.snapshot().contactSeconds });
      runtime.dispose();
    }
    assert.ok(results[0].contact > 0.2);
    assert.equal(results[1].contact, 0);
    assert.ok(results[0].state.energy < results[1].state.energy);
    assert.ok(results[0].state.speed < results[1].state.speed);
  }
});
