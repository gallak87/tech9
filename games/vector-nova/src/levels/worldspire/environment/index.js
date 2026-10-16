import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createAwakening } from './awakening.js';
import { finishWorldspireMineral } from './mineral-materials.js';
import { createWorldspireClouds } from './clouds.js';
import resonance from '../../../../assets/levels/worldspire/resonance-kit.json' with { type: 'json' };
import { finishZephyrMaterial } from '../../zephyr/environment/materials.js';
function release(group, borrowed = new Set()) {
  const gs = new Set(),
    ms = new Set(),
    ts = new Set();
  group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) gs.add(o.geometry);
    for (const m of [o.material].flat().filter(Boolean)) {
      ms.add(m);
      for (const v of Object.values(m))
        if (v?.isTexture && !borrowed.has(v)) ts.add(v);
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
  view,
  settings,
  loadAsset = (u) => new GLTFLoader().loadAsync(u),
  loadTexture = (u) => new T.TextureLoader().loadAsync(u),
}) {
  const group = new T.Group();
  group.name = 'Worldspire / the monolith and its mineral heart';
  if (shape) return { group, dispose: () => group.clear() };
  const loaded = await Promise.allSettled([
    loadAsset(assetURL('assets/levels/worldspire/worldspire-environment.glb')),
    loadTexture(assetURL('assets/levels/worldspire/mineral-v2.png')),
    loadTexture(assetURL('assets/levels/worldspire/fractured-obsidian-v1.png')),
  ]);
  if (loaded.some((r) => r.status === 'rejected')) {
    for (const value of new Set(
      loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    )) {
      if (value.scene) release(value.scene);
      else value.dispose();
    }
    const failed = loaded.findIndex((result) => result.status === 'rejected');
    const asset = ['monolith', 'mineral texture', 'mineral grain'][failed];
    // ImageLoader rejects with a DOM event, which has no message for the UI.
    throw new Error(
      `The Worldspire ${asset} could not load. Reload to try again.`,
      {
        cause: loaded[failed].reason,
      },
    );
  }
  const root = loaded[0].value.scene,
    texture = loaded[1].value,
    substrate = loaded[2].value;
  substrate.colorSpace = T.SRGBColorSpace;
  substrate.wrapS = substrate.wrapT = T.RepeatWrapping;
  substrate.anisotropy = Math.min(
    8,
    view?.renderer?.capabilities.getMaxAnisotropy() ?? 1,
  );
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 8;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      if (/bronze|pale portal/i.test(m.name)) finishZephyrMaterial(m);
      if (/mineral light inclusions|amber core inclusions/i.test(m.name)) {
        // Large exposed veins retain mineral detail under their own light.
        // The adjacent practical supplies a broad wash, not a white point on a flat panel.
        const warm = /amber core/i.test(m.name);
        m.map = texture;
        m.emissiveMap = texture;
        m.emissiveIntensity = warm ? 4.2 : 4.8;
        m.color.set(warm ? '#e8b780' : '#9cd0c7');
        m.roughness = 0.62;
        m.metalness = 0.06;
        m.needsUpdate = true;
      }
      if (
        /obsidian|fracture|calm exposed|calm cavity|rough root|weathered mineral/i.test(
          m.name,
        )
      )
        finishWorldspireMineral(m, substrate, texture);
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
  const fixtures = (resonance.fixtures ?? []).map((fixture) => ({
    ...fixture,
    // Pull the practical away from the authored seam plane so the adjacent
    // mineral faces receive a broad wash instead of a small specular hotspot.
    position: new T.Vector3(...fixture.position).addScaledVector(
      new T.Vector3(...fixture.normal),
      88,
    ),
    intensity: fixture.intensity * (fixture.kind === 'heart-recess' ? 3 : 2.4),
    radius: 680,
  }));
  const clouds = createWorldspireClouds({
    track,
    camera: view?.camera,
    settings,
  });
  group.add(clouds.group);
  const detachClouds = view?.attachWorldPass?.(clouds.pass);
  const borrowedTextures = new Set();
  let disposed = false;
  return {
    group,
    setReflection(probe) {
      borrowedTextures.add(probe);
      root.traverse((o) => {
        for (const material of [o.material].flat().filter(Boolean)) {
          material.envMap = probe;
          material.needsUpdate = true;
        }
      });
    },
    update(frame = {}) {
      const { camera } = frame;
      clouds.update(frame);
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
        const radius = f?.radius ?? 430;
        // Fade the fixed light pool beyond its physical reach instead of popping
        // a wall wash on when the camera crosses a hard distance threshold.
        l.intensity = f
          ? f.intensity *
            (1 - T.MathUtils.smoothstep(f.d, radius ** 2, (radius + 240) ** 2))
          : 0;
        if (f) {
          l.position.copy(f.position);
          l.color.set(f.color);
          l.distance = f.radius ?? 430;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detachClouds?.();
      clouds.dispose();
      release(group, borrowedTextures);
    },
  };
}
