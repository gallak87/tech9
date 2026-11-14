import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument,
  validateDocument,
  analyzeDocument,
  documentIdentity,
  applySectionShape,
  addCorkscrew,
  addJump,
  setCourseType,
} from './document.js';

const plainDocument = (options = {}) =>
  generateDocument({ seedJumps: false, ...options });

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
  assert.throws(
    () =>
      applySectionShape(plainDocument(), {
        startIndex: 0,
        endIndex: 1,
        angle: Math.PI * 1.5,
      }),
    /longer section/,
  );
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

test('short rotation chunks reject crowded subdivisions and supported short connections remain playable', () => {
  assert.throws(
    () =>
      applySectionShape(plainDocument({ length: 1800 }), {
        startIndex: 0,
        endIndex: 1,
        angle: Math.PI / 2,
      }),
    /128 m/,
  );
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
