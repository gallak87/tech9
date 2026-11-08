import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { createNomadWheelSpeedFinish } from '../src/levels/nomad/wheel-speed-finish.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const sourceRadius = kit.prototypes
  .find((part) => part.name === 'nomad_wheel')
  .anchors.find((anchor) => anchor.kind === 'axis').rollingRadius;

test('24m and 30m wheel families use their own radius for shutter exposure and normalized finish bands', () => {
  const track = createNomadTrack();
  track.carriers[0].scale = track.carriers[0].scale.clone().multiplyScalar(2);
  const source = new T.MeshStandardMaterial();
  const blurs = [];
  for (const radius of [24, 30]) {
    const finish = createNomadWheelSpeedFinish({ track, sourceRadius: radius });
    const material = finish.bindMaterial(source);
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.nomadWheelSourceRadius.value, radius);
    blurs.push(shader.uniforms.nomadWheelBlur.value);
    assert.match(
      shader.fragmentShader,
      /wheelRawRadius\/nomadWheelSourceRadius/,
    );
    finish.dispose();
  }
  assert.ok(
    blurs[1] < blurs[0],
    'a larger wheel has lower angular exposure at the same ground speed',
  );
  assert.throws(
    () => createNomadWheelSpeedFinish({ track, sourceRadius: 0 }),
    /positive retained/,
  );
  source.dispose();
});

test('the actual packed wheel primitives retain wheel-centred shader coordinates at every LOD', async () => {
  const bytes = await readFile(
    new URL('../public/assets/levels/nomad/carrier-kit.glb', import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  const geometries = new Set(),
    materials = new Set();
  let parts = 0;
  try {
    for (const suffix of ['', '_mid', '_far']) {
      const root = scene.getObjectByName(`nomad_wheel${suffix}`);
      assert.ok(root);
      const inverse = root.matrixWorld.clone().invert();
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        parts++;
        const wheelLocal = new T.Matrix4().multiplyMatrices(
          inverse,
          mesh.matrixWorld,
        );
        const position = mesh.geometry.attributes.position;
        for (let vertex = 0; vertex < position.count; vertex++) {
          const raw = new T.Vector3().fromBufferAttribute(position, vertex);
          assert.ok(
            raw.distanceTo(raw.clone().applyMatrix4(wheelLocal)) < 1e-10,
            'a transformed primitive needs explicit wheel-local filter coordinates',
          );
          assert.ok(Math.hypot(raw.y, raw.z) <= sourceRadius * 1.11);
          assert.ok(Math.abs(raw.x) <= sourceRadius * 0.505);
        }
      });
    }
    assert.equal(parts, 12);
  } finally {
    scene.traverse((mesh) => {
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) materials.add(mesh.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
});

test('wheel shutter filtering composes borrowed finish hooks and leaves hull materials and textures intact', () => {
  const track = createNomadTrack();
  const texture = new T.Texture();
  const source = new T.MeshStandardMaterial({ color: '#aaa38e', map: texture });
  source.name = 'Nomad / rubbed warm alloy';
  let sourceCalls = 0;
  source.onBeforeCompile = function (shader) {
    sourceCalls++;
    assert.notEqual(this, source);
    shader.uniforms.borrowedFinish = { value: texture };
    shader.fragmentShader += '\n// retained industrial finish';
  };
  source.customProgramCacheKey = () => 'borrowed-industrial-key';
  const before = source.onBeforeCompile;
  const finish = createNomadWheelSpeedFinish({ track });
  const material = finish.bindMaterial(source);
  const shader = () => ({
    uniforms: {},
    vertexShader: T.ShaderLib.standard.vertexShader,
    fragmentShader: T.ShaderLib.standard.fragmentShader,
  });
  const compiled = shader();
  material.onBeforeCompile(compiled, {});
  assert.equal(sourceCalls, 1);
  assert.equal(source.onBeforeCompile, before);
  assert.equal(source.customProgramCacheKey(), 'borrowed-industrial-key');
  assert.equal(material.map, texture);
  assert.equal(compiled.uniforms.borrowedFinish.value, texture);
  assert.match(compiled.fragmentShader, /retained industrial finish/);
  assert.match(
    material.customProgramCacheKey(),
    /^borrowed-industrial-key-nomad-wheel/,
  );
  assert.equal(finish.bindMaterial(source), material);
  assert.equal(material.userData.nomadSourceMaterialUUID, source.uuid);
  assert.equal(material.transparent, source.transparent);
  assert.equal(material.depthWrite, source.depthWrite);
  assert.ok(
    compiled.uniforms.nomadWheelBlur.value > 0.9,
    'the fast convoy needs a strongly averaged tread/stud finish',
  );
  const paused = compiled.uniforms.nomadWheelBlur.value;
  finish.update({ mode: 'paused', settings: { quality: 'low' } });
  assert.equal(compiled.uniforms.nomadWheelBlur.value, paused);
  finish.update({ settings: { reducedMotion: true } });
  assert.equal(compiled.uniforms.nomadWheelStreak.value, 0);
  assert.equal(compiled.uniforms.nomadWheelBlur.value, paused);
  finish.update({ reset: true, settings: { reducedMotion: false } });
  assert.ok(compiled.uniforms.nomadWheelStreak.value > 0);
  let cloneDisposals = 0,
    sourceDisposals = 0,
    textureDisposals = 0;
  material.addEventListener('dispose', () => cloneDisposals++);
  source.addEventListener('dispose', () => sourceDisposals++);
  texture.addEventListener('dispose', () => textureDisposals++);
  finish.dispose();
  finish.dispose();
  finish.update();
  assert.equal(cloneDisposals, 1);
  assert.equal(sourceDisposals, 0);
  assert.equal(textureDisposals, 0);
  assert.throws(() => finish.bindMaterial(source), /disposed/);
  source.dispose();
  texture.dispose();
});
