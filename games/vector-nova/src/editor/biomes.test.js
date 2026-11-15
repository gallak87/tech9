import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_BIOMES,
  editorBiome,
  editorWorldPreset,
  isEditorBiome,
} from './biomes.js';

test('asset-free whole-course registry contains exactly the17 active base families and strict preset IDs', () => {
  const expected = [
    'nightweir',
    'halcyon',
    'orbital',
    'nacre',
    'vesper-forest',
    'glasswake',
    'cindercoil',
    'saffron',
    'zephyr',
    'helion',
    'umbra',
    'shatterline',
    'worldspire',
    'colossus',
    'ravel',
    'nomad',
    'oriel',
  ];
  assert.deepEqual(
    EDITOR_BIOMES.map((biome) => biome.id),
    expected,
  );
  assert.equal(new Set(expected).size, 17);
  assert(Object.isFrozen(EDITOR_BIOMES));
  for (const biome of EDITOR_BIOMES) {
    assert.equal(editorBiome(biome.id), biome);
    assert.equal(isEditorBiome(biome.id), true);
    assert(Object.isFrozen(biome.road));
    assert(Object.isFrozen(biome.environment));
    assert.equal(biome.environment.kind, biome.id);
    assert(biome.presets.length >= 2);
    assert.equal(
      new Set(biome.presets.map((preset) => preset.id)).size,
      biome.presets.length,
    );
    for (const preset of biome.presets) {
      assert.equal(editorWorldPreset(biome.id, preset.id), preset);
      assert(preset.density >= 0 && preset.density <= 1);
      assert(preset.waterLevel >= -50 && preset.waterLevel <= -8);
      if (biome.id !== 'nightweir') assert.match(preset.id, /-v1$/);
    }
    for (const key of ['deck', 'structure', 'metal', 'paint', 'edge', 'glow'])
      assert.match(biome.road[key], /^#[0-9a-f]{6}$/i);
    assert.equal(
      biome.road.suspended,
      ['orbital', 'zephyr', 'helion', 'umbra', 'ravel'].includes(biome.id),
    );
  }
  assert.deepEqual(
    editorBiome().presets.map((preset) => preset.id),
    ['waterfront', 'industrial', 'reclaimed'],
  );
  for (const id of [
    'crucible',
    'interceptor',
    'eliminator-nomad',
    'freestyle-ravel',
    '../nacre',
  ]) {
    assert.equal(isEditorBiome(id), false);
    assert.throws(() => editorBiome(id), /supported/);
  }
  assert.throws(() => editorWorldPreset('orbital', 'waterfront'), /preset/);
});
