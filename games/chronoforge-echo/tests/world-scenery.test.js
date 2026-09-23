import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS,
  ALL_SCENES,
  isWalkable,
  safeArrival,
  distanceToRoad,
} from '../src/world.js';
import { GLACIER_WOLF_ART } from '../src/mid-enemy-frames.js';
import {
  sceneryBounds,
  sceneryOcclusionBounds,
  footprintBlocks,
} from '../src/world-scenery.js';
import {
  WORLD_DETAIL_ASSETS,
  worldDetailBounds,
} from '../src/world-detail-art.js';
import { CAVE_ASSETS, CAVE_BIOMES, caveArtFrame } from '../src/cave-art.js';
import { ASSET_MANIFEST, keyNeutralExterior } from '../src/assets.js';
import { readPngPixels } from './png-pixels.js';

test('purpose-built landmarks retain sufficient source detail at the 2x presentation scale', () => {
  for (const s of Object.values(REGIONS))
    for (const o of s.objects) {
      const entry = WORLD_DETAIL_ASSETS.find(
        (a) =>
          a.kind === 'structure' &&
          (a.metadata.objectId === o.id ||
            (a.metadata.style && a.metadata.style === o.style)),
      );
      if (!entry) continue;
      const f = entry.metadata.frames[0],
        b = worldDetailBounds(o, s.biome);
      assert.ok(f.h >= b.height * 2, o.id + ' must not magnify a small prop');
      assert.ok(
        Math.abs(b.width / b.height - f.w / f.h) < 1e-10,
        o.id + ' aspect ratio',
      );
    }
});

test('large landmarks leave authored interactions and neighboring ruins visible', () => {
  for (const s of Object.values(REGIONS))
    for (const o of s.objects.filter(
      (o) => o.type === 'landmark' && !o.building && !o.portalScenery,
    )) {
      const b = sceneryBounds(o, s.biome);
      if (!b) continue;
      for (const p of s.objects.filter(
        (p) =>
          p.id !== o.id &&
          ['console', 'encounter', 'town', 'cave', 'house', 'ruin'].includes(
            p.type,
          ),
      )) {
        const covered =
          p.y < o.y &&
          p.y > b.top + 10 &&
          p.x > b.left + 10 &&
          p.x < b.left + b.width - 10;
        assert.equal(covered, false, `${o.id} obscures ${p.id}`);
      }
    }
  const orbital = REGIONS.orbital_reach;
  assert.deepEqual(
    orbital.objects
      .filter((o) => ['orbital_lift', 'orbital_cave_door'].includes(o.id))
      .map((o) => [o.id, o.x, o.y]),
    [
      ['orbital_lift', 2875, 1187.5],
      ['orbital_cave_door', 3437.5, 1900],
    ],
  );
});

test('Frost Canyon wolves stand on a clear road with their full silhouette visible', () => {
  const scene = REGIONS.frost_canyon,
    enemy = scene.objects.find((o) => o.id === 'frost_entry');
  assert.deepEqual(enemy.enemies, ['glacier_wolf', 'glacier_wolf']);
  assert.ok(distanceToRoad(scene, enemy.x, enemy.y) < 15);
  for (const [dx, dy] of [
    [0, 0],
    [24, 0],
    [-24, 0],
    [0, 24],
    [0, -24],
  ])
    assert.ok(isWalkable(scene, enemy.x + dx, enemy.y + dy), 'open approach');
  const frame = GLACIER_WOLF_ART.frames[0],
    scale = GLACIER_WOLF_ART.pixelScale * 0.85;
  const left = enemy.x - frame.anchorX * scale - 16,
    top = enemy.y - frame.anchorY * scale - 16;
  const right = left + frame.w * scale + 32,
    bottom = enemy.y + 28;
  for (const object of scene.objects.filter(
    (o) => ['tree', 'ruin', 'landmark'].includes(o.type) && o.y > enemy.y,
  )) {
    const b = sceneryBounds(object, scene.biome);
    if (!b) continue;
    assert.equal(
      b.left < right &&
        b.left + b.width > left &&
        b.top < bottom &&
        b.top + b.height > top,
      false,
      object.id + ' hides the encounter',
    );
  }
});

test('portal marker bases collide beside the route, and the portal itself stays open', () => {
  for (const s of Object.values(REGIONS))
    for (const portal of s.portals) {
      assert.equal(portal.sceneryInstalled, true, portal.id);
      assert.ok(isWalkable(s, portal.x, portal.y), portal.id + ' center');
      for (const id of [portal.id + '_marker', portal.id + '_stone']) {
        const o = s.objects.find((o) => o.id === id),
          f = o.footprints[0],
          x = o.x + f.x + f.w / 2,
          y = o.y + f.y + f.h / 2;
        assert.ok(footprintBlocks(o, x, y), id);
        assert.equal(isWalkable(s, x, y), false, id + ' solid base');
      }
    }
});

test('ruin pillars and cave rock cheeks block feet while their openings remain usable', () => {
  for (const s of Object.values(REGIONS))
    for (const o of s.objects.filter(
      (o) => o.type === 'ruin' || o.style === 'arch' || o.type === 'cave',
    )) {
      assert.equal(footprintBlocks(o, o.x, o.y - 12), false, o.id + ' opening');
      for (const f of o.footprints) {
        assert.ok(
          footprintBlocks(o, o.x + f.x + f.w / 2, o.y + f.y + f.h / 2),
          o.id + ' grounded solid',
        );
      }
    }
  // A narrow trunk collider does not seal off the overhead tree canopy.
  const pine = REGIONS.orbital_reach.objects.find(
    (o) => o.id === 'orbital_entry_pine',
  );
  assert.equal(footprintBlocks(pine, pine.x, pine.y - 130), false);
  assert.ok(footprintBlocks(pine, pine.x, pine.y - 12));
});

test('Forest Veil aqueduct straddles the road with a clear approach through both pillars', () => {
  const scene = REGIONS.forest_veil;
  const arch = scene.objects.find((o) => o.id === 'forest_arch');
  const route = scene.roads.flatMap((road) =>
    road.slice(1).map((b, i) => [road[i], b]),
  );
  const [a, b] = route.find(
    ([a, b]) =>
      a.y < arch.y &&
      b.y > arch.y &&
      Math.abs(a.x - arch.x) < 20 &&
      Math.abs(b.x - arch.x) < 20,
  );
  // Sample the whole road width on both sides of the threshold. The shared
  // walkability predicate includes the player's padding and all other props.
  for (let y = arch.y - 120; y <= arch.y + 120; y += 4) {
    const x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    for (const offset of [-34, 0, 34]) {
      assert.ok(distanceToRoad(scene, x + offset, y) < 35, 'stay on the road');
      assert.ok(
        isWalkable(scene, x + offset, y),
        `open road at ${x + offset},${y}`,
      );
    }
  }
  assert.equal(arch.footprints.length, 2);
  for (const f of arch.footprints)
    assert.equal(
      isWalkable(scene, arch.x + f.x + f.w / 2, arch.y + f.y + f.h / 2),
      false,
      'pillars stay solid',
    );

  // The former east–west river crossing is also unobstructed.
  const [west, east] = route.find(
    ([a, b]) => a.x < 3525 && b.x > 3525 && a.y > 1400 && b.y < 1550,
  );
  for (let x = 3300; x <= 3690; x += 5) {
    const y = west.y + ((east.y - west.y) * (x - west.x)) / (east.x - west.x);
    assert.ok(isWalkable(scene, x, y), `open river crossing at ${x},${y}`);
  }
});

test('all original region/house/cave/town arrivals remain safe after scenery changes', () => {
  for (const scene of Object.values(ALL_SCENES)) {
    assert.ok(
      isWalkable(scene, scene.spawn.x, scene.spawn.y),
      scene.id + ' initial spawn',
    );
    for (const o of [...scene.portals, ...scene.objects].filter((o) => o.to)) {
      const target = ALL_SCENES[o.to];
      assert.ok(
        isWalkable(target, o.spawn.x, o.spawn.y),
        o.id + ' destination',
      );
      assert.deepEqual(
        safeArrival(target, o.spawn.x, o.spawn.y),
        o.spawn,
        o.id + ' does not move valid arrivals',
      );
    }
  }
});

function reachableGrid(scene) {
  const step = 20,
    cols = Math.ceil(scene.width / step),
    rows = Math.ceil(scene.height / step),
    seen = new Uint8Array(cols * rows),
    walk = new Uint8Array(cols * rows),
    queue = [];
  const point = (i) => ({
    x: (i % cols) * step + step / 2,
    y: Math.floor(i / cols) * step + step / 2,
  });
  let start = 0,
    best = Infinity;
  for (let i = 0; i < walk.length; i++) {
    const p = point(i);
    walk[i] = isWalkable(scene, p.x, p.y) ? 1 : 0;
    const d = (p.x - scene.spawn.x) ** 2 + (p.y - scene.spawn.y) ** 2;
    if (walk[i] && d < best) {
      best = d;
      start = i;
    }
  }
  seen[start] = 1;
  queue.push(start);
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h],
      x = i % cols,
      y = Math.floor(i / cols);
    for (const j of [
      x ? i - 1 : -1,
      x < cols - 1 ? i + 1 : -1,
      y ? i - cols : -1,
      y < rows - 1 ? i + cols : -1,
    ])
      if (j >= 0 && !seen[j] && walk[j]) {
        seen[j] = 1;
        queue.push(j);
      }
  }
  return (o) => {
    const radius = ['town', 'house', 'cave'].includes(o.type)
      ? 112
      : o.type === 'portal'
        ? 60
        : 64;
    const cx = Math.floor(o.x / step),
      cy = Math.floor(o.y / step),
      n = Math.ceil(radius / step);
    for (let y = Math.max(0, cy - n); y <= Math.min(rows - 1, cy + n); y++)
      for (let x = Math.max(0, cx - n); x <= Math.min(cols - 1, cx + n); x++) {
        const i = y * cols + x,
          p = point(i);
        if (seen[i] && Math.hypot(p.x - o.x, p.y - o.y) <= radius) return true;
      }
    return false;
  };
}

test('all eight worlds and cave branches retain routes to every exit, service, story, encounter and pickup', () => {
  for (const s of Object.values(ALL_SCENES).filter(
    (s) => !s.interior || s.kind === 'cave',
  )) {
    const reachable = reachableGrid(s);
    for (const o of [
      ...s.portals,
      ...s.objects.filter((o) =>
        [
          'console',
          'npc',
          'town',
          'house',
          'cave',
          'encounter',
          'camp',
          'pickup',
        ].includes(o.type),
      ),
    ])
      assert.ok(reachable(o), `${s.id}: ${o.id}`);
  }
});

test('every cave has a regional entrance, exit, field station and opaque floor material', () => {
  for (const biome of CAVE_BIOMES)
    for (const part of ['entrance', 'exit', 'station'])
      assert.ok(caveArtFrame(biome, part), biome + ' ' + part);
  assert.deepEqual(
    CAVE_ASSETS.find((a) => a.kind === 'caveFloor').metadata.frames.map(
      (f) => f.biome,
    ),
    CAVE_BIOMES,
  );
  for (const scene of Object.values(ALL_SCENES).filter(
    (s) => s.kind === 'cave',
  )) {
    for (const o of scene.objects.filter(
      (o) => o.fieldRecord || o.style === 'interior_supply',
    ))
      assert.ok(o.solid && o.footprints?.length, o.id);
  }
});

test('cave exits have independent transparent sources and grounded threshold anchors', () => {
  const exits = CAVE_ASSETS.filter((entry) => entry.kind === 'caveExit');
  assert.equal(
    new Set(exits.map((entry) => entry.source)).size,
    CAVE_BIOMES.length,
  );
  assert.deepEqual(
    exits
      .flatMap((entry) => entry.metadata.frames.map((frame) => frame.biome))
      .sort(),
    [...CAVE_BIOMES].sort(),
  );
  for (const entry of exits) {
    assert.equal(entry.required, true);
    assert.equal(entry.metadata.preserveSourceAlpha, true);
    assert.ok(!entry.key, entry.id + ' must retain its generated transparency');
    const frame = entry.metadata.frames[0],
      image = readPngPixels(
        new URL('../public/' + entry.source, import.meta.url),
      );
    assert.ok(frame.anchorX > 0 && frame.anchorX < frame.w, entry.id);
    assert.ok(frame.anchorY > 0 && frame.anchorY < frame.h, entry.id);
    let transparent = 0,
      opaque = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] === 0) transparent++;
      if (image.data[i] >= 250) opaque++;
    }
    assert.ok(
      transparent > image.width * image.height * 0.1,
      entry.id + ' clear surround',
    );
    assert.ok(
      opaque > image.width * image.height * 0.1,
      entry.id + ' solid passage',
    );
  }
  for (const scene of Object.values(ALL_SCENES).filter(
    (scene) => scene.kind === 'cave',
  )) {
    assert.ok(caveArtFrame(scene.biome, 'exit'), scene.id + ' exit art');
    for (const portal of scene.portals)
      assert.ok(
        isWalkable(scene, portal.x, portal.y),
        portal.id + ' open threshold',
      );
  }
});

test('authoring extraction and prepared alpha remove exterior air while retaining dark tunnel mouths', () => {
  for (const entry of [...WORLD_DETAIL_ASSETS, ...CAVE_ASSETS].filter(
    (a) => a.key,
  )) {
    const runtime = ASSET_MANIFEST.find((asset) => asset.id === entry.id),
      image = readPngPixels(
        new URL('../' + runtime.authoring.url, import.meta.url),
      ),
      prepared = readPngPixels(
        new URL('../public/' + runtime.url, import.meta.url),
      );
    assert.equal(runtime.key, undefined);
    assert.equal(prepared.width, image.width);
    assert.equal(prepared.height, image.height);
    const context = { getImageData: () => image, putImageData: () => {} };
    keyNeutralExterior(context, image.width, image.height, {
      ...runtime,
      ...runtime.authoring,
    });
    for (const pixels of [image, prepared]) {
      assert.equal(pixels.data[3], 0, entry.id + ' exterior');
      for (const [x, y] of entry.backgroundSeeds) {
        const i = (y * image.width + x) * 4,
          colors = image.data.subarray(i, i + 3);
        if (
          Math.min(...colors) >= 175 &&
          Math.max(...colors) - Math.min(...colors) < 16
        )
          assert.equal(pixels.data[i + 3], 0, entry.id + ' enclosed air');
      }
      for (const f of entry.metadata.frames.filter(
        (f) => f.part === 'entrance',
      )) {
        // The actual dark recess is deliberately opaque, unlike the former arch.
        const x = Math.round(f.x + f.w * 0.53),
          y = Math.round(f.y + f.h * 0.65);
        assert.equal(
          pixels.data[(y * image.width + x) * 4 + 3],
          255,
          f.biome + ' cave mouth',
        );
      }
    }
  }
});

test('First Gardener extraction and prepared alpha clear tinted checkerboard and preserve highlights', () => {
  const entry = ASSET_MANIFEST.find((asset) => asset.id === 'first_gardener');
  const image = readPngPixels(
    new URL('../' + entry.authoring.url, import.meta.url),
  );
  const prepared = readPngPixels(
    new URL('../public/' + entry.url, import.meta.url),
  );
  const original = image.data.slice();
  assert.equal(entry.key, undefined);
  assert.equal(prepared.width, image.width);
  assert.equal(prepared.height, image.height);
  keyNeutralExterior(
    { getImageData: () => image, putImageData: () => {} },
    image.width,
    image.height,
    { ...entry, ...entry.authoring },
  );
  for (const pixels of [image, prepared]) {
    for (const [x, y] of [
      [590, 485],
      [680, 460],
      [697, 425],
      [685, 380],
    ]) {
      assert.equal(
        pixels.data[(y * image.width + x) * 4 + 3],
        0,
        `checker at ${x},${y}`,
      );
    }
    // White-hot core, gold tip, purple pendant, ring and ivory stone.
    for (const [x, y] of [
      [627, 420],
      [627, 340],
      [625, 510],
      [475, 410],
      [620, 265],
    ]) {
      const i = (y * image.width + x) * 4;
      assert.deepEqual(
        pixels.data.slice(i, i + 4),
        original.slice(i, i + 4),
        `art at ${x},${y}`,
      );
      assert.equal(pixels.data[i + 3], 255);
    }
  }
});

test('field stations and solid world props occlude behind their bases without changing town rendering', () => {
  for (const s of Object.values(ALL_SCENES).filter((s) => s.kind === 'cave')) {
    for (const o of s.objects.filter(
      (o) => o.fieldRecord || o.style === 'interior_supply',
    )) {
      const b = sceneryOcclusionBounds(s, o);
      assert.ok(
        b && b.top < o.y - 60 && b.left < o.x && b.left + b.width > o.x,
        o.id + ' upper silhouette',
      );
      assert.equal(
        footprintBlocks(o, o.x, b.top + 5),
        false,
        o.id + ' overhead art is not a full-height collider',
      );
      assert.equal(
        sceneryOcclusionBounds({ ...s, kind: 'town' }, o),
        null,
        o.id + ' town renderer unchanged',
      );
    }
  }
  const s = REGIONS.orbital_reach;
  for (const type of ['rock', 'console', 'sign', 'camp']) {
    const b = sceneryOcclusionBounds(s, { type, x: 500, y: 500 });
    assert.ok(
      b && b.top < 460 && b.left < 500 && b.left + b.width > 500,
      type + ' foreground shape',
    );
  }
});
