import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
  ShaderLib,
  UniformsUtils,
} from 'three';
import { createInductionSweep } from './induction-sweep.js';
import { LATTICE_GAPS, LATTICE_RIB_SPACING } from './lattice.js';
import { fullRoadNeonMaterial } from './materials.js';
import { createMovingLattice } from './moving-lattice.js';

const lapLength = 4500;
const gapCentres = LATTICE_GAPS.map(([left, right]) => (left + right) / 2);

function frame(mode, time, reducedMotion = false) {
  return { mode, time, settings: { reducedMotion } };
}

function advance(lattice, seconds) {
  const ticks = Math.ceil(seconds / 0.05);
  for (let tick = 0; tick <= ticks; tick++) {
    const time = (tick / ticks) * seconds;
    lattice.update(frame('racing', time), time);
  }
}

function compile(material, source) {
  const shader = { ...source, uniforms: UniformsUtils.clone(source.uniforms) };
  material.onBeforeCompile(shader, null);
  return shader;
}

test('the moving opening wraps and leaves its runners and transverse ribs solid', () => {
  const lattice = createMovingLattice(lapLength, [], []);
  for (const distance of [210 - lapLength, 210, 210 + lapLength]) {
    for (const lateral of gapCentres)
      assert.equal(lattice.coverage(distance, lateral), 0);
    for (const lateral of [-13, -4.8, 4.8, 13])
      assert.equal(lattice.coverage(distance, lateral), 1);
  }

  const ribPitch = lapLength / Math.round(lapLength / LATTICE_RIB_SPACING);
  for (const lateral of gapCentres) {
    assert.equal(lattice.coverage(6 * ribPitch, lateral), 1);
    assert.equal(lattice.coverage(6 * ribPitch + 2, lateral), 0);
  }

  advance(lattice, 0.9);
  for (const lateral of gapCentres) {
    assert.equal(lattice.coverage(210, lateral), 1, 'the old opening closed');
    assert.equal(lattice.coverage(367, lateral), 0, 'the window moved ahead');
  }
});

test('the start, devices, and permanent spans are excluded from the travelling cutout', (t) => {
  const unrestricted = createMovingLattice(lapLength, [], []);
  const protectedRoad = createMovingLattice(
    lapLength,
    [{ distance: 233, length: 20 }],
    [{ start: 172, end: 205 }],
  );
  for (const station of [185, 198, 228, 240]) {
    assert.equal(unrestricted.coverage(station, 0), 0);
    assert.equal(protectedRoad.coverage(station, 0), 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'roadCoord',
    new Float32BufferAttribute([6, 0, 185, 0, 228, 0, 275, 0], 2),
  );
  t.after(() => geometry.dispose());
  assert.equal(protectedRoad.prepare(geometry), geometry);
  assert.deepEqual(
    Array.from(geometry.attributes.latticeAvailable.array),
    [0, 0, 0, 1],
  );

  // Move the centre of the next travelling window through the lap seam.
  advance(protectedRoad, 2.5);
  for (const station of [6 - lapLength, 6, 6 + lapLength])
    assert.equal(protectedRoad.coverage(station, 0), 1);
  const period = lapLength / Math.round(lapLength / 640);
  assert.equal(protectedRoad.coverage(period + 6, 0), 0);
});

test('deck, walls, and shadow depth share the live lattice phase', (t) => {
  const lattice = createMovingLattice(lapLength, [], []);
  const base = new MeshStandardMaterial();
  const deck = fullRoadNeonMaterial(base);
  createInductionSweep(lapLength).bind(deck, { deck: true, uvScale: 12 });
  const visibleShell = new MeshStandardMaterial();
  const depthShell = new MeshDepthMaterial();
  const wall = new MeshStandardMaterial();
  t.after(() => {
    for (const material of [base, deck, visibleShell, depthShell, wall])
      material.dispose();
  });

  lattice.bind(deck, 'road');
  lattice.bind(visibleShell, 'shell');
  lattice.bind(depthShell, 'shell');
  lattice.bind(wall, 'wall');
  const deckShader = compile(deck, ShaderLib.standard);
  const visibleShader = compile(visibleShell, ShaderLib.standard);
  const depthShader = compile(depthShell, ShaderLib.depth);
  const wallShader = compile(wall, ShaderLib.standard);
  const phase = deckShader.uniforms.orbitalLatticePhase;
  for (const shader of [deckShader, visibleShader, depthShader, wallShader]) {
    assert.equal(shader.uniforms.orbitalLatticePhase, phase);
    assert.match(
      shader.vertexShader,
      /vLattice = vec3\(roadCoord, latticeAvailable\)/,
    );
    assert.match(shader.fragmentShader, /orbitalAperture/);
  }
  for (const shader of [visibleShader, depthShader])
    assert.match(
      shader.fragmentShader,
      /if \(orbitalWindow > 0\.02\) discard;/,
    );
  assert.match(
    deckShader.fragmentShader,
    /orbitalRib\(vLattice\.x\).*discard;/s,
  );
  assert.match(wallShader.vertexShader, /transformed \+= latticeWallShift \*/);

  const initial = phase.value;
  advance(lattice, 0.1);
  assert.notEqual(phase.value, initial);
  assert.equal(
    compile(depthShell, ShaderLib.depth).uniforms.orbitalLatticePhase,
    phase,
  );
});

test('pause, inspection and Reduced Motion retain the aperture phase without a catch-up jump', (t) => {
  const lattice = createMovingLattice(lapLength, [], []);
  const material = new MeshStandardMaterial();
  t.after(() => material.dispose());
  lattice.bind(material, 'shell');
  const { orbitalLatticePhase: phase } = compile(
    material,
    ShaderLib.standard,
  ).uniforms;
  advance(lattice, 0.1);
  const held = phase.value;

  lattice.update(frame('paused', 0.1), 2);
  lattice.update(frame('fly', 0.1), 3);
  lattice.update(frame('racing', 2, true), 4);
  lattice.update(frame('racing', 2), 4);
  assert.equal(phase.value, held);
  lattice.update(frame('racing', 2.05), 4.05);
  assert.notEqual(phase.value, held);
});
