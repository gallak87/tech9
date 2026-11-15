import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createEditorWorld, createEditorRoad } from './nightweir.js';
import { createRegionPlan } from './region-plan.js';
import { districtCourtFaces } from './region-environment.js';
import { equalGeometry } from './geometry-reuse.js';
import { applyBiomeSpan } from './biome-spans.js';
import { editorBiome } from './biomes.js';

function document(length = 3000) {
  const value = generateDocument({ seed: 42, length, jumpFrequency: 'none' });
  value.environment = { version: 1, seed: 7001, layoutVersion: 2 };
  return value;
}
function sameWorld(actual, expected) {
  const meshes = (world) => {
    const result = [];
    world.group.traverse((mesh) => {
      if (mesh.isMesh) result.push(mesh);
    });
    return result;
  };
  const a = meshes(actual),
    b = meshes(expected);
  assert.equal(a.length, b.length);
  a.forEach((mesh, i) => {
    assert.equal(mesh.name, b[i].name);
    assert(equalGeometry(mesh.geometry, b[i].geometry), mesh.name);
    assert.deepEqual(mesh.matrix.elements, b[i].matrix.elements);
    if (mesh.instanceMatrix)
      assert.deepEqual(
        mesh.instanceMatrix.array,
        b[i].instanceMatrix.array,
        mesh.name,
      );
  });
}

test('layout2 nearby rebuild matches a fresh world exactly after height, XZ and envelope changes', () => {
  const original = document(20000);
  let world = createEditorWorld(original, { preview: true });
  try {
    for (const [axis, delta] of [
      ['y', 2],
      ['x', 40],
      ['z', 3500],
    ]) {
      const next = structuredClone(original);
      next.points[20][axis] += delta;
      const oldChildren = [...world.group.children];
      const updated = createEditorWorld(next, {
        preview: true,
        previous: world,
      });
      const fresh = createEditorWorld(next, { preview: true });
      assert.deepEqual(
        world.group.children,
        oldChildren,
        'pending replacement never moves source meshes',
      );
      sameWorld(updated, fresh);
      assert(updated.incremental.eligible);
      if (axis === 'y') {
        assert(
          updated.incremental.reusedChunks > updated.incremental.rebuiltChunks,
        );
        assert(updated.incremental.reusedInstances > 1000);
      }
      world.dispose();
      world = updated;
      fresh.dispose();
    }
  } finally {
    world.dispose();
  }
});

test('environment seed changes and legacy plans use a full independent owner', () => {
  const doc = document(),
    first = createEditorWorld(doc, { preview: true });
  const changed = structuredClone(doc);
  changed.environment.seed++;
  const second = createEditorWorld(changed, { preview: true, previous: first });
  assert.equal(second.incremental.eligible, false);
  assert.equal(second.incremental.reusedChunks, 0);
  const legacy = structuredClone(doc);
  legacy.environment.layoutVersion = 1;
  const old = createEditorWorld(legacy, { preview: true, previous: first });
  assert.equal(old.incremental.eligible, false);
  assert.equal(old.incremental.reusedChunks, 0);
  assert.equal(old.track.editorRegionPlan.version, 1);
  assert.equal(first.track.editorRegionPlan.version, 2);
  second.dispose();
  first.dispose();
  old.dispose();
});

test('layout2 court edges clip continuously to native terrain triangles and the waterline', () => {
  const doc = document(),
    track = createEditorTrack(doc),
    plan = createRegionPlan(doc, track);
  const basin = plan.basins[0];
  const courts = [
    ...plan.districts,
    { x: basin.x + basin.radiusX, z: basin.z, yaw: 0, radius: 300 },
  ];
  let vertices = 0;
  for (const court of courts)
    for (const face of districtCourtFaces(plan, court)) {
      assert(face.length >= 3);
      for (const point of face) {
        assert(
          Math.abs(point.y - plan.surfaceHeight(point.x, point.z)) < 0.00001,
        );
        assert(point.y >= point.water + 1 - 1e-7);
        assert(
          Math.hypot(point.x - court.x, point.z - court.z) <=
            court.radius * 0.86 + 1e-7,
        );
        vertices++;
      }
    }
  assert(vertices > 100);
});

test('both Nightweir/Vesper surface directions retain continuous decks, passive joins and borrowed reflections', async () => {
  for (const [base, section] of [
    ['nightweir', 'vesper-forest'],
    ['vesper-forest', 'nightweir'],
  ]) {
    const source = document(5000),
      preset = editorBiome(base).presets[0];
    source.biome = base;
    source.settings = {
      sceneryPreset: preset.id,
      density: preset.density,
      waterLevel: preset.waterLevel,
    };
    const painted = applyBiomeSpan(source, {
      startIndex: 2,
      endIndex: 8,
      biome: section,
    });
    const track = createEditorTrack(painted),
      solids = [];
    const road = createEditorRoad(track, {
      collectSolid: (solid) => solids.push(solid),
    });
    const reflection = new T.Texture();
    let reflectionDisposals = 0;
    reflection.addEventListener('dispose', () => reflectionDisposals++);
    try {
      await road.ready;
      road.setReflection(reflection);
      const decks = solids.filter((solid) => solid.kind === 'deck');
      assert.equal(decks.length, 3);
      assert.equal(decks[0].start, 0);
      assert.equal(decks.at(-1).end, track.length);
      for (let i = 1; i < decks.length; i++)
        assert.equal(decks[i - 1].end, decks[i].start);
      assert(
        decks.some((solid) =>
          solid.name.startsWith(editorBiome(section).label),
        ),
      );
      const meshes = road.group.children.filter((mesh) =>
        /section driving deck/.test(mesh.name),
      );
      assert.equal(meshes.length, 3);
      for (const mesh of meshes) assert.equal(mesh.material.envMap, reflection);
      assert.equal(
        road.group.children.filter(
          (mesh) => mesh.name === 'Road surface biome join',
        ).length,
        2,
      );
      assert(!solids.some((solid) => solid.name === 'Road surface biome join'));
      assert.deepEqual(painted.environment, source.environment);
    } finally {
      road.dispose();
      assert.equal(
        reflectionDisposals,
        0,
        'the sky reflection remains borrowed',
      );
      reflection.dispose();
    }
  }
});
