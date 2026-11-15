import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan } from './region-plan.js';
import { createBiomeEnvironment } from './biome-environment.js';
import { EDITOR_BIOMES } from './biomes.js';
import { createRouteClearance } from '../environment/placement.js';
const base = generateDocument({ seed: 42, length: 3000 });
const catalog = EDITOR_BIOMES.filter((b) => b.id !== 'nightweir');
function documentFor(biome, source = base) {
  return {
    ...source,
    biome: biome.id,
    settings: {
      ...source.settings,
      sceneryPreset: biome.presets[0].id,
      density: biome.presets[0].density,
      waterLevel: biome.presets[0].waterLevel,
    },
  };
}
function signature(part) {
  const hash = createHash('sha256');
  part.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    hash.update(mesh.name);
    for (const name of ['position', 'normal']) {
      const a = mesh.geometry.getAttribute(name);
      if (a)
        hash.update(
          Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength),
        );
    }
    if (mesh.geometry.index) {
      const a = mesh.geometry.index.array;
      hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    if (mesh.isInstancedMesh) {
      const a = mesh.instanceMatrix.array;
      hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return hash.digest('hex');
}
test('every registered additional biome owns a distinct actual regional kit and bounded geometry', () => {
  const signatures = new Set(),
    features = new Set();
  for (const biome of catalog) {
    const d = documentFor(biome),
      track = createEditorTrack(d),
      part = createBiomeEnvironment(d, track, { preview: true });
    let triangles = 0,
      meshes = 0;
    part.group.traverse((m) => {
      if (m.isMesh) {
        meshes++;
        triangles +=
          ((m.geometry.index?.count ??
            m.geometry.getAttribute('position').count) /
            3) *
          (m.isInstancedMesh ? m.count : 1);
      }
    });
    assert(part.group.userData.region.assemblies > 15, biome.id);
    if (['nacre', 'vesper-forest', 'glasswake'].includes(biome.id))
      assert.equal(
        part.group.userData.region.quays,
        0,
        'natural banks do not inherit municipal retaining rings',
      );
    assert(meshes < 48, biome.id);
    assert(triangles < 350000, biome.id);
    assert(
      part.group.userData.region.near <= 64 &&
        part.group.userData.region.mid <= 144,
      biome.id,
    );
    signatures.add(signature(part));
    Object.keys(part.group.userData.region.features).forEach((key) =>
      features.add(key),
    );
    const geometries = [...part.geometries],
      materials = [...part.materials];
    let g = 0,
      m = 0;
    geometries.forEach((v) => v.addEventListener('dispose', () => g++));
    materials.forEach((v) => v.addEventListener('dispose', () => m++));
    part.dispose();
    part.dispose();
    assert.equal(g, geometries.length);
    assert.equal(m, materials.length);
    assert.equal(part.group.children.length, 0);
  }
  assert.equal(signatures.size, catalog.length);
  assert.equal(
    features.size,
    catalog.length,
    'architecture is geometry-specific, not only recolored',
  );
});
test('terrain-free biomes use founded floating geometry and atomic actual-kit corridor clearances', () => {
  for (const id of ['orbital', 'zephyr', 'helion', 'umbra', 'ravel']) {
    const biome = catalog.find((b) => b.id === id),
      d = documentFor(biome),
      track = createEditorTrack(d),
      plan = createRegionPlan(d, track),
      part = createBiomeEnvironment(d, track, { plan });
    assert.equal(part.group.userData.region.terrainStyle, 'floating-regions');
    assert.equal(part.group.userData.region.terrainMeshes, 0);
    const { clears } = createRouteClearance(track, {
      spacing: 8,
      sidePadding: 24,
      localVertical: [-18, 38],
    });
    for (const p of part.group.userData.regionalPlacements) {
      const a = p.bounds.min,
        b = p.bounds.max;
      assert(
        clears(
          (a[0] + b[0]) / 2,
          (a[2] + b[2]) / 2,
          b[0] - a[0],
          b[2] - a[2],
          b[1],
          0,
          a[1],
        ),
        id,
      );
    }
    part.dispose();
  }
});
test('long whole-course biome builds remain deterministic with collision collected from the same visible geometry', () => {
  const long = generateDocument({ seed: 7, length: 20000, crossovers: 1 });
  for (const id of [
    'vesper-forest',
    'glasswake',
    'orbital',
    'zephyr',
    'colossus',
  ]) {
    const biome = catalog.find((b) => b.id === id),
      d = documentFor(biome, long),
      track = createEditorTrack(d),
      plan = createRegionPlan(d, track),
      solids = [];
    const one = createBiomeEnvironment(d, track, {
        plan,
        collectSolid: (s) => solids.push(s),
      }),
      two = createBiomeEnvironment(d, track, { plan });
    assert.equal(signature(one), signature(two), id);
    assert(one.group.userData.region.assemblies > 30, id);
    const visible = new Set();
    one.group.traverse((m) => {
      if (m.isMesh) visible.add(m.geometry);
    });
    assert(solids.length > 0);
    assert(
      solids.every(
        (s) => visible.has(s.geometry) || one.geometries.has(s.geometry),
      ),
      'collision borrows the generated rendered source geometry',
    );
    let triangles = 0;
    one.group.traverse((m) => {
      if (m.isMesh)
        triangles +=
          ((m.geometry.index?.count ??
            m.geometry.getAttribute('position').count) /
            3) *
          (m.isInstancedMesh ? m.count : 1);
    });
    assert(triangles < 650000, id + ' ' + triangles);
    one.dispose();
    two.dispose();
  }
});

test('grounded dry worlds extend an exact two-triangle collision horizon beneath their tapered survey', () => {
  for (const biome of catalog.filter(
    (b) => !b.environment.waterEnabled && !b.road.suspended,
  )) {
    const d = documentFor(biome),
      track = createEditorTrack(d),
      plan = createRegionPlan(d, track),
      solids = [],
      part = createBiomeEnvironment(d, track, {
        plan,
        collectSolid: (s) => solids.push(s),
      });
    const mesh = part.group.children.find((m) => m.userData.regionFarGround);
    assert(mesh, biome.id);
    assert.equal(mesh.geometry.index.count, 6);
    assert(
      solids.some((s) => s.geometry === mesh.geometry && s.kind === 'terrain'),
    );
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      assert(Math.abs(positions.getY(i) - (plan.seaLevel - 28)) < 0.001);
    assert(
      Math.min(...plan.terrain.heights.slice(0, plan.terrain.nx + 1)) >
        plan.seaLevel - 28,
      'the horizon stays below the tapered outer edge',
    );
    part.dispose();
  }
});
