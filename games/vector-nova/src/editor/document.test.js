import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_BIOMES } from './biomes.js';
import {
  createDocument,
  generateDocument,
  validateDocument,
  analyzeDocument,
  analyzePracticeDocument,
  documentIdentity,
  applySectionShape,
  addCorkscrew,
  addJump,
  setCourseType,
  GENERATOR_VERSION,
  ENVIRONMENT_VERSION,
  ENVIRONMENT_LAYOUT_VERSION,
  JUMP_FREQUENCIES,
  JUMP_SIZES,
  generateDocumentAsync,
} from './document.js';

const plainDocument = (options = {}) =>
  generateDocument({ generatorVersion: 1, seedJumps: false, ...options });

test('seed generation is deterministic while new documents have independent library identities', () => {
  assert.deepEqual(plainDocument({ seed: 42 }), plainDocument({ seed: 42 }));
  assert.notDeepEqual(
    plainDocument({ seed: 42 }).points,
    plainDocument({ seed: 43 }).points,
  );
  assert.notEqual(
    createDocument({ seed: 42 }).id,
    createDocument({ seed: 42 }).id,
  );
  const blank = createDocument({ blank: true });
  assert.deepEqual(validateDocument(blank).points, []);
  assert.equal(analyzeDocument(blank).valid, false);
});

test('untrusted documents reject unsupported content and canonical validation copies only known data', () => {
  const doc = plainDocument();
  const source = structuredClone(doc);
  source.injected = '<script>';
  source.points[0].unexpected = true;
  assert.deepEqual(validateDocument(source), doc);
  const clone = validateDocument(doc);
  clone.points[0].x += 5;
  assert.notEqual(clone.points[0].x, doc.points[0].x);
  for (const change of [
    (d) => {
      d.version = 2;
    },
    (d) => {
      d.biome = 'custom-js';
    },
    (d) => {
      d.points[0].x = Infinity;
    },
    (d) => {
      d.id = '../bad';
    },
    (d) => {
      d.points[1].id = d.points[0].id;
    },
    (d) => {
      d.width = 400;
    },
    (d) => {
      d.props = [{ id: 'script', type: 'script' }];
    },
  ]) {
    const invalid = structuredClone(doc);
    change(invalid);
    assert.throws(() => validateDocument(invalid));
    assert.equal(analyzeDocument(invalid).valid, false);
  }
});

test('geometry identity follows actual edits and remains stable when renaming or copying', () => {
  const doc = plainDocument(),
    same = structuredClone(doc);
  same.id = 'a-new-copy';
  same.name = 'Renamed';
  assert.equal(documentIdentity(doc), documentIdentity(same));
  for (const change of [
    (d) => {
      d.points[0].x += 10;
    },
    (d) => {
      d.points[0].bank = 0.1;
    },
    (d) => {
      d.width += 2;
    },
    (d) => {
      d.settings.density = 0.4;
    },
  ]) {
    const changed = structuredClone(doc);
    change(changed);
    assert.notEqual(documentIdentity(doc), documentIdentity(changed));
  }
});

test('the shortest widest most varied seeded loops satisfy the authoring constraints', () => {
  for (let seed = 0; seed < 24; seed++) {
    const doc = plainDocument({
      seed,
      length: 1800,
      bendiness: 1,
      elevation: 1,
      width: 64,
    });
    const analysis = analyzeDocument(doc);
    assert.equal(analysis.valid, true, `${seed}: ${analysis.errors.join(' ')}`);
    assert.ok(Math.abs(analysis.length - 1800) < 0.1);
    assert.ok(analysis.minRadius >= 55);
  }
});

test('authoring validation identifies unsupported bends and scenery obstructing the driving corridor', () => {
  const doc = plainDocument();
  doc.points[1] = {
    ...doc.points[1],
    x: doc.points[0].x + 1,
    y: doc.points[0].y,
    z: doc.points[0].z,
  };
  assert.match(analyzeDocument(doc).errors.join(' '), /30 m/);
  const placed = plainDocument();
  placed.props.push({
    id: 'pump-1',
    type: 'pump',
    distance: 0.3,
    lateral: 0,
    scale: 1,
    rotation: 0,
  });
  assert.match(analyzeDocument(placed).errors.join(' '), /pump-1/);
  placed.props[0].lateral = 300;
  assert.equal(analyzeDocument(placed).valid, true);
});

test('banked deck edges stay above basin water and placed scenery cannot overlap', () => {
  const doc = plainDocument({ width: 64, waterLevel: -8 });
  for (const point of doc.points) {
    point.y = 0;
    point.bank = 0.35;
  }
  assert.match(analyzeDocument(doc).errors.join(' '), /water clearance/);
  for (const point of doc.points) point.y = 40;
  assert.equal(analyzeDocument(doc).valid, true);
  const placed = plainDocument();
  const object = {
    id: 'first-building',
    type: 'building',
    distance: 0.2,
    lateral: 300,
    scale: 1,
    rotation: 0,
  };
  placed.props.push(object, { ...object, id: 'second-building' });
  assert.match(
    analyzeDocument(placed).errors.join(' '),
    /other placed scenery/,
  );
});

test('older files acquire zero road rotation and empty optional layouts without losing authored points', () => {
  const older = plainDocument();
  for (const p of older.points) delete p.roll;
  delete older.rolls;
  delete older.pickups;
  const doc = validateDocument(older);
  assert.ok(doc.points.every((p) => p.roll === 0));
  assert.deepEqual(doc.rolls, []);
  assert.deepEqual(doc.pickups.devices, []);
  assert.equal(analyzeDocument(doc).valid, true);
});

test('rotation chunks propagate their final angle into connectors and chain into a complete turn', () => {
  let doc = plainDocument({ length: 4800 });
  const ids = [0, 4, 8, 12, 15].map((i) => doc.points[i].id);
  for (let i = 0; i < 4; i++) {
    doc = applySectionShape(doc, {
      startPointId: ids[i],
      endPointId: ids[i + 1],
      angle: Math.PI / 2,
    });
    const endpoint = doc.points.findIndex((p) => p.id === ids[i + 1]);
    assert.ok(
      Math.abs(doc.points[endpoint].roll - ((i + 1) * Math.PI) / 2) < 1e-8,
    );
    assert.ok(
      doc.points
        .slice(endpoint)
        .every((p) => Math.abs(p.roll - ((i + 1) * Math.PI) / 2) < 1e-8),
    );
    assert.equal(analyzeDocument(doc).valid, true);
  }
  assert.ok(Math.abs(doc.points.at(-1).roll - Math.PI * 2) < 1e-8);
  const straight = applySectionShape(doc, {
    startPointId: ids[1],
    endPointId: ids[2],
    type: 'straight',
  });
  const from = straight.points.findIndex((p) => p.id === ids[1]),
    to = straight.points.findIndex((p) => p.id === ids[2]);
  const a = straight.points[from],
    b = straight.points[to];
  for (const p of straight.points.slice(from, to + 1)) {
    const u =
      (p.x - a.x) * (b.x - a.x) +
      (p.y - a.y) * (b.y - a.y) +
      (p.z - a.z) * (b.z - a.z);
    const denominator = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2;
    assert.ok(
      Math.hypot(
        p.x - a.x - ((b.x - a.x) * u) / denominator,
        p.y - a.y - ((b.y - a.y) * u) / denominator,
        p.z - a.z - ((b.z - a.z) * u) / denominator,
      ) < 1e-6,
    );
    assert.equal(p.roll, a.roll);
  }
  const fastTurn = applySectionShape(plainDocument(), {
    startIndex: 0,
    endIndex: 1,
    angle: Math.PI * 1.5,
  });
  const turnReport = analyzePracticeDocument(fastTurn);
  assert.equal(turnReport.valid, true);
  assert(turnReport.advisories.some(({ kind }) => kind === 'rotation'));
  assert.equal(
    analyzeDocument(addCorkscrew(plainDocument(), { start: 0.2, end: 0.7 }))
      .valid,
    true,
  );
});

test('water clearance follows actual rotated deck edges instead of a clamped bank approximation', () => {
  const doc = plainDocument({ width: 64, waterLevel: -8 });
  for (const point of doc.points) point.y = 20;
  assert.equal(analyzeDocument(doc).valid, true);
  for (const point of doc.points) point.roll = Math.PI / 2;
  assert.match(analyzeDocument(doc).errors.join(' '), /water clearance/);
});

test('short rotation chunks allow tightly spaced subdivisions in Practice', () => {
  const source = plainDocument({ length: 1800 });
  const [a, b] = source.points;
  for (const axis of ['x', 'y', 'z'])
    b[axis] = a[axis] + (b[axis] - a[axis]) * 0.4;
  const short = applySectionShape(source, {
    startIndex: 0,
    endIndex: 1,
    angle: Math.PI / 2,
  });
  const report = analyzePracticeDocument(short);
  assert.equal(report.valid, true);
  assert(report.advisories.some(({ kind }) => kind === 'spacing'));
  for (const length of [2400, 3000]) {
    const doc = applySectionShape(plainDocument({ length }), {
      startIndex: 0,
      endIndex: 1,
      angle: Math.PI / 2,
    });
    const analysis = analyzeDocument(doc);
    assert.equal(analysis.valid, true, analysis.errors.join(' '));
    assert.ok(analysis.maxRollRate <= 0.025);
    for (let i = 0; i < doc.points.length; i++) {
      const a = doc.points[i],
        b = doc.points[(i + 1) % doc.points.length];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >= 30);
    }
  }
});

test('manual jump accepts short approach and gap with physical support, and rejects overlapping receivers', () => {
  const source = plainDocument({ length: 3600 });
  const [start, next] = source.points;
  const span = Math.hypot(next.x - start.x, next.y - start.y, next.z - start.z);
  source.points.splice(
    1,
    0,
    ...[60, 80].map((distance) => ({
      id: `near-start-${distance}`,
      x: start.x + ((next.x - start.x) * distance) / span,
      y: start.y + ((next.y - start.y) * distance) / span,
      z: start.z + ((next.z - start.z) * distance) / span,
      bank: 0,
      roll: 0,
    })),
  );
  const draft = addJump(source, {
    startIndex: 1,
    endIndex: 2,
    rampAssist: false,
  });
  const report = analyzePracticeDocument(draft);
  const [gap] = draft.jumps;
  assert.equal(report.valid, true);
  assert.deepEqual(draft.points, source.points);
  assert(gap.start * report.length < 160);
  assert((gap.end - gap.start) * report.length < 30);
  assert(report.advisories.some(({ kind }) => kind === 'jump'));
  assert.throws(
    () => addJump(draft, { startIndex: 2, endIndex: 3, rampAssist: false }),
    /separate launch|receiv/i,
  );
});

test('Circuit and Downhill starters are deterministic with safe supported runouts', () => {
  for (const courseType of ['circuit', 'downhill']) {
    assert.deepEqual(
      plainDocument({ seed: 31, courseType }),
      plainDocument({ seed: 31, courseType }),
    );
    for (let seed = 0; seed < 12; seed++) {
      const doc = plainDocument({
        seed,
        courseType,
        length: 1800,
        bendiness: 1,
        elevation: 1,
      });
      assert.equal(
        analyzeDocument(doc).valid,
        true,
        `${courseType}/${seed}: ${analyzeDocument(doc).errors}`,
      );
    }
  }
  const older = plainDocument();
  delete older.courseType;
  delete older.jumps;
  assert.equal(validateDocument(older).courseType, 'circuit');
  assert.deepEqual(validateDocument(older).jumps, []);
  let course = addJump(plainDocument({ courseType: 'downhill' }), {
    startIndex: 2,
    endIndex: 4,
  });
  course = setCourseType(course, 'circuit');
  assert.equal(course.courseType, 'circuit');
  assert.deepEqual(course.jumps, []);
});

test('assisted jumps author visible broad ramps and anchored lips survive later route and jump edits', () => {
  for (const courseType of ['circuit', 'downhill']) {
    const doc = addJump(plainDocument({ courseType, length: 3000 }), {
      startIndex: 2,
      endIndex: 4,
    });
    assert.equal(
      analyzeDocument(doc).valid,
      true,
      analyzeDocument(doc).errors.join(' '),
    );
    assert.ok(doc.jumps[0].launchPointId && doc.jumps[0].landingPointId);
    const launch = doc.points.find((p) => p.id === doc.jumps[0].launchPointId),
      landing = doc.points.find((p) => p.id === doc.jumps[0].landingPointId);
    assert.ok(launch.y > landing.y + 60);
    const moved = structuredClone(doc);
    moved.points.at(-2).x += 40;
    const canonical = validateDocument(moved);
    assert.notEqual(canonical.jumps[0].start, doc.jumps[0].start);
    const removed = structuredClone(doc);
    removed.points = removed.points.filter(
      (p) => p.id !== doc.jumps[0].launchPointId,
    );
    assert.throws(() => validateDocument(removed), /Remove the jump/);
  }
  let doc = addJump(plainDocument({ length: 6000 }), {
    startIndex: 2,
    endIndex: 4,
  });
  const first = structuredClone(doc.jumps[0]),
    from = doc.points.findIndex((p) => p.id === 'point-10'),
    to = doc.points.findIndex((p) => p.id === 'point-12');
  doc = addJump(doc, { startIndex: from, endIndex: to });
  assert.equal(doc.jumps[0].launchPointId, first.launchPointId);
  assert.equal(doc.jumps[0].landingPointId, first.landingPointId);
  assert.notEqual(doc.jumps[0].start, first.start);
  const startIndex = doc.points.findIndex((p) => p.id === first.launchPointId),
    endIndex = doc.points.findIndex((p) => p.id === first.landingPointId);
  assert.throws(() => addJump(doc, { startIndex, endIndex }), /existing jump/);
});

test('Downhill scenery at the open endpoint is distinct from scenery at the start', () => {
  const doc = plainDocument({ courseType: 'downhill' });
  doc.props = [
    {
      id: 'start-building',
      type: 'building',
      distance: 0,
      lateral: 300,
      scale: 1,
      rotation: 0,
    },
    {
      id: 'finish-building',
      type: 'building',
      distance: 1,
      lateral: 300,
      scale: 1,
      rotation: 0,
    },
  ];
  assert.equal(
    analyzeDocument(doc).valid,
    true,
    analyzeDocument(doc).errors.join(' '),
  );
});

test('current generator preferences have strict canonical enums and blank drafts keep useful generation defaults', () => {
  const blank = createDocument({
    seed: 19,
    courseType: 'downhill',
    blank: true,
  });
  assert.equal(blank.generator.version, GENERATOR_VERSION);
  assert.equal(blank.generator.version, 6);
  assert.equal(blank.generator.jumpFrequency, 'normal');
  assert.equal(blank.generator.jumpSize, 'mixed');
  assert.equal(blank.generator.crossovers, 0);
  assert.equal(blank.generator.rhythm, 0.55);
  assert.equal(blank.generator.banking, 0.55);
  assert.deepEqual(blank.points, []);
  assert.deepEqual(blank.jumps, []);
  assert.deepEqual(JUMP_FREQUENCIES, ['none', 'few', 'normal', 'many']);
  assert.deepEqual(JUMP_SIZES, ['small', 'mixed', 'large']);
  const missing = structuredClone(blank);
  delete missing.generator.jumpFrequency;
  delete missing.generator.jumpSize;
  delete missing.generator.crossovers;
  delete missing.generator.rhythm;
  delete missing.generator.banking;
  assert.deepEqual(validateDocument(missing).generator, blank.generator);
  for (const [field, value] of [
    ['jumpFrequency', 'constant'],
    ['jumpSize', 'huge'],
    ['crossovers', -0.1],
    ['crossovers', 1.1],
    ['crossovers', '0.5'],
    ['crossovers', NaN],
    ['crossovers', Infinity],
    ['rhythm', -0.1],
    ['rhythm', 1.01],
    ['rhythm', '0.5'],
    ['banking', NaN],
    ['banking', Infinity],
    ['banking', 1.01],
    ['version', 7],
  ]) {
    const invalid = structuredClone(blank);
    invalid.generator[field] = value;
    assert.throws(() => validateDocument(invalid));
  }
});

test('loading legacy generator records and upgrading preferences preserve the complete resolved geometry', () => {
  for (const version of [1, 2]) {
    const legacy = plainDocument({ seed: 91 });
    legacy.generator.version = version;
    const oldGenerator = structuredClone(legacy.generator);
    const original = validateDocument(legacy);
    assert.deepEqual(
      original.generator,
      oldGenerator,
      'legacy canonical keys and values remain stable',
    );
    const upgraded = structuredClone(original);
    upgraded.generator = {
      ...upgraded.generator,
      version: 3,
      seed: 450,
      jumpFrequency: 'many',
      jumpSize: 'large',
    };
    const saved = validateDocument(upgraded);
    assert.deepEqual(saved.points, original.points);
    assert.deepEqual(saved.jumps, original.jumps);
    assert.equal(saved.generator.jumpFrequency, 'many');
    assert.equal(saved.generator.jumpSize, 'large');
    assert.deepEqual(
      validateDocument(JSON.parse(JSON.stringify(saved))),
      saved,
    );
  }
});

test('explicit legacy generator versions reproduce their original point models', () => {
  const plain = generateDocument({ seed: 42, generatorVersion: 1 });
  const seeded = generateDocument({ seed: 42, generatorVersion: 2 });
  assert.equal(plain.generator.version, 1);
  assert.equal(plain.points.length, 16);
  assert.deepEqual(plain.jumps, []);
  assert.equal(seeded.generator.version, 2);
  assert.equal(seeded.jumps.length, 1);
  assert.deepEqual(Object.keys(seeded.generator), [
    'version',
    'seed',
    'length',
    'bendiness',
    'elevation',
  ]);
  assert.deepEqual(generateDocument({ seed: 42, generatorVersion: 1 }), plain);
  assert.deepEqual(generateDocument({ seed: 42, generatorVersion: 2 }), seeded);
});

test('current sync and yielding async generation produce identical validated resolved routes', async () => {
  const options = {
    seed: 7,
    courseType: 'downhill',
    length: 5000,
    jumpFrequency: 'few',
    jumpSize: 'small',
  };
  const expected = generateDocument(options);
  assert.equal(expected.generator.version, GENERATOR_VERSION);
  assert.equal(expected.generator.jumpFrequency, 'few');
  assert.equal(expected.generator.jumpSize, 'small');
  assert.equal(analyzeDocument(expected).valid, true);
  let yields = 0;
  const progress = [];
  const actual = await generateDocumentAsync(options, {
    yieldControl: async () => {
      yields++;
    },
    onProgress: (status) => progress.push(status),
  });
  assert.deepEqual(actual, expected);
  assert.ok(yields >= 1 && yields <= 6);
  assert.equal(progress.length, yields);
  assert.deepEqual(
    progress.map((p) => p.attempt),
    Array.from({ length: yields }, (_, i) => i + 1),
  );
  assert.ok(progress.every((p) => p.total === 6));
  const noJumps = generateDocument({ seed: 7, seedJumps: false });
  assert.equal(noJumps.generator.version, GENERATOR_VERSION);
  assert.equal(noJumps.generator.jumpFrequency, 'none');
  assert.deepEqual(noJumps.jumps, []);
  assert.equal(analyzeDocument(noJumps).valid, true);
});

test('legacy environment migration preserves the old scenery seed and historical physical identity', () => {
  for (const [options, expected] of [
    [
      { generatorVersion: 1, seed: 42, seedJumps: false },
      'custom-nightweir-v5-ea56e468',
    ],
    [
      { generatorVersion: 3, seed: 7, seedJumps: false },
      'custom-nightweir-v5-468038a7',
    ],
  ]) {
    const legacy = generateDocument(options);
    delete legacy.environment;
    const before = structuredClone(legacy);
    const migrated = validateDocument(legacy);
    assert.deepEqual(migrated.environment, {
      version: 1,
      seed: options.seed,
      layoutVersion: 0,
    });
    assert.deepEqual(migrated.points, before.points);
    assert.deepEqual(migrated.jumps, before.jumps);
    assert.deepEqual(migrated.settings, before.settings);
    assert.equal(documentIdentity(migrated), expected);
    assert.deepEqual(
      legacy,
      before,
      'migration does not edit the imported object',
    );
    assert.deepEqual(
      validateDocument(JSON.parse(JSON.stringify(migrated))),
      migrated,
    );
  }
});

test('new constructors choose regional environment data and validate independent seed versions strictly', () => {
  assert.equal(ENVIRONMENT_VERSION, 1);
  assert.equal(ENVIRONMENT_LAYOUT_VERSION, 4);
  const blank = createDocument({
    seed: 42,
    blank: true,
    environmentSeed: 9001,
  });
  assert.deepEqual(blank.environment, {
    version: 1,
    seed: 9001,
    layoutVersion: 4,
  });
  assert.equal(blank.generator.seed, 42);
  for (const generatorVersion of [1, 2, 3]) {
    const generated = generateDocument({
      generatorVersion,
      seed: 42,
      environmentSeed: 8,
    });
    assert.deepEqual(generated.environment, {
      version: 1,
      seed: 8,
      layoutVersion: 4,
    });
  }
  const source = structuredClone(blank);
  source.environment.untrusted = 'discard';
  assert.deepEqual(validateDocument(source), blank);
  const invalidEnvironments = [
    null,
    [],
    { version: 2, seed: 1, layoutVersion: 1 },
    { version: 1, seed: 1, layoutVersion: 5 },
    { version: 1, seed: 1, layoutVersion: '1' },
    ...[-1, 4294967296, 1.5, NaN, Infinity, '4'].map((seed) => ({
      version: 1,
      seed,
      layoutVersion: 1,
    })),
  ];
  for (const environment of invalidEnvironments) {
    assert.throws(() => validateDocument({ ...blank, environment }));
    assert.throws(() => createDocument({ blank: true, environment }));
  }
  const maximum = validateDocument({
    ...blank,
    environment: { version: 1, seed: 4294967295, layoutVersion: 0 },
  });
  assert.equal(maximum.environment.seed, 4294967295);
});

test('regional physical identity follows resolved road/environment data rather than pending road preferences', () => {
  const source = generateDocument({ seed: 7 });
  const expected = documentIdentity(source);
  assert.match(expected, /^custom-nightweir-v8-/);
  const preferences = structuredClone(source);
  Object.assign(preferences.generator, {
    seed: 1234,
    length: 20000,
    bendiness: 1,
    elevation: 0,
    crossovers: 1,
    jumpFrequency: 'many',
    jumpSize: 'large',
  });
  assert.equal(documentIdentity(preferences), expected);
  for (const change of [
    (doc) => {
      doc.environment.seed++;
    },
    (doc) => {
      doc.settings.density = 0.2;
    },
    (doc) => {
      doc.points[0].x += 5;
    },
    (doc) => {
      doc.environment.layoutVersion = 0;
    },
  ]) {
    const edited = structuredClone(source);
    change(edited);
    assert.notEqual(documentIdentity(edited), expected);
  }
});

test('saved layout3 records retain exact pre-rollout identities until explicit environment Apply', () => {
  for (const [biome, identity] of [
    ['nightweir', 'custom-nightweir-v7-dc3c0ff7'],
    ['shatterline', 'custom-shatterline-v7-123ccb88'],
    ['glasswake', 'custom-glasswake-v7-43f4568e'],
  ]) {
    const saved = generateDocument({
      biome,
      seed: 7,
      generatorVersion: 4,
      environment: { version: 1, seed: 7, layoutVersion: 3 },
    });
    const loaded = validateDocument(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(loaded, saved);
    assert.equal(documentIdentity(loaded), identity);
  }
});

test('road regeneration preserves supplied environment settings and seed in sync and yielding paths', async () => {
  const original = generateDocument({
    seed: 7,
    environmentSeed: 4294967295,
    sceneryPreset: 'industrial',
  });
  const before = structuredClone(original);
  const options = {
    ...original.generator,
    seed: 42,
    environment: original.environment,
    settings: original.settings,
    density: 0.01,
    waterLevel: -8,
    sceneryPreset: 'reclaimed',
  };
  const generated = generateDocument(options);
  const asynchronous = await generateDocumentAsync(options, {
    yieldControl: async () => {},
  });
  assert.deepEqual(generated, asynchronous);
  assert.deepEqual(generated.environment, original.environment);
  assert.deepEqual(generated.settings, original.settings);
  assert.equal(generated.generator.seed, 42);
  assert.notDeepEqual(generated.points, original.points);
  assert.deepEqual(original, before);
  generated.environment.seed = 4;
  generated.settings.density = 0.1;
  assert.deepEqual(
    original,
    before,
    'new road owns its environment/settings copies',
  );
  const legacyLayout = { version: 1, seed: 81, layoutVersion: 0 };
  for (const generatorVersion of [1, 2, 3]) {
    assert.deepEqual(
      generateDocument({ generatorVersion, environment: legacyLayout })
        .environment,
      legacyLayout,
    );
  }
});

test('all whole-course biomes validate their own presets without changing resolved road features', () => {
  const original = generateDocument({ seed: 7, length: 3000 });
  for (const biome of EDITOR_BIOMES) {
    const blank = createDocument({
      biome: biome.id,
      blank: true,
      environmentSeed: 91,
    });
    assert.equal(blank.biome, biome.id);
    assert.equal(blank.settings.sceneryPreset, biome.presets[0].id);
    assert.equal(blank.environment.seed, 91);
    for (const preset of biome.presets) {
      const changed = validateDocument({
        ...original,
        biome: biome.id,
        settings: {
          sceneryPreset: preset.id,
          density: preset.density,
          waterLevel: preset.waterLevel,
        },
      });
      assert.deepEqual(changed.points, original.points);
      assert.deepEqual(changed.jumps, original.jumps);
      assert.deepEqual(changed.pickups, original.pickups);
      assert.deepEqual(changed.generator, original.generator);
      assert.match(
        documentIdentity(changed),
        new RegExp(`^custom-${biome.id}-v8-`),
      );
      assert.deepEqual(
        validateDocument(JSON.parse(JSON.stringify(changed))),
        changed,
      );
    }
    for (const courseType of ['circuit', 'downhill']) {
      const generated = generateDocument({
        biome: biome.id,
        courseType,
        seed: 7,
        length: 3000,
        environmentSeed: 91,
      });
      assert.equal(generated.biome, biome.id);
      assert.deepEqual(generated.environment, {
        version: 1,
        seed: 91,
        layoutVersion: 4,
      });
      assert.equal(analyzeDocument(generated).valid, true, biome.id);
    }
  }
  const foreign = structuredClone(original);
  foreign.biome = 'orbital';
  assert.throws(() => validateDocument(foreign), /preset/);
  foreign.settings = {
    sceneryPreset: 'shipyard-v1',
    density: 0.72,
    waterLevel: -50,
  };
  foreign.environment.layoutVersion = 0;
  assert.throws(() => validateDocument(foreign), /legacy Nightweir/);
  for (const generatorVersion of [1, 2]) {
    const oldBuilder = generateDocument({
      biome: 'halcyon',
      generatorVersion,
      seed: 42,
    });
    assert.equal(oldBuilder.biome, 'halcyon');
    assert.equal(oldBuilder.settings.sceneryPreset, 'civic-v1');
  }
});
