import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VESSELS } from '../src/game/vessels.js';
import {
  coastRadius,
  islandHeight,
  isNavigable,
  GATES,
  START,
  ROCKS,
  DOCK_PARTS,
  DOCK_ZONE,
} from '../src/world/islandDefinition.js';

test('ocean surrounds a dry roughly 160m island with a single consistent coast', () => {
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2,
      r = coastRadius(a),
      x = Math.cos(a),
      z = Math.sin(a);
    assert.ok(r > 65 && r < 90);
    assert.ok(Math.abs(islandHeight(x * r, z * r)) < 1e-8);
    assert.ok(islandHeight(x * (r - 4), z * (r - 4)) > 0);
    assert.ok(islandHeight(x * (r + 4), z * (r + 4)) < 0);
    assert.equal(isNavigable(x * (r - 2), z * (r - 2)), false);
  }
  assert.ok(isNavigable(START.x, START.z));
  for (const gate of GATES) assert.ok(isNavigable(gate.x, gate.z));
});
test('rendered obstacle definitions block boat centres and leave a safe course corridor', () => {
  for (const vessel of VESSELS) {
    for (const rock of ROCKS) assert.equal(isNavigable(rock.x, rock.z), false);
    for (const dock of DOCK_PARTS)
      assert.equal(isNavigable(dock.x, dock.z), false);
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      assert.ok(
        isNavigable(Math.cos(a) * 116, Math.sin(a) * 116, vessel.footprint),
        `${vessel.id} has a complete open course including the outer jetty approach`,
      );
    }
    assert.ok(isNavigable(START.x, START.z, vessel.footprint));
    assert.ok(isNavigable(DOCK_ZONE.x, DOCK_ZONE.z, vessel.footprint));
    for (let offset = 0; offset <= 30; offset += 0.5)
      assert.ok(
        isNavigable(START.x + offset, START.z, vessel.footprint),
        `${vessel.id} has a clear departure and return lane`,
      );
  }
  assert.equal(isNavigable(260, 0), false);
});

test('shared ship footprints contain each complete hull rectangle', () => {
  assert.ok(Object.isFrozen(VESSELS));
  for (const vessel of VESSELS) {
    assert.ok(Object.isFrozen(vessel));
    assert.ok(
      vessel.footprint >= Math.hypot(vessel.length / 2, vessel.beam / 2),
    );
  }
});
test('ocean reuses the owned promoted reflection engine and explicitly replaces pond shelf shading', () => {
  const source = readFileSync(
    new URL('../src/world/OceanLayer.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /capabilities\/pond-water\/src\/WaterSurface.js/);
  assert.match(source, /shape.holes.push/);
  assert.match(source, /fragmentShader.replace/);
  assert.match(source, /water\?\.dispose/);
  assert.match(source, /normals\?\.dispose/);
});

test('navigable centres keep the entire boat footprint outside scalloped land', () => {
  for (const vessel of VESSELS) {
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      let radius = coastRadius(a) + vessel.footprint;
      while (
        !isNavigable(
          Math.cos(a) * radius,
          Math.sin(a) * radius,
          vessel.footprint,
        ) &&
        radius < 150
      )
        radius += 0.2;
      const x = Math.cos(a) * radius,
        z = Math.sin(a) * radius;
      assert.ok(radius < 150, `${vessel.id} finds a clear coast approach`);
      for (let j = 0; j < 96; j++) {
        const h = (j / 96) * Math.PI * 2;
        assert.ok(
          islandHeight(
            x + Math.cos(h) * vessel.footprint,
            z + Math.sin(h) * vessel.footprint,
          ) <= 0,
          `${vessel.id} footprint remains outside the coast at angle ${a}`,
        );
      }
    }
  }
});
