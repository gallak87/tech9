import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshProfile,
  createProfileStore,
  validateProfile,
  PROFILE_KEY,
} from './profile.js';
import { rewardGoals, rewardBadgesView, raceProgressView } from './goals.js';
import { REWARDS } from './catalog.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) };
};
test('all ten valid places earn progress, while invalid runs and missing finishes earn nothing', () => {
  for (const [index, points] of [5, 4, 3, 2, 2, 1, 1, 1, 1, 1].entries()) {
    const storage = memory(),
      store = createProfileStore(() => storage);
    const result = { id: 'race', position: index + 1 };
    assert.deepEqual(store.recordRace({ ...result, valid: false }), []);
    assert.deepEqual(store.recordRace({ ...result, finished: false }), []);
    assert.deepEqual(
      store.recordRace(result).map((r) => r.id),
      ['speed-1'],
    );
    assert.equal(store.snapshot().state.points, points);
    assert.equal(store.snapshot().state.finishes, 1);
    assert.equal(store.snapshot().state.wins, Number(index === 0));
    assert.deepEqual(store.recordRace(result), []);
    assert.deepEqual(
      createProfileStore(() => storage).snapshot().state,
      store.snapshot().state,
    );
  }
});
test('four fourth-place finishes unlock first equipment, with speed as the first two milestones', () => {
  const storage = memory(),
    store = createProfileStore(() => storage),
    awards = [];
  for (let i = 0; i < 4; i++)
    awards.push(
      store.recordRace({ id: `race-${i}`, position: 4 }).map((r) => r.id),
    );
  assert.deepEqual(awards[0], ['speed-1']);
  assert.deepEqual(awards[1], []);
  assert.deepEqual(awards[2], ['speed-2']);
  assert.ok(awards[3].includes('equipment-jump'));
  assert.equal(store.snapshot().state.points, 8);
  assert.equal(store.snapshot().state.wins, 0);
  assert.ok(
    !store.snapshot().state.claims.some((id) => id.startsWith('ship-')),
  );
});
test('improving a retried cup event only awards the point difference and one win', () => {
  const storage = memory(),
    store = createProfileStore(() => storage);
  store.recordRace({ id: 'cup:event', position: 4 });
  store.recordRace({ id: 'cup:event', position: 2 });
  assert.equal(store.snapshot().state.points, 4);
  store.recordRace({ id: 'cup:event', position: 1 });
  assert.equal(store.snapshot().state.points, 5);
  assert.equal(store.snapshot().state.finishes, 1);
  assert.equal(store.snapshot().state.wins, 1);
  const restored = createProfileStore(() => storage);
  assert.deepEqual(restored.recordRace({ id: 'cup:event', position: 1 }), []);
  assert.deepEqual(restored.recordRace({ id: 'cup:event', position: 7 }), []);
});
test('v2 saves preserve unlocks and assign five points per old win without replay credit', () => {
  const old = freshProfile();
  old.version = 2;
  old.wins = 3;
  old.raceClaims = ['first', 'second', 'third'];
  old.claims = ['speed-1', 'speed-2', 'equipment-jump'];
  old.loadouts.shrike = ['jump', null, null, null];
  delete old.points;
  delete old.finishes;
  delete old.raceScores;
  const storage = memory();
  storage.setItem(PROFILE_KEY, JSON.stringify(old));
  const store = createProfileStore(() => storage),
    migrated = store.snapshot().state;
  assert.equal(migrated.points, 15);
  assert.equal(migrated.finishes, 3);
  assert.deepEqual(migrated.claims, old.claims);
  assert.deepEqual(migrated.loadouts, old.loadouts);
  assert.deepEqual(store.recordRace({ id: 'first', position: 1 }), []);
  assert.ok(validateProfile(migrated));
  assert.equal(validateProfile({ ...migrated, points: -1 }), null);
  assert.equal(validateProfile({ ...migrated, raceScores: {} }), null);
});
test('mode goals hide undiscovered identities and omit practice and completed collections', () => {
  const fresh = freshProfile();
  assert.deepEqual(
    rewardGoals(fresh).map((g) => g.id),
    ['speed-1', 'speed-2'],
  );
  assert.equal(rewardGoals(fresh, { mode: 'practice' }).length, 0);
  const cup = rewardGoals(fresh, { mode: 'cup', cupId: 'founders' });
  assert.equal(cup[0].title, 'New ship + equipment');
  const markup = rewardBadgesView(cup, fresh);
  assert.ok(!/Bastion|Deflector/.test(markup));
  fresh.claims = REWARDS.map((r) => r.id);
  assert.deepEqual(rewardGoals(fresh), []);
  assert.deepEqual(
    rewardGoals(fresh, { mode: 'time-trial', trackId: 'halcyon' }),
    [],
  );
});
test('Time Trial goals respect distinct maps and the first boost prerequisite', () => {
  const profile = freshProfile();
  assert.match(
    rewardGoals(profile, { mode: 'time-trial', trackId: 'halcyon' })[0].detail,
    /Race upgrade required/,
  );
  profile.claims = ['boost-1', 'boost-2'];
  profile.trialTracks = ['halcyon'];
  assert.match(
    rewardGoals(profile, { mode: 'time-trial', trackId: 'halcyon' })[0].detail,
    /Try another map/,
  );
  assert.equal(
    rewardGoals(profile, { mode: 'time-trial', trackId: 'orbital' })[0].detail,
    'Set a clean record here',
  );
});
test('result progress shows the earned delta and does not double-count a reopened result', () => {
  const storage = memory(),
    store = createProfileStore(() => storage),
    before = store.snapshot().state;
  store.recordRace({ id: 'race', position: 4 });
  const after = store.snapshot().state,
    result = {
      standings: [{ id: 'player', position: 4, valid: true, finished: true }],
    };
  const view = raceProgressView(before, after, { mode: 'race' }, result);
  assert.match(view, /\+2 race progress/);
  assert.match(view, /0 → 2\/6 progress/);
  assert.match(view, /Unlocked/);
  assert.match(
    raceProgressView(after, after, { mode: 'race' }, result),
    /already been counted/,
  );
});
