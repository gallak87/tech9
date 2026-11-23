import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  ShaderLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { createDeckFinish } from './deck-finish.js';
import { createInductionSweep } from './induction-sweep.js';
import {
  createMovingLatticeSurfaces,
  LATTICE_GAPS,
  LATTICE_RIB_SPACING,
} from './lattice.js';
import { fullRoadNeonMaterial } from './materials.js';
import { createMovingLattice } from './moving-lattice.js';

const lapLength = 4500;
const track = { length: lapLength, width: 28, closed: true };
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
  const lattice = createMovingLattice(track);
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
  const unrestricted = createMovingLattice(track);
  const protectedRoad = createMovingLattice(track, {
    protectedSpans: [
      { start: 218, end: 248 },
      { start: 172, end: 205 },
    ],
  });
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
  const lattice = createMovingLattice(track);
  const base = new MeshStandardMaterial();
  const deck = fullRoadNeonMaterial(base);
  createInductionSweep(lapLength).bind(deck, { deck: true, uvScale: 12 });
  const visibleShell = new MeshStandardMaterial();
  const depthShell = new MeshDepthMaterial();
  const wall = new MeshStandardMaterial();
  const editorDeck = new MeshStandardMaterial();
  const deckGeometry = new BufferGeometry();
  deckGeometry.setAttribute(
    'roadCoord',
    new Float32BufferAttribute([210, 0], 2),
  );
  const editorMesh = new Mesh(deckGeometry, editorDeck);
  editorMesh.castShadow = true;
  const depthDeck = lattice.bindMesh(editorMesh, 'road');
  lattice.bind(editorDeck, 'road');
  const editorFinish = createDeckFinish(null);
  editorFinish.bind(editorDeck);
  t.after(() => {
    for (const material of [
      base,
      deck,
      visibleShell,
      depthShell,
      wall,
      editorDeck,
      depthDeck,
    ])
      material.dispose();
    deckGeometry.dispose();
    editorFinish.dispose();
  });

  lattice.bind(deck, 'road', { roadNeon: true });
  lattice.bind(visibleShell, 'shell');
  lattice.bind(depthShell, 'shell');
  lattice.bind(wall, 'wall');
  const deckShader = compile(deck, ShaderLib.standard);
  const visibleShader = compile(visibleShell, ShaderLib.standard);
  const depthShader = compile(depthShell, ShaderLib.depth);
  const wallShader = compile(wall, ShaderLib.standard);
  const editorDeckShader = compile(editorDeck, ShaderLib.standard);
  const depthDeckShader = compile(depthDeck, ShaderLib.depth);
  const phase = deckShader.uniforms.orbitalLatticePhase;
  for (const shader of [
    deckShader,
    visibleShader,
    depthShader,
    wallShader,
    editorDeckShader,
    depthDeckShader,
  ]) {
    assert.equal(shader.uniforms.orbitalLatticePhase, phase);
    assert.equal(
      shader.uniforms.orbitalLatticePeriod,
      deckShader.uniforms.orbitalLatticePeriod,
    );
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
  for (const shader of [deckShader, editorDeckShader, depthDeckShader]) {
    assert.equal(
      shader.vertexShader.match(/attribute vec2 roadCoord;/g).length,
      1,
    );
    assert.match(shader.fragmentShader, /orbitalRib\(vLattice\.x\).*discard;/s);
  }
  assert.doesNotMatch(editorDeckShader.fragmentShader, /vRoadNeon/);
  assert.match(editorDeckShader.fragmentShader, /cassetteBatch/);
  assert.doesNotMatch(depthDeckShader.fragmentShader, /outgoingLight/);
  assert.equal(editorMesh.customDepthMaterial, depthDeck);
  assert.equal(deckGeometry.attributes.latticeAvailable.getX(0), 1);

  const initial = phase.value;
  advance(lattice, 0.1);
  assert.notEqual(phase.value, initial);
  assert.equal(
    compile(depthShell, ShaderLib.depth).uniforms.orbitalLatticePhase,
    phase,
  );
});

test('pause, inspection and Reduced Motion retain the aperture phase without a catch-up jump', (t) => {
  const lattice = createMovingLattice(track);
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
  const racePhase = phase.value;
  lattice.update(frame('editor', 2.1), 4.1);
  assert.notEqual(phase.value, racePhase);
});

test('wide downhill roads scale the slots but keep the ends and runout solid', () => {
  const downhill = { length: 480, width: 56, closed: false };
  const lattice = createMovingLattice(downhill, {
    protectedSpans: [{ start: 310, end: downhill.length }],
  });
  for (const centre of gapCentres)
    assert.equal(lattice.coverage(210, centre * 2), 0);
  assert.equal(lattice.coverage(210, 8.7), 1);
  assert.equal(lattice.coverage(210 + downhill.length, 0), 1);
  assert.equal(lattice.coverage(210 - downhill.length, 0), 1);
  advance(lattice, 1.4);
  assert.equal(lattice.coverage(460, 0), 1);
});

test('different courses reuse the deck shader while retaining independent lattice uniforms', (t) => {
  const circuit = createMovingLattice(track);
  const downhill = createMovingLattice({
    length: 480,
    width: 56,
    closed: false,
  });
  const circuitDeck = new MeshStandardMaterial();
  const downhillDeck = new MeshStandardMaterial();
  t.after(() => {
    circuitDeck.dispose();
    downhillDeck.dispose();
  });
  circuit.bind(circuitDeck, 'road');
  downhill.bind(downhillDeck, 'road');
  assert.equal(
    circuitDeck.customProgramCacheKey(),
    downhillDeck.customProgramCacheKey(),
  );
  const circuitShader = compile(circuitDeck, ShaderLib.standard);
  const downhillShader = compile(downhillDeck, ShaderLib.standard);
  assert.equal(circuitShader.vertexShader, downhillShader.vertexShader);
  assert.equal(circuitShader.fragmentShader, downhillShader.fragmentShader);
  const circuitUniforms = circuitShader.uniforms;
  const downhillUniforms = downhillShader.uniforms;
  assert.equal(circuitUniforms.orbitalLatticePeriod.value, lapLength / 7);
  assert.equal(downhillUniforms.orbitalLatticePeriod.value, 640);
  assert.equal(
    downhillUniforms.orbitalLatticeRibPitch.value,
    LATTICE_RIB_SPACING,
  );
  assert.notEqual(
    circuitUniforms.orbitalLatticeRibPitch.value,
    downhillUniforms.orbitalLatticeRibPitch.value,
  );
  assert.equal(
    downhillUniforms.orbitalLatticeStagger.value,
    circuitUniforms.orbitalLatticeStagger.value / 2,
  );
  assert.deepEqual(
    downhillUniforms.orbitalLatticeCentres.value.toArray(),
    gapCentres.map((centre) => centre * 2),
  );
  assert.deepEqual(
    downhillUniforms.orbitalLatticeHalfWidths.value.toArray(),
    LATTICE_GAPS.map(([left, right]) => right - left),
  );
  const { value: savedPhase } = downhillUniforms.orbitalLatticePhase;
  advance(circuit, 0.1);
  assert.equal(downhillUniforms.orbitalLatticePhase.value, savedPhase);
});

test('wall, rib and underside geometry respect driveable runs and deck width', (t) => {
  const open = {
    length: 480,
    width: 56,
    closed: false,
    sample: (s) => ({
      position: new Vector3(0, 0, s),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      tangent: new Vector3(0, 0, 1),
    }),
  };
  const surfaces = createMovingLatticeSurfaces(open, {
    runs: [
      { start: 64, end: 150, step: 3, transverseStep: 2 },
      { start: 245, end: 289, step: 3, transverseStep: 2 },
    ],
    depth: 1.35,
  });
  for (const geometry of Object.values(surfaces)) {
    t.after(() => geometry.dispose());
    assert.ok(geometry.index.count > 0);
    const { roadCoord, position } = geometry.attributes;
    for (let i = 0; i < roadCoord.count; i++) {
      const station = roadCoord.getX(i);
      assert.ok(station >= 64 && station <= 289);
      assert.ok(station <= 150 || station >= 245);
      assert.ok(Math.abs(position.getX(i)) <= 28);
      assert.ok(position.getY(i) >= -1.351 && position.getY(i) < 0);
    }
  }
  assert.ok(surfaces.ribs.attributes.position.count > 200);
  const coords = surfaces.walls.attributes.roadCoord;
  assert.ok(Math.abs(coords.getY(0) - gapCentres[0] * 2) < 0.001);
});
