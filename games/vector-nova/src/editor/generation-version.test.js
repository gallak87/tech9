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

test('current circuit generation retains the existing layout while recording its explicit version', () => {
  const old = generateDocument({ ...options, generatorVersion: 3 });
  const current = generateDocument(options);
  assert.equal(current.generator.version, GENERATOR_VERSION);
  assert.equal(current.generator.version, 4);
  assert.deepEqual(current.points, old.points);
  assert.deepEqual(current.jumps, old.jumps);
});
