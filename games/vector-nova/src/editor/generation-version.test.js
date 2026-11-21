import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generateDocument,
  generateDocumentAsync,
  validateDocument,
  GENERATOR_VERSION,
} from './document.js';

const options = {
  seed: 42,
  length: 5000,
  bendiness: 0.7,
  elevation: 0.9,
  jumpFrequency: 'few',
  jumpSize: 'small',
};

test('explicit v3 dispatch preserves historical circuit and downhill geometry after the current version advances', async () => {
  for (const [courseType, fingerprint] of [
    [
      'circuit',
      '7807eb8780f39852227bb952194f12b15cef36d253725dfbd6a8789a23206f49',
    ],
    [
      'downhill',
      '6552464dc932885f62c99d2fbf721a5c263565265baaf2b5e8c6d481cef6f497',
    ],
  ]) {
    const input = { ...options, courseType, generatorVersion: 3 };
    const document = generateDocument(input);
    const geometry = JSON.stringify(
      { points: document.points, jumps: document.jumps },
      (_, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
    );
    assert.equal(
      createHash('sha256').update(geometry).digest('hex'),
      fingerprint,
    );
    assert.equal(document.generator.version, 3);
    assert.equal(document.generator.jumpFrequency, 'few');
    assert.deepEqual(
      validateDocument(JSON.parse(JSON.stringify(document))),
      document,
    );
    assert.deepEqual(
      await generateDocumentAsync(input, { yieldControl: async () => {} }),
      document,
    );
  }
});

test('explicit v4 reproduces its released circuit and downhill geometry', () => {
  const circuit = generateDocument({ ...options, generatorVersion: 4 });
  const v3 = generateDocument({ ...options, generatorVersion: 3 });
  assert.equal(circuit.generator.version, 4);
  assert.deepEqual(circuit.points, v3.points);
  assert.deepEqual(circuit.jumps, v3.jumps);
  const downhill = generateDocument({
    ...options,
    courseType: 'downhill',
    generatorVersion: 4,
  });
  const geometry = JSON.stringify(
    { points: downhill.points, jumps: downhill.jumps },
    (_, value) =>
      typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
  );
  assert.equal(
    createHash('sha256').update(geometry).digest('hex'),
    '6a8780110b49da3a73070edc3e4978a4ca74520b10201f814b5d68bba3bc0e44',
  );
});

test('explicit v5 replays the released woven circuit and mountain descent', () => {
  for (const [courseType, crossovers, fingerprint] of [
    [
      'circuit',
      1,
      '2d7dda68ea0964f9dee64f5926bb64c95e8e9a6900936e2e8d193a53de1f7d8a',
    ],
    [
      'downhill',
      0,
      '52e6f2cbb8574c8d0a9252622c07eac68a9d0ff50e2c8496a0acc44e0b1dc259',
    ],
  ]) {
    const input = {
      ...options,
      courseType,
      crossovers,
      generatorVersion: 5,
      width: 40,
      length: 7500,
      bendiness: 0.86,
      elevation: 0.9,
      jumpSize: 'mixed',
    };
    const document = generateDocument(input);
    const geometry = JSON.stringify(
      { points: document.points, jumps: document.jumps },
      (_, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
    );
    assert.equal(
      createHash('sha256').update(geometry).digest('hex'),
      fingerprint,
    );
    assert.deepEqual(
      generateDocument({ ...input, rhythm: 1, banking: 0 }),
      document,
    );
  }
});

test('new courses record the v6 geometry pipeline and agree with async generation', async () => {
  const current = generateDocument(options);
  assert.equal(current.generator.version, GENERATOR_VERSION);
  assert.equal(current.generator.version, 6);
  assert.deepEqual(
    current,
    await generateDocumentAsync(options, { yieldControl: async () => {} }),
  );
});
