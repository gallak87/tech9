import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  coastRadius,
  islandHeight,
  isNavigable,
  GATES,
  START,
  ROCKS,
  DOCK_PARTS,
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
  for (const rock of ROCKS) assert.equal(isNavigable(rock.x, rock.z), false);
  for (const dock of DOCK_PARTS)
    assert.equal(isNavigable(dock.x, dock.z), false);
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    assert.ok(isNavigable(Math.cos(a) * 112, Math.sin(a) * 112));
  }
  assert.equal(isNavigable(260, 0), false);
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
