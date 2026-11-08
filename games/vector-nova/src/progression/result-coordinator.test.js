import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from './careers.js';
import { createProfileStore } from './profile.js';
import { createCupStore, cupChampion } from '../race/cup.js';
import { RACE_OPPONENTS } from '../race/roster.js';
import { createCupCollection } from './cup-collection.js';
import { settleRaceResult, settleTrialRecord } from './result-coordinator.js';

function stores(storage = createMemoryStorage()) {
  return {
    storage,
    profileStore: createProfileStore(() => storage),
    cupStore: createCupStore(() => storage),
    cupCollection: createCupCollection(
      () => storage,
      () => 17,
    ),
  };
}
function result(
  position = 1,
  { mode, valid = true, finished = true, final = true, shipId } = {},
) {
  const ids = RACE_OPPONENTS.map((racer) => racer.id);
  ids.splice(position - 1, 0, 'player');
  return {
    mode,
    final,
    shipId,
    playerValid: valid,
    standings: ids.map((id, index) => ({
      id,
      position: index + 1,
      totalTime: 100 + index,
      valid: id !== 'player' || valid,
      finished: id !== 'player' || finished,
    })),
  };
}
const raceContext = (attemptId, extra = {}) => ({
  sessionIntent: 'race',
  attemptId,
  getShipId: () => 'bastion',
  ...extra,
});
const cupContext = {
  sessionIntent: 'cup',
  sessionCup: true,
  getShipId: () => 'bastion',
};
function freestyleResult(medal = 'Gold', extra = {}) {
  const landed = medal === 'Complete' ? 0 : medal === 'Bronze' ? 2 : 5;
  return {
    mode: 'freestyle',
    playerValid: true,
    medal,
    landed,
    legs: Array.from({ length: 5 }, (_, index) => ({
      id: `transfer-${index + 1}`,
      landed: index < landed,
    })),
    ...extra,
  };
}
const freestyleContext = (attemptId, extra = {}) =>
  raceContext(attemptId, { sessionIntent: 'freestyle', ...extra });
function prepareFinal(s) {
  s.cupStore.start('horizon', 'bastion', 'hard');
  for (let event = 0; event < 2; event++) {
    const state = s.cupStore.snapshot().state;
    s.cupStore.finish(result(1, { mode: 'cup' }));
    s.profileStore.recordRace({ id: `${state.runId}:${event}`, position: 1 });
    s.cupStore.next();
  }
  return s.cupStore.snapshot().state;
}
function nearComplete(s, { missingCup = null, missingTrial = null } = {}) {
  for (let i = 0; i < 24; i++)
    s.profileStore.recordRace({ id: `earned-${i}`, position: 1 });
  for (const id of ['founders', 'frontier', 'horizon', 'apex'])
    if (id !== missingCup) s.profileStore.recordCup(id);
  for (const id of ['halcyon', 'orbital'])
    if (id !== missingTrial) s.profileStore.recordTrial(id, true);
}

test('valid race finishes award progression once per attempt and best-score improvements retain their delta', () => {
  const s = stores();
  const first = settleRaceResult(s, result(4), raceContext('attempt'));
  assert.deepEqual(
    first.rewards.map((reward) => reward.id),
    ['speed-1'],
  );
  assert.equal(first.completionEligible, false);
  assert.equal(first.celebration, null);
  assert.equal(s.profileStore.snapshot().state.points, 2);
  assert.deepEqual(
    settleRaceResult(s, result(4), raceContext('attempt')).rewards,
    [],
  );
  settleRaceResult(s, result(1), raceContext('attempt'));
  assert.equal(s.profileStore.snapshot().state.points, 5);
  assert.equal(s.profileStore.snapshot().state.finishes, 1);
  assert.equal(s.profileStore.snapshot().state.wins, 1);
  settleRaceResult(s, result(1), raceContext('another-attempt'));
  assert.equal(s.profileStore.snapshot().state.points, 10);
  assert.equal(s.profileStore.snapshot().state.finishes, 2);
});

for (const [medal, points] of [
  ['Gold', 5],
  ['Silver', 4],
  ['Bronze', 3],
  ['Complete', 1],
]) {
  test(`a full ${medal} Freestyle finish earns ${points} ordinary race progress without adding rewards`, () => {
    const s = stores();
    const data = freestyleResult(medal);
    const context = freestyleContext('freestyle-attempt');
    const first = settleRaceResult(s, data, context);
    assert.equal(first.completionEligible, true);
    assert.equal(first.celebration, null);
    assert.equal(s.profileStore.snapshot().state.points, points);
    assert.equal(s.profileStore.snapshot().state.finishes, 1);
    assert.deepEqual(
      first.rewards.map((reward) => reward.id),
      ['speed-1'],
    );
    const earned = s.profileStore.snapshot().state;
    assert.deepEqual(settleRaceResult(s, data, context).rewards, []);
    assert.deepEqual(s.profileStore.snapshot().state, earned);
  });
}

test('Freestyle settlement rejects invalid, incomplete, inconsistent, reordered and practice runs', () => {
  const s = stores();
  const before = s.profileStore.snapshot().state;
  const good = freestyleResult();
  const incomplete = good.legs.slice(0, 4);
  const missed = good.legs.map((leg, index) => ({
    ...leg,
    landed: index !== 2,
  }));
  const reordered = [good.legs[1], good.legs[0], ...good.legs.slice(2)];
  for (const [data, sessionIntent] of [
    [freestyleResult('Gold', { playerValid: false }), 'freestyle'],
    [freestyleResult('Gold', { landed: 4 }), 'freestyle'],
    [freestyleResult('Gold', { legs: incomplete }), 'freestyle'],
    [freestyleResult('Gold', { legs: missed }), 'freestyle'],
    [freestyleResult('Gold', { legs: reordered }), 'freestyle'],
    [freestyleResult('Gold', { legs: [] }), 'freestyle'],
    [freestyleResult('Complete', { legs: Array(5) }), 'freestyle'],
    [freestyleResult('Unknown'), 'freestyle'],
    [good, 'practice'],
  ]) {
    const outcome = settleRaceResult(
      s,
      data,
      freestyleContext('invalid-freestyle', {
        sessionIntent,
        getShipId() {
          throw new Error('invalid Freestyle must not inspect runtime');
        },
      }),
    );
    assert.deepEqual(outcome, {
      rewards: [],
      celebration: null,
      completionEligible: false,
    });
  }
  assert.deepEqual(s.profileStore.snapshot().state, before);
});

test('a valid Freestyle finish can earn the final existing reward and queue the career finale once', () => {
  const s = stores();
  for (let i = 0; i < 22; i++)
    s.profileStore.recordRace({ id: `earned-${i}`, position: 1 });
  for (let i = 0; i < 2; i++)
    s.profileStore.recordRace({ id: `silver-${i}`, position: 2 });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    s.profileStore.recordCup(cup);
  for (const track of ['halcyon', 'orbital'])
    s.profileStore.recordTrial(track, true);
  assert.equal(s.profileStore.snapshot().state.points, 118);
  assert.equal(s.profileStore.snapshot().state.claims.length, 27);
  const data = freestyleResult('Bronze', { shipId: 'needle' });
  const context = freestyleContext('final-freestyle');
  const outcome = settleRaceResult(s, data, context);
  assert.deepEqual(
    outcome.rewards.map((reward) => reward.id),
    ['toughness-3'],
  );
  assert.equal(outcome.completionEligible, true);
  const profile = s.profileStore.snapshot().state;
  assert.equal(profile.claims.length, 28);
  assert.deepEqual(profile.completion, {
    shipId: 'needle',
    acknowledged: false,
  });
  assert.deepEqual(settleRaceResult(s, data, context).rewards, []);
  assert.deepEqual(s.profileStore.snapshot().state, profile);
});

for (const [mode, position, won] of [
  ['interceptor', 1, true],
  ['interceptor', 10, false],
  ['eliminator', 1, true],
  ['eliminator', 10, false],
]) {
  test(`a valid ${won ? 'won' : 'lost'} ${mode} result can earn the 28th reward and queue the finale`, () => {
    const s = stores();
    for (let i = 0; i < 23; i++)
      s.profileStore.recordRace({ id: `earned-${i}`, position: 1 });
    s.profileStore.recordRace({ id: 'silver', position: 2 });
    for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
      s.profileStore.recordCup(cup);
    for (const track of ['halcyon', 'orbital'])
      s.profileStore.recordTrial(track, true);
    assert.equal(s.profileStore.snapshot().state.points, 119);
    assert.equal(s.profileStore.snapshot().state.claims.length, 27);
    const data =
      mode === 'interceptor'
        ? { mode, won, playerValid: true, shipId: 'needle' }
        : result(position, { mode, shipId: 'needle' });
    const context = raceContext(`final-${mode}`, { sessionIntent: mode });
    const outcome = settleRaceResult(s, data, context);
    assert.deepEqual(
      outcome.rewards.map((reward) => reward.id),
      ['toughness-3'],
    );
    assert.equal(outcome.completionEligible, true);
    const profile = s.profileStore.snapshot().state;
    assert.equal(profile.claims.length, 28);
    assert.deepEqual(profile.completion, {
      shipId: 'needle',
      acknowledged: false,
    });
    const repeated = settleRaceResult(s, data, context);
    assert.equal(repeated.completionEligible, true);
    assert.deepEqual(repeated.rewards, []);
    assert.deepEqual(s.profileStore.snapshot().state, profile);
    assert.deepEqual(stores(s.storage).profileStore.snapshot().state, profile);
  });
}

test('invalid or unclassified event results cannot queue the finale or inspect the retained ship', () => {
  const s = stores();
  nearComplete(s);
  const before = s.profileStore.snapshot().state;
  const unclassified = result(10, { mode: 'eliminator' });
  unclassified.standings.find((row) => row.id === 'player').position = 0;
  const invalidPlayer = result(10, { mode: 'eliminator' });
  invalidPlayer.standings.find((row) => row.id === 'player').valid = false;
  for (const [data, intent] of [
    [{ mode: 'interceptor', won: true, playerValid: false }, 'interceptor'],
    [{ mode: 'interceptor', won: false, playerValid: false }, 'interceptor'],
    [{ mode: 'interceptor', won: true, playerValid: true }, 'practice'],
    [result(10, { mode: 'eliminator', valid: false }), 'eliminator'],
    [result(10, { mode: 'eliminator', finished: false }), 'eliminator'],
    [result(1, { mode: 'eliminator' }), 'practice'],
    [unclassified, 'eliminator'],
    [invalidPlayer, 'eliminator'],
  ]) {
    const outcome = settleRaceResult(
      s,
      data,
      raceContext('invalid-event', {
        sessionIntent: intent,
        getShipId() {
          throw new Error('invalid event must not inspect runtime');
        },
      }),
    );
    assert.deepEqual(outcome, {
      rewards: [],
      celebration: null,
      completionEligible: false,
    });
    assert.deepEqual(s.profileStore.snapshot().state, before);
  }
});

test('invalid, unfinished, practice and ordinary trial results do not award races or inspect the retained ship', () => {
  const s = stores(),
    before = s.profileStore.snapshot().state;
  const unusedShip = () => {
    throw new Error('noneligible result must not inspect runtime');
  };
  for (const [data, intent] of [
    [result(1, { valid: false }), 'race'],
    [result(1, { finished: false }), 'race'],
    [result(1), 'practice'],
    [result(1, { mode: 'time-trial' }), 'time-trial'],
  ]) {
    const outcome = settleRaceResult(
      s,
      data,
      raceContext('invalid', {
        sessionIntent: intent,
        getShipId: unusedShip,
      }),
    );
    assert.deepEqual(outcome, {
      rewards: [],
      celebration: null,
      completionEligible: false,
    });
  }
  assert.deepEqual(s.profileStore.snapshot().state, before);
});

test('a cup result persists scores, unlocks and trophy before presentation and repeated callbacks stay idempotent', () => {
  const s = stores(),
    before = prepareFinal(s),
    data = result(1, { mode: 'cup' });
  const first = settleRaceResult(s, data, cupContext);
  const profile = s.profileStore.snapshot().state;
  assert.equal(s.cupStore.snapshot().state.results.length, 3);
  assert.equal(s.cupStore.snapshot().state.phase, 'results');
  assert.equal(profile.points, 15);
  assert.equal(profile.finishes, 3);
  assert.ok(profile.claims.includes('ship-kestrel'));
  assert.deepEqual(first.celebration, { fresh: true, runId: before.runId });
  assert.equal(first.completionEligible, true);
  assert.deepEqual(s.cupCollection.snapshot().cups.horizon, {
    earnedAt: 17,
    difficulty: 'hard',
    points: 75,
  });
  const repeated = settleRaceResult(s, data, cupContext);
  assert.deepEqual(repeated, {
    rewards: [],
    celebration: null,
    completionEligible: true,
  });
  assert.deepEqual(s.profileStore.snapshot().state, profile);
  const reloaded = stores(s.storage);
  assert.deepEqual(reloaded.profileStore.snapshot().state, profile);
  assert.equal(reloaded.cupStore.snapshot().state.results.length, 3);
  assert.deepEqual(
    reloaded.cupCollection.snapshot().cups,
    s.cupCollection.snapshot().cups,
  );
});

test('cup retry preserves the event claim and awards only improvement while a defended trophy still gets a reveal', () => {
  const s = stores(),
    before = prepareFinal(s);
  settleRaceResult(s, result(4, { mode: 'cup' }), cupContext);
  const trophy = s.cupCollection.snapshot().cups.horizon;
  assert.equal(s.profileStore.snapshot().state.points, 12);
  s.cupStore.retry();
  const improved = settleRaceResult(s, result(1, { mode: 'cup' }), cupContext);
  assert.equal(s.profileStore.snapshot().state.points, 15);
  assert.equal(s.profileStore.snapshot().state.finishes, 3);
  assert.equal(
    s.profileStore.snapshot().state.raceScores[`${before.runId}:2`],
    5,
  );
  assert.deepEqual(improved.celebration, { fresh: false, runId: before.runId });
  assert.deepEqual(s.cupCollection.snapshot().cups.horizon, trophy);
  const next = prepareFinal(s);
  const defended = settleRaceResult(s, result(1, { mode: 'cup' }), cupContext);
  assert.notEqual(next.runId, before.runId);
  assert.deepEqual(defended.celebration, { fresh: false, runId: next.runId });
});

test('overall championship completion can queue the finale without winning the final race', () => {
  const s = stores();
  nearComplete(s, { missingCup: 'horizon' });
  assert.equal(s.profileStore.snapshot().state.claims.length, 26);
  prepareFinal(s);
  const outcome = settleRaceResult(s, result(2, { mode: 'cup' }), cupContext);
  assert.equal(cupChampion(s.cupStore.snapshot().state).points, 68);
  assert.deepEqual(
    outcome.rewards.map((reward) => reward.id),
    ['ship-kestrel', 'exotic-slot'],
  );
  assert.equal(outcome.completionEligible, true);
  assert.deepEqual(s.profileStore.snapshot().state.completion, {
    shipId: 'bastion',
    acknowledged: false,
  });
});

test('cup settlement requires an active final cup callback and malformed classification writes nothing', () => {
  const s = stores();
  prepareFinal(s);
  const before = {
    profile: s.profileStore.snapshot(),
    cup: s.cupStore.snapshot(),
  };
  settleRaceResult(s, result(2, { mode: 'cup', final: false }), cupContext);
  settleRaceResult(s, result(2, { mode: 'cup' }), {
    ...cupContext,
    sessionCup: false,
  });
  assert.deepEqual(s.profileStore.snapshot(), before.profile);
  assert.deepEqual(s.cupStore.snapshot(), before.cup);
  const malformed = { ...result(1, { mode: 'cup' }), standings: [] };
  assert.throws(
    () => settleRaceResult(s, malformed, cupContext),
    /complete field/,
  );
  assert.deepEqual(s.profileStore.snapshot(), before.profile);
  assert.deepEqual(s.cupStore.snapshot(), before.cup);
});

test('clean improved trial records award the map and queue completion without a results screen', () => {
  const s = stores();
  nearComplete(s, { missingTrial: 'orbital' });
  const data = { playerValid: true, improved: true, shipId: 'needle' };
  const context = { trackId: 'orbital' };
  const outcome = settleTrialRecord(s.profileStore, data, context);
  assert.deepEqual(
    outcome.rewards.map((reward) => reward.id),
    ['boost-3'],
  );
  assert.equal(outcome.completionEligible, true);
  const profile = s.profileStore.snapshot().state;
  assert.equal(profile.claims.length, 28);
  assert.deepEqual(profile.completion, {
    shipId: 'needle',
    acknowledged: false,
  });
  assert.deepEqual(settleTrialRecord(s.profileStore, data, context), {
    rewards: [],
    completionEligible: true,
  });
  const presented = settleRaceResult(
    s,
    { ...data, mode: 'time-trial' },
    {
      sessionIntent: 'time-trial',
    },
  );
  assert.deepEqual(presented, {
    rewards: [],
    celebration: null,
    completionEligible: true,
  });
  assert.deepEqual(s.profileStore.snapshot().state, profile);
});

test('trial failures do not inspect runtime or record a map and explicit result ships take precedence over lazy lookup', () => {
  const s = stores();
  const unusedShip = () => {
    throw new Error('explicit or ineligible ship must stay lazy');
  };
  for (const data of [
    { playerValid: false, improved: true },
    { playerValid: true, improved: false },
  ]) {
    assert.deepEqual(
      settleTrialRecord(s.profileStore, data, {
        trackId: 'unused',
        getShipId: unusedShip,
      }),
      {
        rewards: [],
        completionEligible: false,
      },
    );
  }
  assert.deepEqual(s.profileStore.snapshot().state.trialTracks, []);
  nearComplete(s);
  settleRaceResult(
    s,
    result(1, { shipId: 'bastion' }),
    raceContext('explicit', { getShipId: unusedShip }),
  );
  assert.equal(s.profileStore.snapshot().state.completion.shipId, 'bastion');
  const fallback = stores();
  nearComplete(fallback);
  let lookups = 0;
  settleRaceResult(
    fallback,
    result(1),
    raceContext('retained', {
      getShipId() {
        lookups++;
        return 'needle';
      },
    }),
  );
  assert.equal(lookups, 1);
  assert.equal(
    fallback.profileStore.snapshot().state.completion.shipId,
    'needle',
  );
});

test('storage failure keeps the existing in-session cup, progression and trophy behavior', () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error('storage unavailable');
  };
  const s = stores(storage);
  prepareFinal(s);
  const outcome = settleRaceResult(s, result(1, { mode: 'cup' }), cupContext);
  assert.equal(outcome.celebration.fresh, true);
  assert.equal(s.profileStore.snapshot().state.points, 15);
  assert.equal(s.cupStore.snapshot().state.results.length, 3);
  assert.equal(s.cupCollection.snapshot().cups.horizon.points, 75);
  for (const store of [s.profileStore, s.cupStore, s.cupCollection]) {
    assert.equal(store.snapshot().saved, false);
    assert.ok(store.snapshot().notice);
  }
});
