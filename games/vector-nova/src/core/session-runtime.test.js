import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSession } from './session-runtime.js';

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
