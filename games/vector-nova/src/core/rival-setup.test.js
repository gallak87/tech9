import test from 'node:test';
import assert from 'node:assert/strict';
import { raceRivalBuild, replayRivalBuild } from './rival-setup.js';
import { buildIdentity } from '../progression/profile.js';

const build = {
  version: 1,
  enhancements: { speed: 3, boost: 2 },
  equipment: ['injector'],
};
const context = {
  build,
  rivals: { equipmentPool: ['injector', 'deflector', 'jump'], slots: 2 },
  difficulty: 'hard',
};

test('race builds use the full unlocked pool independently of player equipment', () => {
  const identity = buildIdentity(build);
  const field = raceRivalBuild({ ...context, seed: 194 });
  assert.deepEqual(field.equipmentPool, ['jump', 'injector', 'deflector']);
  assert.equal(field.bonusScale, 1);
  assert.equal(field.enhancements.speed, 3);
  assert.ok(field.opponents.every((actor) => actor.equipment.length === 2));
  assert.deepEqual(buildIdentity(build), identity);
  assert.deepEqual(build.equipment, ['injector']);
});

test('a race seed is reproducible and another race can choose different loadouts', () => {
  const first = raceRivalBuild({ ...context, seed: 194 });
  assert.deepEqual(raceRivalBuild({ ...context, seed: 194 }), first);
  assert.notDeepEqual(
    raceRivalBuild({ ...context, seed: 195 }).opponents,
    first.opponents,
  );
  assert.deepEqual(replayRivalBuild(structuredClone(first), context), first);
});

test('replay cannot change stat ranks, equipment eligibility, slots or difficulty', () => {
  const recorded = raceRivalBuild({ ...context, seed: 194 });
  for (const missing of [undefined, null])
    assert.throws(
      () => replayRivalBuild(missing, context),
      /Replay rival setup mismatch/,
    );
  for (const change of [
    { build: { ...build, enhancements: { speed: 2, boost: 2 } } },
    { rivals: { equipmentPool: ['injector', 'jump'], slots: 2 } },
    { rivals: { equipmentPool: context.rivals.equipmentPool, slots: 4 } },
    { difficulty: 'medium' },
  ])
    assert.throws(
      () => replayRivalBuild(recorded, { ...context, ...change }),
      /rival setup mismatch/,
    );
  const tampered = structuredClone(recorded);
  tampered.opponents[0].equipment = ['lance'];
  assert.throws(() => replayRivalBuild(tampered, context), /build mismatch/);
});

test('developer builds without career context use only their declared equipment', () => {
  const field = raceRivalBuild({ build, difficulty: 'easy', seed: 1 });
  assert.deepEqual(field.equipmentPool, ['injector']);
  assert.equal(field.slots, 2);
  assert.equal(field.bonusScale, 0.5);
});
