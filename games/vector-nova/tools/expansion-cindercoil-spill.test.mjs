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
    for (const lateral of [0, -12]) {
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

test('wide deck lava is a visible surface with matching contact instead of a thin painted line', () => {
  const frame = track.sample((zone.start + zone.end) / 2);
  const { flow, bed } = createSpillGeometry(
    track,
    zone,
    createCalderaHeight(track),
  );
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const mesh = new T.Mesh(flow, material);
  mesh.updateMatrixWorld(true);
  for (const lateral of [-8, 0, 8]) {
    const ray = new T.Raycaster(
      frame.position
        .clone()
        .addScaledVector(frame.right, lateral)
        .addScaledVector(frame.up, 5),
      frame.up.clone().negate(),
      0,
      8,
    );
    assert.ok(
      ray.intersectObject(mesh).length > 0,
      `wide molten surface missing at lateral ${lateral}`,
    );
  }
  const dry = new T.Raycaster(
    frame.position
      .clone()
      .addScaledVector(frame.right, -12)
      .addScaledVector(frame.up, 5),
    frame.up.clone().negate(),
    0,
    8,
  );
  assert.equal(dry.intersectObject(mesh).length, 0);
  flow.dispose();
  bed.dispose();
  material.dispose();
});

test('contact smoke and glow reproduce the clock, freeze in reduced motion and release every resource once', () => {
  const cues = createCindercoilCues(track);
  const smoke = cues.group.getObjectByName(
    'Cindercoil / lava contact smoke plumes',
  );
  const glow = cues.group.getObjectByName('Cindercoil / lava glow on ceramic');
  assert.ok(smoke?.isInstancedMesh && glow?.isMesh);
  cues.update({ time: 3.2, settings: { quality: 'high' } });
  assert.equal(smoke.count, 48);
  const first = Array.from(smoke.instanceMatrix.array);
  const pulse = glow.material.uniforms.spillPulse.value;
  cues.update({ time: 10, settings: { quality: 'high' } });
  assert.notDeepEqual(Array.from(smoke.instanceMatrix.array), first);
  assert.notEqual(glow.material.uniforms.spillPulse.value, pulse);
  cues.update({ time: 3.2, settings: { quality: 'high' } });
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), first);
  assert.equal(glow.material.uniforms.spillPulse.value, pulse);
  cues.update({ time: 7, settings: { quality: 'low', reducedMotion: true } });
  assert.equal(smoke.count, 24);
  const still = Array.from(smoke.instanceMatrix.array);
  cues.update({ time: 25, settings: { quality: 'low', reducedMotion: true } });
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), still);
  assert.equal(glow.material.uniforms.spillPulse.value, 1);
  const resources = new Set();
  cues.group.traverse((node) => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean))
      resources.add(material);
  });
  const disposals = new Map();
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      disposals.set(resource, (disposals.get(resource) ?? 0) + 1),
    );
  cues.dispose();
  cues.dispose();
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
});

test('surge surfaces retain their complete vertex layout from loading through activation', () => {
  const cues = createCindercoilCues(track);
  try {
    const surges = [];
    cues.group.traverse((mesh) => {
      if (
        mesh.isMesh &&
        mesh.geometry.attributes.cinderEdge &&
        !mesh.geometry.attributes.cinderAlong
      )
        surges.push(mesh);
    });
    assert.equal(
      surges.length,
      track.surgeZones.filter((entry) => entry.kind !== 'spill').length,
    );
    const initial = surges.map((mesh) => {
      const { position, normal } = mesh.geometry.attributes;
      assert.ok(
        normal,
        'normals must exist before the initially hidden surge is warmed',
      );
      assert.equal(normal.count, position.count);
      return {
        mesh,
        position,
        normal,
        attributes: Object.keys(mesh.geometry.attributes),
      };
    });
    const activated = new Set();
    for (const time of [0, 2, 4, 6, 10, 13, 17]) {
      cues.update({ time });
      for (const { mesh, position, normal, attributes } of initial) {
        assert.equal(mesh.geometry.attributes.position, position);
        assert.equal(mesh.geometry.attributes.normal, normal);
        assert.deepEqual(Object.keys(mesh.geometry.attributes), attributes);
        assert.ok(Array.from(normal.array).every(Number.isFinite));
        if (mesh.visible) {
          activated.add(mesh);
          assert.ok(normal.array.some((value) => Math.abs(value) > 0.1));
        }
      }
    }
    assert.equal(activated.size, surges.length);
  } finally {
    cues.dispose();
  }
});
