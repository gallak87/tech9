import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFoliageWind } from '../src/foliage-wind.js';
import { transformFoliageWindGeometry } from '../src/foliage-geometry.js';
import { createWeatherState } from '../src/state.js';
import { createFoliageSprayGeometry } from '../../living-forest/src/geometry.js';
import { createLivingForestKit } from '../../living-forest/src/index.js';

function compile(material, name) {
  const shader = {
    vertexShader: T.ShaderLib[name].vertexShader,
    fragmentShader: T.ShaderLib[name].fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(shader);
  return shader;
}
function fixture() {
  const geometry = createFoliageSprayGeometry({
    length: 8,
    width: 4,
    wind: true,
    phase: 1.3,
  });
  const map = new T.Texture();
  const material = new T.MeshStandardMaterial({
    map,
    side: T.DoubleSide,
    alphaTest: 0.5,
  });
  const mesh = new T.InstancedMesh(geometry, material, 2);
  mesh.setMatrixAt(
    0,
    new T.Matrix4().compose(
      new T.Vector3(3, 2, 4),
      new T.Quaternion().setFromEuler(new T.Euler(0.4, 0.7, 0.1)),
      new T.Vector3(2, 3, 1.5),
    ),
  );
  mesh.setMatrixAt(1, new T.Matrix4().makeTranslation(-10, 0, 0));
  return { geometry, map, material, mesh };
}

test('wind anchors and gradients preserve the weight field under rotated nonuniform giant transforms', () => {
  const geometry = createFoliageSprayGeometry({
    length: 8,
    width: 4,
    wind: true,
    phase: 1.3,
  });
  const source = geometry.clone();
  const matrix = new T.Matrix4().compose(
    new T.Vector3(31, 200, -17),
    new T.Quaternion().setFromEuler(new T.Euler(0.7, 0.9, 0.4)),
    new T.Vector3(3, 5, 2),
  );
  geometry.applyMatrix4(matrix);
  transformFoliageWindGeometry(geometry, matrix);
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const position = new T.Vector3().fromBufferAttribute(
      geometry.attributes.position,
      i,
    );
    const anchor = new T.Vector3().fromBufferAttribute(
      geometry.attributes.windAnchor,
      i,
    );
    const gradient = new T.Vector3().fromBufferAttribute(
      geometry.attributes.windGradient,
      i,
    );
    assert.ok(anchor.distanceTo(new T.Vector3(31, 200, -17)) < 1e-5);
    assert.ok(
      Math.abs(
        gradient.dot(position.sub(anchor)) -
          geometry.attributes.windWeight.getX(i),
      ) < 1e-5,
    );
    assert.equal(
      geometry.attributes.windPhase.getX(i),
      source.attributes.windPhase.getX(i),
    );
  }
  geometry.dispose();
  source.dispose();
});

test('understory motion attributes are opt-in and every card is pinned to its real stem', () => {
  const plain = createLivingForestKit({ includeTrees: false });
  const moving = createLivingForestKit({
    includeTrees: false,
    foliageWind: true,
  });
  try {
    const a = plain.shrubParts[1].geometry,
      b = moving.shrubParts[1].geometry;
    assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
    assert.deepEqual(a.attributes.normal.array, b.attributes.normal.array);
    assert.equal(a.attributes.windAnchor, undefined);
    for (let i = 0; i < b.attributes.position.count; i += 6) {
      const left = new T.Vector3().fromBufferAttribute(
        b.attributes.position,
        i,
      );
      const right = new T.Vector3().fromBufferAttribute(
        b.attributes.position,
        i + 1,
      );
      const anchor = new T.Vector3().fromBufferAttribute(
        b.attributes.windAnchor,
        i,
      );
      assert.ok(left.add(right).multiplyScalar(0.5).distanceTo(anchor) < 1e-5);
      assert.equal(b.attributes.windWeight.getX(i), 0);
      assert.equal(b.attributes.windWeight.getX(i + 5), 1);
    }
  } finally {
    plain.dispose();
    moving.dispose();
  }
});

test('beauty and both shadow paths use one anchored deformation and shared Weather time, pause and reduced motion', () => {
  const f = fixture(),
    wind = createFoliageWind({ maxOffset: 2.4 });
  wind.bind(f.mesh);
  const shaders = [
    compile(f.material, 'standard'),
    compile(f.mesh.customDepthMaterial, 'depth'),
    compile(f.mesh.customDistanceMaterial, 'distance'),
  ];
  for (const shader of shaders) {
    assert.ok(shader.vertexShader.includes('foliageLocalOffset*foliageWeight'));
    assert.ok(shader.vertexShader.includes('inverse(foliageToWorld)'));
    assert.equal(
      shader.uniforms.foliageWeatherTime,
      shaders[0].uniforms.foliageWeatherTime,
    );
    assert.equal(
      shader.uniforms.foliageWeatherWind,
      shaders[0].uniforms.foliageWeatherWind,
    );
  }
  assert.ok(
    shaders[0].vertexShader.includes(
      'objectNormal=normalize(objectNormal-foliageDerivative',
    ),
  );
  assert.equal(f.material.allowOverride, false);
  const scene = new T.Scene();
  scene.overrideMaterial = new T.MeshNormalMaterial();
  f.material.onBeforeRender(null, scene);
  assert.equal(shaders[0].uniforms.foliageNormalPass.value, 1);
  scene.overrideMaterial = new T.MeshDepthMaterial({
    depthPacking: T.RGBADepthPacking,
  });
  f.material.onBeforeRender(null, scene);
  assert.equal(shaders[0].uniforms.foliageNormalPass.value, 3);
  scene.overrideMaterial = null;
  f.material.onBeforeRender(null, scene);
  assert.equal(
    shaders[0].uniforms.foliageNormalPass.value,
    0,
    'beauty rendering resets override state',
  );
  assert.equal(f.mesh.customDepthMaterial.map, f.map);
  assert.equal(f.mesh.customDistanceMaterial.alphaTest, 0.5);
  const weather = createWeatherState({
    wind: 0.7,
    windDirection: 42,
    transition: 0,
  });
  weather.update(0.05);
  wind.update(weather.current);
  assert.equal(
    shaders[0].uniforms.foliageWeatherTime.value,
    weather.current.time,
  );
  assert.equal(
    shaders[0].uniforms.foliageWeatherWind.value.x,
    weather.current.windX,
  );
  const time = wind.stats.time,
    vector = shaders[0].uniforms.foliageWeatherWind.value.clone();
  weather.configure({ paused: true });
  weather.update(0.05);
  wind.update(weather.current);
  assert.equal(wind.stats.time, time);
  weather.configure({ paused: false });
  weather.update(0.05);
  wind.update(weather.current, { reducedMotion: true });
  assert.equal(wind.stats.time, time);
  assert.ok(shaders[0].uniforms.foliageWeatherWind.value.equals(vector));
  wind.dispose();
  f.geometry.dispose();
  f.material.dispose();
  f.map.dispose();
});

test('wind owns only shadow materials and hooks; repeated LOD bounds refreshes do not accumulate margin', () => {
  const f = fixture(),
    wind = createFoliageWind({ maxOffset: 2.4 });
  const second = new T.Mesh(f.geometry, f.material);
  const hook = f.material.onBeforeCompile,
    key = f.material.customProgramCacheKey;
  f.mesh.computeBoundingSphere();
  const originalSphere = f.mesh.boundingSphere;
  const originalRadius = originalSphere.radius;
  let borrowedDisposals = 0;
  for (const resource of [f.geometry, f.material, f.map])
    resource.addEventListener('dispose', () => borrowedDisposals++);
  wind.bind(f.mesh);
  wind.bind(second);
  wind.bind(f.mesh);
  assert.equal(wind.stats.meshes, 2);
  assert.equal(wind.stats.shadowMaterials, 2);
  assert.equal(f.mesh.customDepthMaterial, second.customDepthMaterial);
  const shadowDisposals = [0, 0];
  [f.mesh.customDepthMaterial, f.mesh.customDistanceMaterial].forEach(
    (material, i) =>
      material.addEventListener('dispose', () => shadowDisposals[i]++),
  );
  assert.ok(
    Math.abs(f.mesh.boundingSphere.radius - originalRadius - 2.4) < 1e-6,
  );
  f.mesh.computeBoundingSphere();
  f.mesh.computeBoundingSphere();
  assert.ok(
    Math.abs(f.mesh.boundingSphere.radius - originalRadius - 2.4) < 1e-6,
  );
  assert.ok(
    f.material.customProgramCacheKey().includes('weather-anchored-foliage-v1'),
  );
  wind.dispose();
  wind.dispose();
  assert.equal(f.material.onBeforeCompile, hook);
  assert.equal(f.material.customProgramCacheKey, key);
  assert.equal(f.mesh.boundingSphere, originalSphere);
  assert.equal(second.boundingSphere, undefined);
  assert.equal(f.mesh.customDepthMaterial, undefined);
  assert.deepEqual(shadowDisposals, [1, 1]);
  assert.equal(borrowedDisposals, 0);
  f.geometry.dispose();
  f.material.dispose();
  f.map.dispose();
});

test('invalid geometry does not mutate a material and disposal preserves a later hook owner', () => {
  const material = new T.MeshStandardMaterial();
  const mesh = new T.Mesh(new T.PlaneGeometry(), material),
    wind = createFoliageWind();
  const original = material.onBeforeCompile;
  assert.throws(() => wind.bind(mesh), /windAnchor/);
  assert.equal(material.onBeforeCompile, original);
  const f = fixture();
  wind.bind(f.mesh);
  const wrapped = f.material.onBeforeCompile;
  const later = function (shader, renderer) {
    wrapped.call(this, shader, renderer);
  };
  f.material.onBeforeCompile = later;
  wind.dispose();
  assert.equal(f.material.onBeforeCompile, later);
  const shader = compile(f.material, 'standard');
  assert.ok(!shader.vertexShader.includes('foliageWeatherOffset'));
  mesh.geometry.dispose();
  material.dispose();
  f.geometry.dispose();
  f.material.dispose();
  f.map.dispose();
});
