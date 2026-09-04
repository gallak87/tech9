import * as THREE from 'three';
import { cached, groundDetail, rockDetail, metalDetail, neonRamp } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// The shared material kit.
//
// "AAA" here means one thing before it means anything else: MATERIAL VARIETY.
// Metal, painted steel, rock, dirt and emissive trim must respond differently
// to the same light, or the whole world reads as one grey plastic no matter how
// good the lighting is. Every lane builds its meshes out of these so the game
// keeps one coherent surface response.
//
// Lanes may extend a clone. Lanes may NOT mutate a shared instance — a clone is
// one line and a mutated shared material is a bug that surfaces three phases
// later in someone else's screenshot.
// ─────────────────────────────────────────────────────────────────────────────

export function buildMaterials(engine) {
  const aniso = engine.maxAniso;
  const g = cached('ground.detail', () => groundDetail({ repeat: 11 }));
  const r = cached('rock.detail', () => rockDetail({ repeat: 2.2 }));
  const m = cached('metal.detail', () => metalDetail({ repeat: 1.6 }));
  for (const t of [g.normal, g.rough, r.normal, r.rough, m.normal, m.rough]) t.anisotropy = aniso;

  const M = {
    /** Terrain. Colour comes from the vertex attribute so biomes blend without
     *  a splat map; the maps carry the surface, not the palette. */
    ground: new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: g.normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: g.rough,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.9,
      dithering: true,
    }),

    rock: new THREE.MeshStandardMaterial({
      color: 0x8b8175,
      normalMap: r.normal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: r.rough,
      roughness: 1.0,
      metalness: 0.02,
      envMapIntensity: 0.85,
      flatShading: false,
    }),

    /** Alien-terraformer hardware: real metal, so it picks up the sky. */
    metal: new THREE.MeshStandardMaterial({
      color: 0x9aa3ad,
      normalMap: m.normal,
      roughnessMap: m.rough,
      roughness: 1.0,
      metalness: 0.92,
      envMapIntensity: 1.15,
    }),

    /** Painted, chipped, dielectric — deliberately NOT metal, so the pair reads
     *  as two materials under the same key light. */
    painted: new THREE.MeshStandardMaterial({
      color: 0x8d3b52,
      normalMap: m.normal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.46,
      metalness: 0.05,
      envMapIntensity: 1.0,
      clearcoat: 0,
    }),

    /** Magenta/cyan is the game's identity. Emissive only — no light attached:
     *  a point light per neon strip is how a 900-draw budget dies. */
    neonMagenta: new THREE.MeshStandardMaterial({
      color: 0x1a0a14, emissive: 0xff2fa0, emissiveIntensity: 5.5,
      roughness: 0.35, metalness: 0.1, toneMapped: true,
    }),
    neonCyan: new THREE.MeshStandardMaterial({
      color: 0x061418, emissive: 0x22e5ff, emissiveIntensity: 4.6,
      roughness: 0.35, metalness: 0.1, toneMapped: true,
    }),
  };

  M.ramp = cached('neon.ramp', () => neonRamp([[0, '#ff2fa0'], [0.5, '#7a3fff'], [1, '#22e5ff']]));
  return M;
}
