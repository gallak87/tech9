import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { installRavelAONormalPass } from '../src/levels/ravel/ao-normal.js';
import { createPlayableRavelTrack } from '../src/levels/ravel/index.js';
import { createRavelRoad } from '../src/levels/ravel/track/road.js';

const shader = () => ({
  uniforms: T.UniformsUtils.clone(T.ShaderLib.physical.uniforms),
  vertexShader: T.ShaderLib.physical.vertexShader,
  fragmentShader: T.ShaderLib.physical.fragmentShader,
});

test('local normal override preserves prior hooks and beauty shader, with one shared pass uniform and no per-pass recompiles', () => {
  const material = new T.MeshPhysicalMaterial();
  let renders = 0,
    compiled = 0;
  material.onBeforeCompile = function (program) {
    assert.equal(this, material);
    compiled++;
    program.vertexShader += '\n// previous vertex deformation';
  };
  material.onBeforeRender = function () {
    assert.equal(this, material);
    renders++;
  };
  material.customProgramCacheKey = () => 'previous-pbr';
  const originalVertex = shader().vertexShader;
  installRavelAONormalPass(material);
  const hook = material.onBeforeCompile;
  assert.equal(
    installRavelAONormalPass(material).onBeforeCompile,
    hook,
    'installation is idempotent',
  );
  const first = shader(),
    second = shader();
  material.onBeforeCompile(first);
  material.onBeforeCompile(second);
  assert.equal(compiled, 2);
  assert.equal(
    first.vertexShader,
    originalVertex + '\n// previous vertex deformation',
    'AO never substitutes the geometry shader',
  );
  assert.equal(
    first.uniforms.ravelAONormalPass,
    second.uniforms.ravelAONormalPass,
    'all compile variants share the same live uniform',
  );
  assert.ok(
    first.fragmentShader.indexOf(
      'gl_FragColor=vec4(normalize(normal)*.5+.5,1.);',
    ) < first.fragmentShader.indexOf('#include <normal_fragment_maps>'),
    'geometric view normals bypass bump and PBR shading',
  );
  assert.ok(
    first.fragmentShader.includes('#include <lights_physical_fragment>'),
    'beauty retains its original physical shading path',
  );
  const version = material.version;
  for (const [overrideMaterial, expected] of [
    [null, 0],
    [new T.MeshNormalMaterial(), 1],
    [null, 0],
  ]) {
    material.onBeforeRender(null, { overrideMaterial }, null, null, null, null);
    assert.equal(first.uniforms.ravelAONormalPass.value, expected);
    assert.equal(
      material.version,
      version,
      'pass changes update a uniform, not shader variants',
    );
    overrideMaterial?.dispose();
  }
  assert.equal(renders, 3);
  assert.equal(material.allowOverride, false);
  assert.equal(
    new T.MeshPhysicalMaterial().allowOverride,
    true,
    'other materials keep Three defaults',
  );
  material.dispose();
});

test('actual moving Ravel road batches contribute their original animated geometry to GTAO depth and normals', () => {
  const road = createRavelRoad({ track: createPlayableRavelTrack() });
  try {
    const moving = road.group.children.filter(
      (object) => object.userData.deforming && object.userData.roadSurface,
    );
    assert.ok(moving.length >= 1);
    for (const mesh of moving) {
      assert.equal(
        mesh.userData.aoExclude,
        false,
        'the moving floor cannot expose scenery depth through itself',
      );
      assert.equal(mesh.material.allowOverride, false);
      assert.equal(mesh.material.userData.ravelAONormalPass, true);
      const program = shader();
      mesh.material.onBeforeCompile(program);
      assert.ok(
        program.uniforms.ravelTime,
        'the normal pass shares the actual wave clock',
      );
      assert.ok(
        program.vertexShader.includes(
          'transformed += ravelWaveUp * ravelWave.x',
        ),
        'depth uses the actual deformed vertices',
      );
      assert.ok(
        program.vertexShader.includes('objectNormal=normalize(cross(ds,dx))'),
        'normal output uses the same actual wave gradients',
      );
      assert.ok(program.fragmentShader.includes('ravelAONormalPass > .5'));
    }
  } finally {
    road.dispose();
  }
});
