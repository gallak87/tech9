import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_PRESETS, roadPreset, roadPresetOptions } from './road-presets.js';
import { generateDocument, analyzeDocument } from './document.js';

test('starter cards expose frozen road-only metadata and independent preference copies', () => {
  assert.deepEqual(
    ROAD_PRESETS.map((preset) => preset.id),
    ['flowing', 'technical', 'woven', 'big-air'],
  );
  assert(Object.isFrozen(ROAD_PRESETS));
  for (const preset of ROAD_PRESETS) {
    assert(Object.isFrozen(preset));
    assert(Object.isFrozen(preset.options));
    assert(preset.label && preset.description);
    const options = roadPresetOptions(preset.id, {
      courseType: 'circuit',
      length: 3000,
    });
    assert.equal(options.length, 3000);
    assert.equal(options.courseType, 'circuit');
    assert.equal(options.generatorVersion, 3);
    for (const key of [
      'seed',
      'environment',
      'settings',
      'width',
      'points',
      'jumps',
      'pickups',
    ])
      assert.equal(key in options, false, `a starter must not choose ${key}`);
    options.bendiness = 0.123;
    assert.notEqual(roadPresetOptions(preset.id).bendiness, 0.123);
  }
  assert.equal(roadPreset().id, 'flowing');
  assert.equal(roadPreset('woven').circuitOnly, true);
  assert.throws(() => roadPreset('script'), /supported/);
  assert.throws(
    () => roadPresetOptions('woven', { courseType: 'downhill' }),
    /Circuit/,
  );
  assert.throws(
    () => roadPresetOptions('flowing', { courseType: 'freestyle' }),
    /Downhill/,
  );
  assert.throws(() => roadPresetOptions('flowing', { length: NaN }), /finite/);
  assert.equal(roadPresetOptions('flowing', { length: 1800 }).length, 3000);
  assert.equal(roadPresetOptions('flowing', { length: 25000 }).length, 20000);
});

test('all compatible starter profiles generate valid bounded roads while preserving an independent environment', () => {
  const environment = { version: 1, seed: 90210, layoutVersion: 1 };
  const settings = {
    sceneryPreset: 'reclaimed',
    density: 0.9,
    waterLevel: -20,
  };
  for (const preset of ROAD_PRESETS)
    for (const courseType of ['circuit', 'downhill']) {
      if (preset.circuitOnly && courseType !== 'circuit') continue;
      for (const length of [3000, 20000]) {
        const options = roadPresetOptions(preset.id, { courseType, length });
        const document = generateDocument({
          ...options,
          seed: 42,
          environment,
          settings,
        });
        const analysis = analyzeDocument(document);
        assert.equal(
          analysis.valid,
          true,
          `${preset.id}/${courseType}/${length}: ${analysis.errors.join(' ')}`,
        );
        assert(Math.abs(analysis.length - length) < 1);
        assert.equal(document.courseType, courseType);
        assert.deepEqual(document.environment, environment);
        assert.deepEqual(document.settings, settings);
        assert(
          document.jumps.length > 0,
          'starters include real, budgeted jumps',
        );
        if (preset.id === 'woven') assert(document.generator.crossovers > 0);
      }
    }
});
