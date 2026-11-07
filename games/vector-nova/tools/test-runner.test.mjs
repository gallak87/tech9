import test from 'node:test';
import assert from 'node:assert/strict';
import { FAST_TESTS } from './fast-tests.mjs';
import { discoverTests, selectTests, main } from './test.mjs';

test('test tiers cover the discovered inventory exactly once and new files default to integration', async () => {
  const files = await discoverTests();
  const extra = 'src/future/new-case.test.js';
  const groups = selectTests([...files, extra]);
  const selected = groups.flatMap((group) => group.files);
  assert.equal(new Set(selected).size, files.length + 1);
  assert.deepEqual([...selected].sort(), [...files, extra].sort());
  assert.deepEqual(groups[0].files, [...FAST_TESTS]);
  assert.ok(groups[1].files.includes(extra));
  assert.ok(
    groups[1].files.includes('src/core/cup-classification-session.test.js'),
  );
});

test('test tier selection rejects stale and duplicated fast allowlist entries', () => {
  assert.throws(() => selectTests(['a'], 'all', ['missing']), /missing/);
  assert.throws(() => selectTests(['a'], 'all', ['a', 'a']), /duplicate/);
  assert.throws(() => selectTests([], 'typo', []), /Usage/);
});

test('--list selects without executing tests or factories', async () => {
  const lines = [];
  assert.equal(
    await main(['fast', '--list'], {
      env: {},
      write: (line) => lines.push(line),
      run: () => {
        throw new Error('listing must not run tests');
      },
    }),
    0,
  );
  assert.equal(lines.length, FAST_TESTS.length + 1);
  assert.deepEqual(lines.slice(1), [...FAST_TESTS]);
});

test('all tests continue after a failed tier and preserve failure while bounding concurrency', async () => {
  const calls = [];
  assert.equal(
    await main([], {
      env: {},
      write() {},
      run: async (files, options) => {
        calls.push({ files, concurrency: options.concurrency });
        return calls.length === 1 ? 7 : 0;
      },
    }),
    7,
  );
  assert.deepEqual(
    calls.map((call) => call.concurrency),
    [2, 1],
  );
  assert.equal(
    new Set(calls.flatMap((call) => call.files)).size,
    (await discoverTests()).length,
  );
});

test('integration concurrency override is explicit and rejects invalid values before execution', async () => {
  let limit;
  await main(['integration'], {
    env: { VN_TEST_CONCURRENCY: '2' },
    write() {},
    run: async (_files, options) => {
      limit = options.concurrency;
      return 0;
    },
  });
  assert.equal(limit, 2);
  for (const value of ['0', '-1', '1.5', 'no', 'Infinity'])
    await assert.rejects(
      main(['integration'], {
        env: { VN_TEST_CONCURRENCY: value },
        write() {},
        run: () => {
          throw new Error('invalid configuration must not run tests');
        },
      }),
      /positive safe integer/,
    );
});
