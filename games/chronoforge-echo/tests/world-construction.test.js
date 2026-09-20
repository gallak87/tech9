import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/world-construction.js';
import { REGIONS, ALL_SCENES, getScene } from '../src/world.js';
import { HAVENTIDE_HALL } from '../src/haventide-interior-layout.js';

function objectReferences(value, refs = new Set()) {
  if (!value || typeof value !== 'object' || refs.has(value)) return refs;
  refs.add(value);
  for (const child of Object.values(value)) objectReferences(child, refs);
  return refs;
}

test('world construction is deterministic and owns all mutable scene data', () => {
  const first = buildWorld();
  const second = buildWorld();
  assert.deepEqual(first.ALL_SCENES, ALL_SCENES);
  assert.deepEqual(second, first);

  const firstRefs = objectReferences(first);
  for (const ref of objectReferences(second))
    assert.equal(
      firstRefs.has(ref),
      false,
      'builds must not share mutable data',
    );

  for (const [id, scene] of Object.entries(REGIONS)) {
    assert.equal(getScene(id), scene);
    assert.equal(ALL_SCENES[id], scene);
    assert.equal(first.REGIONS[id], first.ALL_SCENES[id]);
  }
  assert.throws(() => getScene('missing_scene'), /Unknown scene/);

  first.REGIONS.haventide.roads[0][0].x = -1;
  first.ALL_SCENES.haventide_town.objects.length = 0;
  first.ALL_SCENES.hav_cave.walkAreas[0].w = 0;
  assert.deepEqual(
    buildWorld(),
    second,
    'earlier builds cannot alter later builds',
  );
});

test('native routes and caves scale once while town layouts retain world units', () => {
  const { REGIONS: regions, ALL_SCENES: scenes } = buildWorld();
  assert.equal(regions.haventide.width, 5760);
  assert.equal(regions.haventide.height, 2520);
  assert.deepEqual(regions.haventide.roads[0][0], { x: 125, y: 1350 });
  assert.deepEqual(scenes.hav_cave.walkAreas[0], {
    x: 87.5,
    y: 750,
    w: 512.5,
    h: 312.5,
  });
  assert.deepEqual(scenes.hav_cave.spawn, { x: 250, y: 885 });
  assert.deepEqual(
    regions.haventide.objects.find((o) => o.to === 'hav_cave').spawn,
    scenes.hav_cave.spawn,
  );

  for (const scene of Object.values(scenes).filter((s) => s.kind === 'town')) {
    assert.deepEqual(scene.walkAreas[0], HAVENTIDE_HALL.floor, scene.id);
    const smith = scene.objects.find((o) => o.service === 'smith');
    const place = HAVENTIDE_HALL.services.smith;
    assert.deepEqual(
      { x: smith.x, y: smith.y, w: smith.w, h: smith.h },
      { x: place.x, y: place.y, w: place.w, h: place.h },
      scene.id,
    );
  }
});
