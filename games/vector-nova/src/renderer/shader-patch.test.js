import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  assertShaderAnchor,
  appendShaderPatch,
  replaceShader,
  replaceShaderAll,
} from './shader-patch.js';
import createZephyr from '../levels/zephyr/index.js';
import { createZephyrWater } from '../levels/zephyr/environment/water.js';
import { createNacreMaterials } from '../levels/nacre/environment/materials.js';

test('layered patches preserve order, receiver, renderer and the original program identity', () => {
  const material = new T.MeshStandardMaterial();
  const renderer = {};
  const calls = [];
  material.onBeforeCompile = function (shader, view) {
    assert.equal(this, material);
    assert.equal(view, renderer);
    calls.push('base');
    shader.fragmentShader = 'base';
  };
  const baseKey = material.customProgramCacheKey();
  appendShaderPatch(material, ':first-v1', function (shader, view) {
    assert.equal(this, material);
    assert.equal(view, renderer);
    calls.push('first');
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      'base',
      'first',
    );
  });
  appendShaderPatch(material, ':second-v2', (shader) => {
    calls.push('second');
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      'first',
      'second',
    );
  });
  const key = `${baseKey}:first-v1:second-v2`;
  assert.equal(material.customProgramCacheKey(), key);
  const shader = {};
  material.onBeforeCompile(shader, renderer);
  assert.deepEqual(calls, ['base', 'first', 'second']);
  assert.equal(shader.fragmentShader, 'second');
  assert.equal(material.customProgramCacheKey(), key);
  assert.equal(
    material.version,
    2,
    'adding layers invalidates an already compiled program',
  );
  const variant = new T.MeshStandardMaterial();
  variant.onBeforeCompile = material.onBeforeCompile;
  variant.customProgramCacheKey = () => baseKey;
  appendShaderPatch(variant, ':first-v2', () => {});
  assert.notEqual(variant.customProgramCacheKey(), key);
  material.dispose();
  variant.dispose();
});

function program(material) {
  const kind = {
    MeshPhysicalMaterial: 'physical',
    MeshStandardMaterial: 'standard',
    MeshBasicMaterial: 'basic',
    PointsMaterial: 'points',
  }[material.type];
  const source = material.isShaderMaterial ? material : T.ShaderLib[kind];
  assert.ok(source, `Use the actual shader source for ${material.type}`);
  return {
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
    uniforms: T.UniformsUtils.clone(source.uniforms ?? {}),
  };
}

test('checked shader replacement keeps native first-match, global and replacement-token behavior', () => {
  const source = T.ShaderLib.standard.fragmentShader;
  const anchor = '#include <color_fragment>';
  const replacement = '$&\nfloat checkedPigment = 1.;';
  assert.equal(
    replaceShader(source, anchor, replacement),
    source.replace(anchor, replacement),
  );
  const repeated = `${source}\n${source}`;
  assert.equal(
    replaceShader(repeated, anchor, replacement),
    repeated.replace(anchor, replacement),
  );
  assert.equal(
    replaceShaderAll(repeated, anchor, replacement),
    repeated.replaceAll(anchor, replacement),
  );
});

test('regex checks preserve native match positions without mutating the search before replacement', () => {
  for (const [pattern, position, source] of [
    [/point/g, 9, 'point point'],
    [/point/y, 4, 'one point'],
    [/}\s*$/, 0, 'void main() {}\n'],
  ]) {
    const expectedPattern = new RegExp(pattern.source, pattern.flags);
    expectedPattern.lastIndex = pattern.lastIndex = position;
    assertShaderAnchor(source, pattern);
    assert.equal(pattern.lastIndex, position);
    assert.equal(
      replaceShader(source, pattern, '$&\n// patched'),
      source.replace(expectedPattern, '$&\n// patched'),
    );
    assert.equal(pattern.lastIndex, expectedPattern.lastIndex);
  }
});

test('missing anchors fail at their actual layer instead of silently losing a finish', () => {
  const source = T.ShaderLib.physical.fragmentShader;
  const injected = 'float checkedLayer = 1.;';
  assert.throws(
    () => replaceShader(source, injected, ''),
    /Shader patch anchor not found: float checkedLayer/,
  );
  assert.throws(
    () => replaceShaderAll(source, injected, ''),
    /Shader patch anchor not found/,
  );
  const first = replaceShader(source, '#include <color_fragment>', injected);
  assert.equal(
    replaceShader(first, injected, 'float checkedLayer = 2.;'),
    first.replace(injected, 'float checkedLayer = 2.;'),
  );
});

test('default-key hook anchors remain valid in their actual stock material classes', () => {
  // These hooks retain their exact JS bodies because Three derives their keys
  // from function.toString(), including the Cindercoil rupture-plume clone.
  const contracts = [
    [
      'Worldspire core',
      T.ShaderLib.standard,
      ['#include <begin_vertex>'],
      ['#include <color_fragment>', '#include <emissivemap_fragment>'],
    ],
    [
      'Cindercoil plume',
      T.ShaderLib.standard,
      ['#include <common>', '#include <begin_vertex>'],
      [
        '#include <common>',
        '#include <color_fragment>',
        '#include <emissivemap_fragment>',
        '#include <opaque_fragment>',
      ],
    ],
    [
      'Zephyr light shafts',
      T.ShaderLib.basic,
      ['#include <begin_vertex>'],
      ['#include <color_fragment>'],
    ],
    [
      'Zephyr ship droplets',
      T.ShaderLib.points,
      [],
      ['#include <color_fragment>'],
    ],
  ];
  for (const [name, source, vertex, fragment] of contracts) {
    for (const anchor of vertex)
      assert.doesNotThrow(
        () => assertShaderAnchor(source.vertexShader, anchor),
        name,
      );
    for (const anchor of fragment)
      assert.doesNotThrow(
        () => assertShaderAnchor(source.fragmentShader, anchor),
        name,
      );
  }
  for (const anchor of [
    '#if ( NUM_POINT_LIGHTS',
    '#if ( NUM_SPOT_LIGHTS',
    'RE_Direct( directLight,',
  ])
    assertShaderAnchor(T.ShaderChunk.lights_fragment_begin, anchor);
  assertShaderAnchor(
    T.ShaderChunk.lights_physical_pars_fragment,
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  );
});

test('real Nacre and layered Zephyr water finishes compile with class-correct stock sources', () => {
  for (const textured of [false, true]) {
    const stone = textured ? new T.Texture() : null;
    const water = createZephyrWater(createZephyr().createTrack(), stone);
    const nacre = createNacreMaterials({ value: 0 }, 0);
    const materials = new Set(Object.values(nacre));
    water.group.traverse((object) => {
      for (const material of [].concat(object.material ?? []))
        materials.add(material);
    });
    try {
      for (const material of materials) {
        const key = material.customProgramCacheKey();
        const shader = program(material);
        assert.doesNotThrow(
          () => material.onBeforeCompile(shader, null),
          material.name,
        );
        assert.equal(material.customProgramCacheKey(), key);
        assert.ok(!shader.vertexShader.includes('undefined'), material.name);
        assert.ok(!shader.fragmentShader.includes('undefined'), material.name);
      }
    } finally {
      water.dispose();
      stone?.dispose();
      for (const material of Object.values(nacre)) material.dispose();
    }
  }
});
