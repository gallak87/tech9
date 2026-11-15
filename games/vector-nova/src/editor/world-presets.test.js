import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDocument, createDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createEditorEnvironment, createEditorRoad } from './nightweir.js';

test('saved legacy Nightweir presets retain their deterministic assembly mixes, including a populated blank draft', () => {
  const results = {};
  for (const sceneryPreset of ['waterfront', 'industrial', 'reclaimed']) {
    const doc = generateDocument({
      seed: 7,
      length: 1800,
      seedJumps: false,
      sceneryPreset,
      density: 0.85,
      environment: { version: 1, seed: 7, layoutVersion: 3 },
    });
    const track = createEditorTrack(doc),
      a = createEditorEnvironment(doc, track),
      b = createEditorEnvironment(doc, track);
    try {
      const counts = a.group.userData.assemblyCounts;
      assert.deepEqual(counts, b.group.userData.assemblyCounts);
      assert.ok(Object.values(counts).reduce((sum, n) => sum + n, 0) > 15);
      results[sceneryPreset] = counts;
    } finally {
      a.dispose();
      b.dispose();
    }
  }
  assert.equal(results.industrial.trees, 0);
  assert.ok(
    results.industrial.warehouse + results.industrial.pump >
      results.industrial.building,
  );
  assert.ok(
    results.reclaimed.trees >
      results.reclaimed.building + results.reclaimed.pump,
  );
  assert.ok(results.waterfront.building > results.waterfront.pump);
  const blank = createDocument({
      blank: true,
      environment: { version: 1, seed: 7, layoutVersion: 3 },
    }),
    environment = createEditorEnvironment(blank, null);
  try {
    assert.ok(
      Object.values(environment.group.userData.assemblyCounts).some(
        (n) => n > 0,
      ),
    );
  } finally {
    environment.dispose();
  }
});

test('preview tessellation reduces geometry without changing the physical track or road builder', () => {
  const doc = generateDocument({
      seed: 7,
      length: 3000,
      seedJumps: false,
      density: 0,
    }),
    track = createEditorTrack(doc);
  const physical = createEditorRoad(track),
    preview = createEditorRoad(track, { preview: true });
  try {
    const physicalDeck = physical.group.children.find(
      (mesh) => mesh.userData.roadSurface,
    ).geometry;
    const previewDeck = preview.group.children.find(
      (mesh) => mesh.userData.roadSurface,
    ).geometry;
    assert.ok(
      previewDeck.attributes.position.count <
        physicalDeck.attributes.position.count / 2,
    );
    assert.equal(track.length, createEditorTrack(doc).length);
  } finally {
    physical.dispose();
    preview.dispose();
  }
});
