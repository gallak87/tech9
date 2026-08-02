import * as THREE from 'three';
import { bakeHullMaterial, bakeRockMaterial, bakePuff, bakeFlare, bakeStreak, cached } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared material library. Built once at boot; everything in the game pulls
// from here so the whole scene stays on one consistent set of PBR responses
// (and so there is exactly one place to retune the look).
// ─────────────────────────────────────────────────────────────────────────────

export const Mat = {};
export const Tex = {};
let built = false;

export function buildMaterials(engine) {
  if (built) return Mat;
  built = true;
  const aniso = engine.maxAniso;

  const hull = cached('tex.hull', () => bakeHullMaterial({ seed: 'arwing-hull', size: 1024, panel: 7, tint: [0.86, 0.88, 0.92], grime: 0.30 }));
  const hullDark = cached('tex.hullDark', () => bakeHullMaterial({ seed: 'arwing-dark', size: 512, panel: 10, tint: [0.20, 0.22, 0.26], grime: 0.5 }));
  const rock = cached('tex.rock', () => bakeRockMaterial({ seed: 'corneria-rock', size: 1024 }));

  for (const set of [hull, hullDark, rock]) {
    for (const k of Object.keys(set)) { set[k].anisotropy = aniso; }
  }

  Tex.puff = cached('tex.puff', () => bakePuff({ seed: 'puff-a', size: 256, softness: 1.0, detail: 0.7 }));
  Tex.puffSharp = cached('tex.puffSharp', () => bakePuff({ seed: 'puff-b', size: 256, softness: 0.7, detail: 1.0 }));
  Tex.flare = cached('tex.flare', () => bakeFlare({ size: 256, spikes: 4, spikeLen: 0.7 }));
  Tex.flareSoft = cached('tex.flareSoft', () => bakeFlare({ size: 256, spikes: 0 }));
  Tex.streak = cached('tex.streak', () => bakeStreak({ size: 128 }));
  Tex.hull = hull;
  Tex.rock = rock;

  // ── ship hull: light warm-grey composite panels
  Mat.hull = new THREE.MeshPhysicalMaterial({
    map: hull.map,
    normalMap: hull.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: hull.roughnessMap,
    metalnessMap: hull.metalnessMap,
    roughness: 1.0, metalness: 1.0,
    envMapIntensity: 1.15,
    clearcoat: 0.45, clearcoatRoughness: 0.28,
  });

  Mat.hullDark = new THREE.MeshPhysicalMaterial({
    map: hullDark.map,
    normalMap: hullDark.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: hullDark.roughnessMap,
    metalnessMap: hullDark.metalnessMap,
    roughness: 1.0, metalness: 1.0,
    envMapIntensity: 1.0,
  });

  Mat.accentRed = new THREE.MeshPhysicalMaterial({
    color: 0xc4202a, roughness: 0.30, metalness: 0.15,
    clearcoat: 0.85, clearcoatRoughness: 0.12, envMapIntensity: 1.2,
  });

  Mat.accentBlue = new THREE.MeshPhysicalMaterial({
    color: 0x1c58c8, roughness: 0.28, metalness: 0.25,
    clearcoat: 0.8, clearcoatRoughness: 0.14, envMapIntensity: 1.2,
  });

  Mat.gold = new THREE.MeshPhysicalMaterial({
    color: 0xd9a441, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.4,
  });

  Mat.glass = new THREE.MeshPhysicalMaterial({
    color: 0x10202c, roughness: 0.045, metalness: 0.0,
    transmission: 0.0,                       // opaque tinted canopy: cheaper, reads better against bloom
    transparent: true, opacity: 0.72,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 2.4, ior: 1.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  Mat.canopyFrame = new THREE.MeshPhysicalMaterial({
    color: 0x2b3038, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.1,
  });

  Mat.rock = new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap, roughnessMap: rock.roughnessMap,
    roughness: 1.0, metalness: 0.0, envMapIntensity: 0.85,
  });

  // ── emissives (toneMapped:false keeps them blooming hot after ACES)
  Mat.engineCore = emissive(0x9fd8ff, 9.0);
  Mat.engineRing = emissive(0x2e7fff, 3.2);
  Mat.laserPlayer = emissive(0x7fe4ff, 12.0);
  Mat.laserEnemy = emissive(0x9dff5a, 10.0);
  Mat.laserCharge = emissive(0xffd257, 14.0);
  Mat.gdiffuser = emissive(0x3fa9ff, 2.6);
  Mat.warnLight = emissive(0xff3a2a, 6.0);

  return Mat;
}

export function emissive(color, intensity = 4, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
    fog: false,
    ...opts,
  });
}

/** Additive sprite material for particles and glows. */
export function additive(map, color = 0xffffff, intensity = 1) {
  return new THREE.MeshBasicMaterial({
    map, color: new THREE.Color(color).multiplyScalar(intensity),
    blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, toneMapped: false, fog: false,
  });
}
