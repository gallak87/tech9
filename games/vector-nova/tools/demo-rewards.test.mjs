import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const memory = () => {
  const values = new Map();
  return {
    isolated: true,
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
async function edition(t, name) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'vn-edition-test-'));
  const server = await createServer({
    configFile: false,
    cacheDir,
    root: resolve(import.meta.dirname, '..'),
    define: { 'import.meta.env.VN_EDITION': JSON.stringify(name) },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'error',
  });
  t.after(async () => {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  });
  const modules = await Promise.all(
    [
      'progression/profile',
      'progression/catalog',
      'progression/completion',
      'progression/save-transfer',
      'race/cup',
      'race/rival-build',
      'progression/cup-collection',
      'progression/goals',
      'progression/view',
      'frontend/cup-art',
      'levels/access',
    ].map((id) => server.ssrLoadModule(`/src/${id}.js`)),
  );
  return Object.assign({}, ...modules);
}
function stores(api, storage = memory()) {
  const profile = api.createProfileStore(() => storage),
    cup = api.createCupStore(() => storage);
  const trophies = api.createCupCollection(() => storage);
  const transfer = api.createSaveTransfer({
    profileStore: profile,
    cupStore: cup,
    cupCollection: trophies,
    storage: () => storage,
  });
  return { profile, cup, trophies, transfer, storage };
}
function finishCup(api, cup, win = true) {
  const state = cup.snapshot().state;
  const field = api.cupStandings(state).map((row) => row.id);
  assert.equal(field.length, 10);
  for (let i = 0; i < api.cupDefinition(state.cupId).tracks.length; i++) {
    cup.finish({
      standings: field.map((id, index) => ({
        id,
        finished: true,
        valid: true,
        totalTime: id === 'player' ? (win ? 60 : 100) : 70 + index,
      })),
    });
    if (!api.cupComplete(cup.snapshot().state)) cup.next();
  }
}

test('the demo keeps four unlocks while a completed thirty-seven-item career and credits acknowledgement round-trip intact', async (t) => {
  const demo = await edition(t, 'demo');
  const full = await edition(t, 'full');
  const source = stores(full);
  for (let i = 0; i < 24; i++)
    source.profile.recordRace({ id: `complete-${i}`, won: true });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    source.profile.recordCup(cup);
  for (const track of ['halcyon', 'orbital'])
    source.profile.recordTrial(track, true);
  for (const mode of full.MODE_UNLOCKS)
    for (const id of mode.levelIds.slice(0, 2))
      source.profile.recordCourseFinish(id);
  assert.equal(
    full.careerUnlockProgress(source.profile.snapshot().state).collected,
    37,
  );
  assert.equal(source.profile.queueCompletion('shrike'), true);
  assert.equal(source.profile.acknowledgeCompletion(), true);
  const inDemo = stores(demo);
  inDemo.transfer.replace(inDemo.transfer.parse(source.transfer.export()));
  const progress = demo.careerUnlockProgress(inDemo.profile.snapshot().state);
  assert.equal(progress.total, 4);
  assert.equal(progress.collected, 4);
  assert.equal(progress.courseCount, 0);
  assert.ok(progress.items.every((item) => item.kind === 'reward'));
  assert.equal(demo.isCareerComplete(inDemo.profile.snapshot().state), false);
  assert.equal(
    demo.hasFullCareerUnlocks(inDemo.profile.snapshot().state),
    true,
  );
  assert.equal(inDemo.profile.snapshot().state.completion.acknowledged, true);
  const returned = stores(full);
  returned.transfer.replace(returned.transfer.parse(inDemo.transfer.export()));
  assert.deepEqual(
    returned.profile.snapshot().state,
    source.profile.snapshot().state,
  );
});

test('cup-unlocked modes stay outside the demo even with full career progress or developer access', async (t) => {
  const demo = await edition(t, 'demo'),
    full = await edition(t, 'full');
  const access = {
    complete: true,
    cupWins: ['founders', 'frontier', 'horizon', 'apex'],
    finishedCourses: full.COURSE_IDS,
  };
  for (const unlock of full.MODE_UNLOCKS) {
    assert.equal(full.modeAvailable(unlock.mode, access), true);
    assert.equal(demo.modeAvailable(unlock.mode, access), false);
    assert.equal(
      demo.modeAvailable(unlock.mode, { ...access, developer: true }),
      false,
    );
    for (const id of unlock.levelIds) {
      assert.equal(full.levelAvailable(id, access), true);
      assert.equal(demo.levelAvailable(id, access), false);
      assert.equal(demo.previewSelectable(id, access), false);
      assert.equal(
        demo.levelAvailable(id, { ...access, developer: true }),
        false,
      );
    }
  }
  assert.equal(demo.modeAvailable('race'), true);
});

test('demo awards four reachable milestones, independent of placing and with two equipment slots', async (t) => {
  const api = await edition(t, 'demo');
  const { profile, cup } = stores(api);
  assert.deepEqual(
    api.REWARDS.map((r) => r.id),
    ['speed-1', 'equipment-jump', 'equipment-deflector', 'boost-1'],
  );
  assert.equal(api.starterShip(), 'kestrel');
  assert.deepEqual(
    api.rewardGoals(profile.snapshot().state).map((g) => g.id),
    ['speed-1', 'equipment-jump'],
  );
  assert.match(
    api.rewardGoals(profile.snapshot().state)[1].detail,
    /3 valid races/,
  );
  assert.doesNotMatch(
    api.rewardGoals(profile.snapshot().state, {
      mode: 'time-trial',
      trackId: 'halcyon',
    })[0].detail,
    /required/i,
  );
  assert.deepEqual(profile.recordTrial('halcyon', false), []);
  assert.deepEqual(
    profile.recordTrial('halcyon', true).map((r) => r.id),
    ['boost-1'],
  );
  assert.deepEqual(
    profile.recordRace({ id: '1', position: 4 }).map((r) => r.id),
    ['speed-1'],
  );
  assert.deepEqual(profile.recordRace({ id: '1', position: 4 }), []);
  assert.deepEqual(
    profile.recordRace({ id: 'dnf', position: 1, finished: false }),
    [],
  );
  assert.deepEqual(
    profile.recordRace({ id: 'invalid', position: 1, valid: false }),
    [],
  );
  assert.deepEqual(profile.recordRace({ id: '2', position: 10 }), []);
  assert.deepEqual(
    profile.recordRace({ id: '3', position: 8 }).map((r) => r.id),
    ['equipment-jump'],
  );
  assert.equal(profile.snapshot().state.wins, 0);
  cup.start('demo', 'kestrel', 'easy');
  finishCup(api, cup, false);
  assert.equal(api.cupChampion(cup.snapshot().state), null);
  cup.start('demo', 'kestrel', 'easy');
  finishCup(api, cup);
  assert.ok(api.cupChampion(cup.snapshot().state));
  assert.deepEqual(
    profile.recordCup('demo').map((r) => r.id),
    ['equipment-deflector'],
  );
  assert.deepEqual(profile.recordCup('demo'), []);
  assert.equal(profile.equip('kestrel', 0, 'jump'), true);
  assert.equal(profile.equip('kestrel', 1, 'deflector'), true);
  assert.equal(profile.equip('kestrel', 2, 'jump'), false);
  assert.equal(profile.chooseExotic('kestrel'), false);
  assert.deepEqual(
    api.sessionBuild(profile.snapshot().state, 'kestrel').equipment,
    ['jump', 'deflector'],
  );
  assert.deepEqual(api.rewardGoals(profile.snapshot().state), []);
  assert.equal(
    (
      api
        .careerView(profile.snapshot().state)
        .match(/class="reward-milestone/g) ?? []
    ).length,
    4,
  );
  assert.doesNotMatch(
    api.careerView(profile.snapshot().state),
    /Quad Core|Full game ·|6 race progress/,
  );
  assert.ok(api.validateProfile(profile.snapshot().state));
});

test('demo saves carry rewards and trophy to full; full saves round-trip through demo without losing upgrades or cups', async (t) => {
  const demo = await edition(t, 'demo'),
    full = await edition(t, 'full');
  const source = stores(demo),
    target = stores(full);
  for (let i = 0; i < 3; i++)
    source.profile.recordRace({ id: `race-${i}`, position: 4 });
  source.profile.recordTrial('nacre', true);
  source.cup.start('demo', 'kestrel', 'hard');
  finishCup(demo, source.cup);
  source.profile.recordCup('demo');
  source.trophies.award(source.cup.snapshot().state);
  source.profile.equip('kestrel', 0, 'jump');
  source.profile.equip('kestrel', 1, 'deflector');
  const file = source.transfer.export(),
    parsed = target.transfer.parse(file);
  assert.equal(parsed.cupUnavailable, true);
  target.transfer.replace(parsed);
  assert.deepEqual(
    target.profile.snapshot().state,
    source.profile.snapshot().state,
  );
  assert.deepEqual(
    target.trophies.snapshot().cups,
    source.trophies.snapshot().cups,
  );
  assert.equal(target.cup.snapshot().state, null);
  assert.equal(JSON.parse(target.transfer.export()).cup.cupId, 'demo');
  assert.match(
    full.cupCabinet(target.trophies.snapshot()),
    /Demo Cup: trophy earned/,
  );
  assert.deepEqual(
    full.sessionBuild(target.profile.snapshot().state, 'shrike').enhancements,
    {
      speed: 1,
      acceleration: 0,
      handling: 0,
      braking: 0,
      boost: 1,
      toughness: 0,
    },
  );
  for (const id of ['founders', 'frontier', 'horizon'])
    target.profile.recordCup(id);
  assert.ok(!target.profile.snapshot().state.claims.includes('exotic-slot'));
  assert.deepEqual(
    full.rewardProgress(target.profile.snapshot().state, { cups: 4 }),
    [3, 4],
  );
  target.profile.recordCup('apex');
  for (let i = 0; i < 30; i++)
    target.profile.recordRace({ id: `win-${i}`, position: 1 });
  target.profile.recordTrial('halcyon', true);
  target.profile.chooseExotic('kestrel');
  for (const [i, id] of ['jump', 'lance', 'injector', 'deflector'].entries())
    target.profile.equip('kestrel', i, id);
  target.profile.recordCourseFinish('launchworks');
  target.profile.recordCourseFinish('freestyle-oriel');
  target.cup.start('apex', 'kestrel', 'hard');
  const original = target.profile.snapshot().state;
  const inDemo = stores(demo);
  inDemo.transfer.replace(inDemo.transfer.parse(target.transfer.export()));
  assert.deepEqual(inDemo.profile.snapshot().state, original);
  assert.equal(demo.equipmentCapacity(original, 'kestrel'), 2);
  assert.deepEqual(demo.sessionBuild(original, 'kestrel').equipment, [
    'jump',
    null,
  ]);
  assert.deepEqual(demo.sessionBuild(original, 'kestrel').enhancements, {
    speed: 1,
    acceleration: 0,
    handling: 0,
    braking: 0,
    boost: 1,
    toughness: 0,
  });
  const demoRivals = demo.sessionRivalSetup(original, 'kestrel');
  assert.deepEqual(demoRivals, {
    equipmentPool: ['jump', 'deflector'],
    slots: 2,
  });
  const demoField = demo.createRivalFieldBuild({
    ...demoRivals,
    enhancements: demo.sessionBuild(original, 'kestrel').enhancements,
    difficulty: 'hard',
    seed: 73,
  });
  assert.ok(
    demoField.opponents.every(
      ({ equipment }) =>
        equipment.length === 2 &&
        equipment.every((id) => demoRivals.equipmentPool.includes(id)),
    ),
  );
  assert.throws(
    () =>
      demo.createRivalFieldBuild({ ...demoRivals, equipmentPool: ['lance'] }),
    /equipment pool/,
  );
  assert.throws(
    () => demo.createRivalFieldBuild({ ...demoRivals, slots: 4 }),
    /equipment capacity/,
  );
  const fullRivals = full.sessionRivalSetup(original, 'kestrel');
  assert.equal(fullRivals.slots, 4);
  assert.equal(fullRivals.equipmentPool.length, 6);
  const fullField = full.createRivalFieldBuild({
    ...fullRivals,
    seed: 73,
    difficulty: 'hard',
  });
  assert.ok(
    fullField.opponents.every(({ equipment }) => equipment.length === 4),
  );
  assert.equal(inDemo.profile.equip('kestrel', 1, 'lance'), false);
  assert.equal(inDemo.profile.chooseExotic('kestrel'), false);
  assert.equal(inDemo.profile.removeExotic(), false);
  assert.equal(inDemo.profile.recordCourseFinish('freestyle-ravel'), false);
  assert.deepEqual(inDemo.profile.snapshot().state.finishedCourses, [
    'launchworks',
    'freestyle-oriel',
  ]);
  assert.deepEqual(inDemo.profile.snapshot().state, original);
  assert.match(demo.careerView(original), /4<small> \/ 4 unlocks/);
  assert.doesNotMatch(
    demo.careerView(original),
    /career-courses|Course unlocks/,
  );
  assert.doesNotMatch(
    demo.careerProgressView(original),
    /course-progress|data-unlock/,
  );
  assert.equal(
    (
      demo
        .careerProgressView(original)
        .match(/class="career-progress-notch/g) ?? []
    ).length,
    4,
  );
  const returned = stores(full);
  returned.transfer.replace(returned.transfer.parse(inDemo.transfer.export()));
  assert.deepEqual(returned.profile.snapshot().state, original);
  assert.deepEqual(returned.cup.snapshot().state, target.cup.snapshot().state);
  assert.deepEqual(
    returned.trophies.snapshot().cups,
    source.trophies.snapshot().cups,
  );
  const incompleteFleet = JSON.parse(file);
  incompleteFleet.profile.loadouts = {
    kestrel: incompleteFleet.profile.loadouts.kestrel,
  };
  assert.throws(
    () => target.transfer.parse(JSON.stringify(incompleteFleet)),
    /career save/,
  );
  const invalidCup = JSON.parse(file);
  invalidCup.cup.eventIndex = 90;
  assert.throws(
    () => target.transfer.parse(JSON.stringify(invalidCup)),
    /cup save/,
  );
  const damaged = JSON.parse(file);
  delete damaged.profile.loadouts.needle;
  assert.throws(
    () => target.transfer.parse(JSON.stringify(damaged)),
    /career save/,
  );
});
