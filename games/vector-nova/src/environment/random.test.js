import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createLcgRandom } from './random.js';
import { randomSequence } from '../levels/saffron/environment/geometry.js';
import { randomSource } from '../levels/oriel/environment/habitat.js';

function streamHash(random) {
  const bytes = Buffer.alloc(4096 * 8);
  for (let i = 0; i < 4096; i++) bytes.writeDoubleLE(random(), i * 8);
  return createHash('sha256').update(bytes).digest('hex');
}

// Existing streams captured from 41e521e67, including every affected factory seed.
const streams = new Map([
  [0, 'e4c54fc5907be4e2dd905cb1a441f1e1ed61540b6949765757574a6e4d6f3cfb'],
  [1, 'a10a2070a7af4c3319dd12b9d0d18c9ef60c10fe8942fec6adab41ab418df1b0'],
  [
    0x5aff204,
    'c5edd0472cb2a08d92eeec8e7bf2bd943d35153896e73c282b68643d8a192e35',
  ],
  [
    0x5aff32,
    'ab51d81fee77c43b7a514a74bd079907796e6ba0b3ba75c92c0ab8c4225e03a4',
  ],
  [0x34ad, 'c2adbda43ccb32d05084807956bfed27a1976dea5c06daeffd51abe9f2aaa354'],
  [61037, '5c126543a93d659c8fc14ded6fba78d75d9c3e2b86b2fbba20743cec9daeee44'],
  [83104, 'a6477159eabba20b490089fa11127e0dafd0a2f98f367859195456dcaadaeff3'],
  [41917, '0d34da8a98bb54b1d531c5a070ccf91b13bbb7ae509d94cdf7811fbdef04e626'],
  [89347, 'd720b4904e024a3fdccc65f33f1af7b789aabe742c9be81d3e7f07b01253ac89'],
]);

test('LCG draws retain the exact existing level streams', () => {
  for (const [seed, expected] of streams)
    assert.equal(streamHash(createLcgRandom(seed)), expected, `seed ${seed}`);
});

test('the public Saffron and Oriel wrappers retain their default seeds', () => {
  assert.equal(streamHash(randomSequence()), streams.get(0x5aff204));
  assert.equal(streamHash(randomSource()), streams.get(61037));
  assert.equal(streamHash(randomSequence(undefined)), streams.get(0x5aff204));
  assert.equal(streamHash(randomSource(undefined)), streams.get(61037));
});

test('LCG seed coercion remains lazy and uses the first draw value', () => {
  for (const seed of [undefined, null, NaN, Infinity, -Infinity, 0.9, -0])
    assert.equal(createLcgRandom(seed)() * 4294967296, 1013904223);
  for (const seed of [1.9, '1', true, 4294967297])
    assert.equal(createLcgRandom(seed)() * 4294967296, 1015568748);
  assert.equal(createLcgRandom(-1.9)() * 4294967296, 1012239698);

  let reads = 0,
    value = 0;
  const random = createLcgRandom({
    valueOf() {
      reads++;
      return value;
    },
  });
  assert.equal(reads, 0);
  value = 1;
  assert.equal(random() * 4294967296, 1015568748);
  value = 19;
  assert.equal(random() * 4294967296, 1586005467);
  assert.equal(reads, 1);
});

test('invalid numeric seed coercion fails on drawing without advancing the stream', () => {
  for (const seed of [1n, Symbol('seed')]) {
    const random = createLcgRandom(seed);
    assert.throws(random, TypeError);
  }
  let fail = true;
  const random = createLcgRandom({
    valueOf() {
      if (fail) throw new Error('seed unavailable');
      return 1;
    },
  });
  assert.throws(random, /seed unavailable/);
  fail = false;
  assert.equal(random() * 4294967296, 1015568748);
});

test('interleaved LCG closures keep independent state', () => {
  const random = { a: createLcgRandom(7), b: createLcgRandom(19) };
  const output = { a: [], b: [] };
  for (const id of ['a', 'b', 'b', 'a', 'a', 'b', 'a', 'b', 'b', 'a', 'a', 'b'])
    output[id].push(random[id]() * 4294967296);
  assert.deepEqual(
    output.a,
    [1025555898, 3923423697, 2630631676, 3981355051, 211918734, 3675562389],
  );
  assert.deepEqual(
    output.b,
    [1045530198, 8325565, 3560488952, 1594196727, 201589738, 3557581377],
  );
});
