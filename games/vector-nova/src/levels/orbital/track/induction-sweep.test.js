import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshStandardMaterial, ShaderLib, UniformsUtils } from 'three';
import { createDeckFinish } from './deck-finish.js';
import { createInductionSweep } from './induction-sweep.js';
import { fullRoadNeonMaterial } from './materials.js';

// Test a length which is neither a whole number of beam rows nor full sweeps.
const lapLength = 4501.7;

function setup(t) {
  const finish = createDeckFinish();
  const deckBase = new MeshStandardMaterial();
  const structureBase = new MeshStandardMaterial();
  finish.bind(deckBase);
  const deck = fullRoadNeonMaterial(deckBase);
  const structure = fullRoadNeonMaterial(structureBase);
  finish.bind(deck);
  const finishKey = deck.customProgramCacheKey();
  const structureKey = structure.customProgramCacheKey();
  const sweep = createInductionSweep(lapLength);
  sweep.bind(deck, { deck: true, uvScale: 12 });
  sweep.bind(structure, { deck: false, uvScale: 16 });
  const compile = (material) => {
    const shader = {
      ...ShaderLib.standard,
      uniforms: UniformsUtils.clone(ShaderLib.standard.uniforms),
    };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  t.after(() => {
    finish.dispose();
    for (const material of [deck, structure, deckBase, structureBase])
      material.dispose();
  });
  const deckShader = compile(deck);
  const structureShader = compile(structure);
  return {
    deck,
    structure,
    finishKey,
    structureKey,
    sweep,
    compile,
    deckShader,
    structureShader,
    uniform: deckShader.uniforms.orbitalSweep,
  };
}

function frame(mode, time, extra = {}) {
  return {
    mode,
    time,
    dt: 1 / 60,
    settings: { quality: 'high', reducedMotion: false },
    ...extra,
  };
}

test('the sweep augments both existing neon programs and shares their phase', (t) => {
  const {
    deck,
    structure,
    finishKey,
    structureKey,
    sweep,
    compile,
    deckShader,
    structureShader,
    uniform,
  } = setup(t);
  assert.ok(deck.customProgramCacheKey().startsWith(finishKey));
  assert.notEqual(deck.customProgramCacheKey(), finishKey);
  assert.ok(structure.customProgramCacheKey().startsWith(structureKey));
  assert.notEqual(structure.customProgramCacheKey(), structureKey);
  for (const shader of [deckShader, structureShader]) {
    assert.match(shader.vertexShader, /vRoadNeon\s*=\s*roadNeon/);
    assert.match(shader.fragmentShader, /vRoadNeon\.rgb/);
    assert.match(shader.fragmentShader, /uniform vec3 orbitalSweep/);
    assert.match(
      shader.fragmentShader,
      /totalEmissiveRadiance\s*=\s*mix[\s\S]*totalEmissiveRadiance\s*\+=/,
    );
    assert.equal(shader.uniforms.orbitalSweep, uniform);
  }
  assert.match(deckShader.fragmentShader, /roughnessFactor[^\n]*cassetteBatch/);
  assert.match(deckShader.vertexShader, /vInductionCoord\s*=\s*roadCoord/);
  assert.match(structureShader.vertexShader, /uv\.y\s*\*\s*16\b/);
  assert.match(deckShader.fragmentShader, /fwidth\(/);
  assert.doesNotMatch(structureShader.fragmentShader, /fwidth\(/);
  sweep.update(frame('racing', 0), 10);
  assert.equal(compile(deck).uniforms.orbitalSweep, uniform);
  assert.equal(compile(structure).uniforms.orbitalSweep, uniform);
});

test('the wave and the deck grid close across the lap seam', (t) => {
  const { uniform } = setup(t);
  for (const frequency of [uniform.value.y, uniform.value.z]) {
    const cycles = frequency * lapLength;
    assert.ok(frequency > 0);
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9);
  }
});

test('the pattern moves during countdown and racing, with a continuous handoff', (t) => {
  const { sweep, uniform } = setup(t);
  sweep.update(frame('countdown', 0, { reset: true }), 10);
  const preRace = uniform.value.x;
  sweep.update(frame('countdown', 0), 10.05);
  const countdown = uniform.value.x;
  assert.notEqual(countdown, preRace);

  sweep.update(frame('racing', 0), 10.05);
  assert.equal(uniform.value.x, countdown);
  sweep.update(frame('racing', 0.05), 10.1);
  assert.notEqual(uniform.value.x, countdown);
});

test('pausing, inspecting, reduced motion and restarting retain the sweep phase', (t) => {
  const { sweep, uniform } = setup(t);
  sweep.update(frame('racing', 0), 10);
  sweep.update(frame('racing', 0.05), 10.05);
  const phase = uniform.value.x;
  for (const [mode, time, now, extra] of [
    ['paused', 0.05, 12],
    ['fly', 0.05, 14],
    ['racing', 2, 16, { settings: { quality: 'low', reducedMotion: true } }],
    ['racing', 0, 16, { reset: true }],
  ]) {
    sweep.update(frame(mode, time, extra), now);
    assert.equal(uniform.value.x, phase, mode);
  }
  sweep.update(frame('racing', 0.05), 16.05);
  assert.notEqual(uniform.value.x, phase);
});
