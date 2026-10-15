import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createAwakening } from './awakening.js';
import { finishZephyrMaterial } from '../../zephyr/environment/materials.js';
function release(group) {
  const gs = new Set(),
    ms = new Set(),
    ts = new Set();
  group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) gs.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      ms.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
    }
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
  ts.forEach((t) => t.dispose());
  group.clear();
}
export async function createWorldspireEnvironment({
  track,
  shape = false,
  loadAsset = (u) => new GLTFLoader().loadAsync(u),
  loadTexture = (u) => new T.TextureLoader().loadAsync(u),
}) {
  const group = new T.Group();
  group.name = 'Worldspire / the monolith and its mineral heart';
  if (shape) return { group, dispose: () => group.clear() };
  const loaded = await Promise.allSettled([
    loadAsset(assetURL('assets/levels/worldspire/worldspire-environment.glb')),
    loadTexture(assetURL('assets/levels/worldspire/mineral-v2.png')),
  ]);
  if (loaded.some((r) => r.status === 'rejected')) {
    for (const r of loaded)
      if (r.status === 'fulfilled') {
        if (r.value.scene) release(r.value.scene);
        else r.value.dispose();
      }
    throw loaded.find((r) => r.status === 'rejected').reason;
  }
  const root = loaded[0].value.scene,
    texture = loaded[1].value;
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 8;
  const calmTexture = texture.clone();
  calmTexture.repeat.set(0.24, 0.24);
  calmTexture.needsUpdate = true;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      if (/bronze|pale portal/i.test(m.name)) finishZephyrMaterial(m);
      if (/amber core/i.test(m.name)) {
        m.emissiveIntensity = 0.48;
        m.roughness = 0.32;
      }
      if (/calm exposed|rough root/i.test(m.name)) {
        m.map = calmTexture;
        m.bumpMap = calmTexture;
        m.bumpScale = 0.08;
        m.envMapIntensity = 0.65;
        m.needsUpdate = true;
      }
      if (/calm cavity/i.test(m.name)) {
        m.map = calmTexture;
        m.bumpMap = null;
        m.roughness = 0.69;
        m.metalness = 0.1;
        // Continuous world-space projection avoids per-triangle UV-axis seams
        // on the curved boolean reveal; smooth cavity normals are authored in Blender.
        m.onBeforeCompile = (shader) => {
          shader.vertexShader =
            'varying vec3 cavityPoint;varying vec3 cavityNormal;\n' +
            shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\ncavityPoint=(modelMatrix*vec4(position,1.)).xyz;cavityNormal=normalize(mat3(modelMatrix)*normal);',
            );
          shader.fragmentShader =
            'varying vec3 cavityPoint;varying vec3 cavityNormal;\n' +
            shader.fragmentShader.replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
        vec3 weights=pow(abs(cavityNormal),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
        vec3 p=cavityPoint/240.;diffuseColor*=texture2D(map,p.zy)*weights.x+texture2D(map,p.xz)*weights.y+texture2D(map,p.xy)*weights.z;
        #endif`,
            );
        };
        m.customProgramCacheKey = () => 'worldspire-continuous-cavity-v1';
        m.needsUpdate = true;
      }
      if (/obsidian|fracture/i.test(m.name)) {
        m.map = /obsidian/i.test(m.name) ? calmTexture : texture;
        m.bumpMap = m.map;
        m.bumpScale = 0.28;
        m.color.set(/fracture/i.test(m.name) ? '#c8ac99' : '#b5bbc7');
        m.roughness = /fracture/i.test(m.name) ? 0.45 : 0.67;
        m.metalness = 0.18;
        m.envMapIntensity = 0.85;
        m.needsUpdate = true;
      }
    }
  });
  group.add(root);
  const awakening = createAwakening(track, texture);
  group.add(awakening.group);
  group.userData.awakeningOverride = null;
  // A few nearest steady practical lights reveal the actual cavity walls.
  const lights = Array.from({ length: 4 }, () => {
    const l = new T.PointLight('#98d8c8', 0, 430, 2);
    group.add(l);
    return l;
  });
  // Match Blender's seated crystal locations, including its metre sampling.
  const fixtures = [];
  for (const interior of track.interiors) {
    const vault = interior.id === 'vault';
    for (
      let s = Math.max(0, Math.ceil((interior.start - 570) / 12) * 12);
      s <= Math.min(track.length, interior.end + 700);
      s += 264
    ) {
      const f = track.sample(s);
      if (
        Math.hypot(f.position.x, f.position.z) >
        track.spireRadius(f.position.y) - 75
      )
        continue;
      const right = new T.Vector3(0, 1, 0).cross(f.tangent).normalize();
      for (const side of [-1, 1])
        fixtures.push({
          position: f.position
            .clone()
            .addScaledVector(right, side * 87)
            .add(new T.Vector3(0, vault ? 79 : 44, 0)),
          color: vault ? '#ffad64' : '#70dec9',
          intensity: vault ? 26000 : 23000,
        });
    }
  }
  // Low grazing fixtures reveal the carved gate arrises and flared foundations.
  for (const offset of [-90, 60, 195]) {
    const f = track.sample(track.finishDistance + offset);
    for (const side of [-1, 1])
      fixtures.push({
        position: f.position
          .clone()
          .addScaledVector(f.right, side * 62)
          .add(new T.Vector3(0, 65, 0)),
        color: '#ffe0b0',
        intensity: 4000,
      });
  }
  let disposed = false;
  return {
    group,
    update(frame = {}) {
      const { camera } = frame;
      awakening.update({
        ...frame,
        override: group.userData.awakeningOverride,
      });
      if (!camera) return;
      const near = fixtures
        .map((f) => ({
          ...f,
          d: f.position.distanceToSquared(camera.position),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, lights.length);
      lights.forEach((l, i) => {
        const f = near[i];
        l.visible = !!f && f.d < 430 * 430;
        if (f) {
          l.position.copy(f.position);
          l.color.set(f.color);
          l.intensity = f.intensity;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release(group);
    },
  };
}
