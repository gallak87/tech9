import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSession, stageSessionCountdown } from './session-runtime.js';

test('ordinary levels have no countdown simulation side effects', () => {
  const state = Object.freeze({ time: 0, distance: 0, energy: 100 });
  stageSessionCountdown(
    {
      state,
      runtime: {
        advance() {
          throw new Error('Unexpected simulation');
        },
      },
      racers: {
        opponents: [
          {
            runtime: {
              stageCountdown() {
                throw new Error('An unrelated level must not stage its field');
              },
            },
          },
        ],
      },
    },
    -2,
  );
  assert.deepEqual(state, { time: 0, distance: 0, energy: 100 });
});

test('an opted-in countdown stages every locked grid pose without advancing the race', () => {
  const player = Object.freeze({ time: 0, distance: 0 });
  const rival = Object.freeze({ time: 0, distance: -12 });
  const calls = [];
  const runtime = {
    stageCountdown: (state, phase) => calls.push([state, phase]),
  };
  stageSessionCountdown(
    {
      state: player,
      runtime,
      racers: { opponents: [{ state: rival, runtime }] },
    },
    -1.25,
  );
  assert.deepEqual(calls, [
    [player, -1.25],
    [rival, -1.25],
  ]);
});

for (const staged of [false, true]) {
  test(`race completion reaches presentation after lap timing (${staged ? 'shared dynamics' : 'magnetic'})`, () => {
    const event = (type) => ({ type, payload: {} });
    const motionEvents = [event('impact')];
    const lapEvents = [event('lap')];
    const finishEvents = [
      event('player-race-complete'),
      event('racer-complete'),
    ];
    const received = [];
    const state = { distance: 0 };
    const motion = () => {
      state.distance = 5;
      return motionEvents;
    };
    const runtime = staged
      ? { beginAdvance() {}, finishAdvance: motion }
      : { advance: motion };
    runtime.pose = () => ({ grounded: true });
    const racers = staged
      ? { enabled: true, beginAdvance() {}, finishAdvance: () => finishEvents }
      : { advance: () => finishEvents };
    const result = advanceSession({
      state,
      input: {},
      dt: 1 / 120,
      runtime,
      racers,
      dynamics: staged ? { step() {} } : null,
      race: {
        runoutControl: (_state, input) => input,
        step: (before, after) => {
          assert.equal(before, 0);
          assert.equal(after, 5);
          return lapEvents;
        },
      },
      emit: (e) => received.push(e),
    });
    assert.deepEqual(received, [
      ...motionEvents,
      ...lapEvents,
      ...finishEvents,
    ]);
    assert.deepEqual(
      result,
      motionEvents,
      'return contract remains motion events',
    );
  });
}

for (const shared of [false, true]) {
  test(`hidden session steps propagate silence and drain player feedback (${shared ? 'shared dynamics' : 'magnetic'})`, () => {
    const state = { distance: 0 };
    const calls = [];
    const advance = () => {
      state.distance++;
      return [];
    };
    const runtime = {
      ...(shared ? { beginAdvance() {}, finishAdvance: advance } : { advance }),
      pose: () => ({ grounded: true }),
      update: (context) => calls.push(['player', context]),
    };
    const racers = shared
      ? {
          enabled: true,
          beginAdvance: (_dt, context) =>
            calls.push(['field', context.presentation]),
          finishAdvance: () => [],
        }
      : {
          advance: (_dt, context) => {
            calls.push(['field', context.presentation]);
            return [];
          },
        };
    const session = {
      state,
      runtime,
      racers,
      input: {},
      dt: 1 / 60,
      dynamics: shared ? { step() {} } : null,
      race: { runoutControl: (_state, input) => input, step: () => [] },
      emit() {},
    };
    advanceSession({ ...session, presentation: false });
    assert.deepEqual(
      calls,
      Array.from({ length: shared ? 2 : 1 }, () => [
        ['field', false],
        ['player', { presentation: false }],
      ]).flat(),
    );
    calls.length = 0;
    advanceSession(session);
    assert.deepEqual(
      calls,
      Array.from({ length: shared ? 2 : 1 }, () => ['field', undefined]),
      'ordinary session does not add an extra player presentation update',
    );
  });
}
