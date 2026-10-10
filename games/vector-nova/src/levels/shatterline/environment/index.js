import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createShatterlineCradleGeometry } from './cradles.js';
import { shatterlinePlacements } from './placements.js';
import { createShatterlineTerrainGeometry } from './terrain.js';
import { createReceivingCampus } from './receiver.js';
import { finishShatterlineMaterial } from './materials.js';
import { createShatterlineDescentInfrastructure } from './descents.js';
import { createShatterlinePoleLights } from './pole-lights.js';

const FILES = [
  'crown-severed',
  'crown-broken',
  'crown-hero',
  'crown-terminal',
  'service-gallery',
  'load-foundation',
  'service-shelter',
  'receiving-tower',
  'fractured-cassette',
  'geology-bedded-ridge',
  'geology-eroded-bluff',
  'geology-distant-range',
  'receiver-process-hall',
  'receiver-command',
  'receiver-primary',
  'receiver-condenser',
];
export async function createShatterlineEnvironment({
  track,
  shape = false,
  settings = {},
  loadAsset = (url) => new GLTFLoader().loadAsync(url),
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  const group = new T.Group();
  group.name = 'Shatterline / fractured mountain mass driver';
  if (shape)
    return {
      group,
      dispose() {
        group.clear();
      },
    };
  const geometries = new Set(),
    materials = new Set(),
    ownedTextures = new Set(),
    instances = [];
  const releaseAsset = (scene) =>
    scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) {
        materials.add(m);
        for (const v of Object.values(m))
          if (v?.isTexture) ownedTextures.add(v);
      }
    });
  const loaded = await Promise.allSettled([
    ...FILES.map((name) =>
      loadAsset(assetURL(`assets/levels/shatterline/${name}.glb`)),
    ),
    loadTexture(assetURL('assets/levels/shatterline/limestone-v1.png')),
  ]);
  for (const result of loaded)
    if (result.status === 'fulfilled') {
      if (result.value.scene) releaseAsset(result.value.scene);
      else ownedTextures.add(result.value);
    }
  const failed = loaded.find((r) => r.status === 'rejected');
  if (failed) {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    ownedTextures.forEach((t) => t.dispose());
    throw new Error('Shatterline environment assets could not load.', {
      cause: failed.reason,
    });
  }
  const rockTexture = loaded.at(-1).value;
  rockTexture.colorSpace = T.SRGBColorSpace;
  rockTexture.wrapS = rockTexture.wrapT = T.RepeatWrapping;
  rockTexture.anisotropy = 8;
  for (const material of materials)
    finishShatterlineMaterial(material, { rockTexture });
  const placements = shatterlinePlacements(track);
  for (let i = 0; i < FILES.length; i++) {
    const asset = FILES[i],
      scene = loaded[i].value.scene;
    scene.updateMatrixWorld(true);
    const transforms = placements.filter((p) => p.asset === asset);
    scene.traverse((source) => {
      if (!source.isMesh || !transforms.length) return;
      const mesh = new T.InstancedMesh(
        source.geometry,
        source.material,
        transforms.length,
      );
      mesh.name = `Shatterline / ${asset} / ${source.name}`;
      mesh.castShadow = asset !== 'geology-distant-range';
      mesh.receiveShadow = true;
      mesh.userData.shatterlineAsset = asset;
      mesh.userData.placementIds = transforms.map((p) => p.id);
      transforms.forEach((p, k) =>
        mesh.setMatrixAt(
          k,
          new T.Matrix4().multiplyMatrices(p.matrix, source.matrixWorld),
        ),
      );
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.instanceMatrix.needsUpdate = true;
      instances.push(mesh);
      group.add(mesh);
    });
  }
  const cradleGeometry = createShatterlineCradleGeometry(track, placements);
  geometries.add(cradleGeometry);
  const cradleMaterial = new T.MeshStandardMaterial({
    name: 'Shatterline / titanium load cradles',
    color: '#656a69',
    metalness: 0.55,
    roughness: 0.51,
  });
  materials.add(cradleMaterial);
  finishShatterlineMaterial(cradleMaterial);
  const cradle = new T.Mesh(cradleGeometry, cradleMaterial);
  cradle.name = 'Shatterline / joined road to foundation diagonal cradles';
  cradle.castShadow = true;
  cradle.receiveShadow = true;
  group.add(cradle);
  const terrainGeometry = createShatterlineTerrainGeometry(track);
  geometries.add(terrainGeometry);
  const terrainMaterial = new T.MeshStandardMaterial({
    name: 'Shatterline / pale limestone terrain',
    color: '#bdb9ab',
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  finishShatterlineMaterial(terrainMaterial, { rockTexture });
  materials.add(terrainMaterial);
  const terrain = new T.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'Shatterline / continuous fractured ridge and basin';
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  group.add(terrain);

  const campus = createReceivingCampus(track);
  group.add(campus);
  const poles = createShatterlinePoleLights(track);
  group.add(poles.group);
  const descents = createShatterlineDescentInfrastructure(track);
  group.add(descents);
  descents.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      materials.add(m);
      finishShatterlineMaterial(m);
    }
  });
  campus.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
  });
  // Sparse geometry-scale dust only near rock shoulders; it never blankets the road.
  const dustPositions = [];
  for (let i = 0; i < 220; i++) {
    const s = ((i * 0.61803398875) % 1) * track.length,
      f = track.sample(s),
      side = i % 3 ? 1 : -1;
    dustPositions.push(
      f.position.x + side * (90 + (i % 13) * 29),
      f.position.y - 48 - (i % 7) * 17,
      f.position.z,
    );
  }
  const dustGeometry = new T.BufferGeometry();
  dustGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(dustPositions, 3),
  );
  geometries.add(dustGeometry);
  const dustMaterial = new T.ShaderMaterial({
    name: 'Shatterline / restrained rock dust',
    transparent: true,
    depthWrite: false,
    uniforms: { clock: { value: 0 }, alpha: { value: 0.035 } },
    vertexShader:
      'uniform float clock;varying float seed;void main(){seed=position.z*.001;vec3 p=position;p.x+=sin(seed+clock*.025)*8.;p.y+=sin(seed*5.+clock*.1)*3.;vec4 v=modelViewMatrix*vec4(p,1.);gl_PointSize=min(100.,22000./max(100.,-v.z));gl_Position=projectionMatrix*v;}',
    fragmentShader:
      'uniform float alpha;varying float seed;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.1,1.,r))*alpha;gl_FragColor=vec4(.69,.65,.54,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  materials.add(dustMaterial);
  const dust = new T.Points(dustGeometry, dustMaterial);
  dust.name = 'Shatterline / local mineral shedding';
  dust.userData.aoExclude = true;
  group.add(dust);
  let disposed = false;
  return {
    group,
    placements: placements.map((p) => ({
      id: p.id,
      asset: p.asset,
      s: p.s,
      lateral: p.lateral,
      position: p.position.toArray(),
    })),
    update({ time = 0, settings: current = settings, state } = {}) {
      poles.update({ state });
      dustMaterial.uniforms.clock.value = current.reducedMotion ? 0 : time;
      dust.visible = current.quality !== 'low';
    },
    setReflection(texture) {
      for (const material of materials)
        if (material.isMeshStandardMaterial) {
          material.envMap = texture;
          material.envMapIntensity = 0.48;
          material.needsUpdate = true;
        }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      poles.dispose();
      for (const m of instances) m.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      ownedTextures.forEach((t) => t.dispose());
      group.clear();
    },
  };
}
