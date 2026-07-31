import * as THREE from 'three';
import { Tex, emissive } from '../render/materials.js';
import { bakeHullMaterial, cached } from '../render/textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ship material library.
//
// The single biggest failure mode of a procedural ship is that every surface
// answers the same light the same way, and the whole thing reads as one lump of
// grey plastic. So this file is organised by *response*, not by colour:
//
//   paint      dielectric, clearcoated  → broad soft highlight, colour survives
//   metal      conductor, mid rough     → tight coloured highlight, no diffuse
//   heat       conductor, very rough    → dark, wide, almost matte sheen
//   glass      dielectric, mirror       → environment only
//   trim       dielectric, glossy       → saturated, hard highlight
//
// Five different BRDFs under one light is what makes a model look built rather
// than extruded. The albedo/normal/roughness maps are shared with the world
// material set (baked once in render/materials.js) — only the responses differ.
// ─────────────────────────────────────────────────────────────────────────────

export const SMat = {};
let built = false;

export function buildShipMaterials() {
  if (built) return SMat;
  built = true;

  const H = Tex.hull ?? {};
  const aniso = H.map?.anisotropy ?? 8;

  // Two extra small bakes: hostile plating and engine heat shield. 512 is
  // plenty — both are seen at grazing angles on dark surfaces.
  const dark = cached('tex.ship.dark', () => bakeHullMaterial({
    seed: 'hostile-hull', size: 512, panel: 9, tint: [0.30, 0.31, 0.35], grime: 0.60,
  }));
  const heat = cached('tex.ship.heat', () => bakeHullMaterial({
    seed: 'heat-shield', size: 512, panel: 18, tint: [0.34, 0.33, 0.34], grime: 0.80,
  }));
  for (const set of [dark, heat]) for (const k of Object.keys(set)) set[k].anisotropy = aniso;

  /* ── friendly hull ──────────────────────────────────────────────────────── */

  // Painted composite. metalness ~0 is the whole trick: the previous hull ran
  // metalness 1.0 off the metalness map, which is why it read as chrome.
  SMat.paint = new THREE.MeshPhysicalMaterial({
    map: H.map, normalMap: H.normalMap, roughnessMap: H.roughnessMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    color: 0xdfe5ee, roughness: 0.80, metalness: 0.03,
    clearcoat: 0.72, clearcoatRoughness: 0.24,
    envMapIntensity: 1.0,
  });

  // Same paint, knocked down — belly, shadowed panels, service hatches.
  SMat.paintGrey = SMat.paint.clone();
  SMat.paintGrey.color.setHex(0x8d95a2);
  SMat.paintGrey.clearcoat = 0.45;

  // Bare machined metal: spars, barrels, hinges, hardpoints.
  SMat.metal = new THREE.MeshPhysicalMaterial({
    map: H.map, normalMap: H.normalMap,
    roughnessMap: H.roughnessMap, metalnessMap: H.metalnessMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0x9aa3b0, roughness: 0.58, metalness: 1.0,
    envMapIntensity: 1.35,
  });

  SMat.metalDark = SMat.metal.clone();
  SMat.metalDark.color.setHex(0x4d545e);
  SMat.metalDark.roughness = 0.86;
  SMat.metalDark.envMapIntensity = 0.9;

  // Engine housing: heat-shielded, near-black, wide dull sheen.
  SMat.heat = new THREE.MeshPhysicalMaterial({
    map: heat.map, normalMap: heat.normalMap, roughnessMap: heat.roughnessMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0x585a60, roughness: 1.0, metalness: 0.85,
    envMapIntensity: 0.55,
  });

  // Ceramic nozzle liner — scorched pale, takes light very differently to metal.
  SMat.ceramic = new THREE.MeshPhysicalMaterial({
    map: heat.map, normalMap: heat.normalMap, roughnessMap: heat.roughnessMap,
    color: 0xb9ac9c, roughness: 0.95, metalness: 0.05,
    envMapIntensity: 0.7,
  });

  /* ── trim ───────────────────────────────────────────────────────────────── */

  SMat.red = new THREE.MeshPhysicalMaterial({
    color: 0xc31f2b, roughness: 0.28, metalness: 0.05,
    clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
  });
  SMat.redDark = new THREE.MeshPhysicalMaterial({
    color: 0x6d1018, roughness: 0.45, metalness: 0.1,
    clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.9,
  });
  SMat.blue = new THREE.MeshPhysicalMaterial({
    color: 0x1f56c6, roughness: 0.26, metalness: 0.1,
    clearcoat: 1.0, clearcoatRoughness: 0.1, envMapIntensity: 1.2,
  });
  SMat.gold = new THREE.MeshPhysicalMaterial({
    color: 0xd6a63c, roughness: 0.24, metalness: 1.0, envMapIntensity: 1.5,
  });

  /* ── canopy ─────────────────────────────────────────────────────────────── */

  // Thin enough that the cockpit reads through it, mirror-smooth so the sky
  // still rakes across it. depthWrite off, drawn after the interior.
  //
  // The tint has to be *light*: a dark glass over a dark tub is indistinguishable
  // from no canopy at all, which is how the previous revision managed to have a
  // fully modelled cockpit that nobody could see.
  SMat.glass = new THREE.MeshPhysicalMaterial({
    color: 0x8fb6cc, roughness: 0.03, metalness: 0.0,
    transparent: true, opacity: 0.18,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    specularIntensity: 1.0,
    envMapIntensity: 3.0, ior: 1.5,
    side: THREE.DoubleSide, depthWrite: false,
  });

  /* ── cockpit interior ───────────────────────────────────────────────────── */

  SMat.cockpit = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.92, metalness: 0.08 });
  SMat.seat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.88, metalness: 0.05 });
  SMat.harness = new THREE.MeshStandardMaterial({ color: 0x8a7b52, roughness: 0.95, metalness: 0.0 });
  SMat.suit = new THREE.MeshStandardMaterial({ color: 0x4a6b52, roughness: 0.9, metalness: 0.0 });
  SMat.glove = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.85, metalness: 0.05 });
  SMat.helmet = new THREE.MeshPhysicalMaterial({
    color: 0xe4e9f0, roughness: 0.26, metalness: 0.05,
    clearcoat: 0.9, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
  });
  SMat.visor = new THREE.MeshPhysicalMaterial({
    color: 0x3f2c0c, roughness: 0.06, metalness: 1.0, envMapIntensity: 2.0,
  });

  SMat.instrument = emissive(0x4de0c0, 2.2);
  SMat.instrumentAmber = emissive(0xffae3a, 2.0);
  SMat.instrumentRed = emissive(0xff4630, 2.4);
  SMat.hud = emissive(0x76ffd0, 1.4, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

  /* ── damage ─────────────────────────────────────────────────────────────── */

  SMat.scorch = new THREE.MeshStandardMaterial({
    color: 0x0d0b0a, roughness: 0.96, metalness: 0.15,
    transparent: true, opacity: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  SMat.guts = new THREE.MeshStandardMaterial({ color: 0x191d22, roughness: 0.85, metalness: 0.4 });
  SMat.wire = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.2 });
  SMat.ember = emissive(0xff7a24, 5.0);

  /* ── hostiles ───────────────────────────────────────────────────────────── */
  // Same construction quality, opposite design language: dark cold plating,
  // red trim, red-hot emissives. Friend/foe has to read at 300 m.

  SMat.hostile = new THREE.MeshPhysicalMaterial({
    map: dark.map, normalMap: dark.normalMap,
    roughnessMap: dark.roughnessMap, metalnessMap: dark.metalnessMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    color: 0x767c88, roughness: 0.82, metalness: 0.9,
    envMapIntensity: 0.95,
  });
  SMat.hostilePlate = SMat.hostile.clone();
  SMat.hostilePlate.color.setHex(0x3d434d);
  SMat.hostilePlate.roughness = 0.95;

  SMat.hostileTrim = new THREE.MeshPhysicalMaterial({
    color: 0x8e1620, roughness: 0.34, metalness: 0.25,
    clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 1.1,
  });
  SMat.hostileGlass = new THREE.MeshPhysicalMaterial({
    color: 0x2a0d10, roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.55,
    clearcoat: 1.0, clearcoatRoughness: 0.04,
    envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false,
  });
  SMat.hostileGlow = emissive(0xff2c18, 4.0);
  SMat.hostileGlowDim = emissive(0xd01808, 1.6);
  SMat.hostileSensor = emissive(0xff8a2a, 3.2);

  /* ── boss ───────────────────────────────────────────────────────────────── */

  SMat.bossHull = SMat.hostile.clone();
  SMat.bossHull.color.setHex(0x5e6470);
  SMat.bossArmour = new THREE.MeshPhysicalMaterial({
    map: heat.map, normalMap: heat.normalMap, roughnessMap: heat.roughnessMap,
    color: 0x7a6f66, roughness: 0.95, metalness: 0.7, envMapIntensity: 0.7,
  });
  SMat.bossCore = emissive(0xffc24a, 5.0);
  SMat.bossCoreHot = emissive(0xfff0c0, 9.0);

  return SMat;
}

/**
 * Patch a material so the vertex stage bends it with the wing.
 *
 * The wing, the tip fins, the laser pods and their trim are separate meshes but
 * must flex as one structure — so the bend is a pure function of world-space
 * span and every part of the assembly evaluates the same function. `fixed`
 * pins the weight for a part that lives at one station (a control surface),
 * everything else derives it from the vertex's own x.
 */
export const FLEX = { halfSpan: 3.42, amp: 0.40, sweepAmp: 0.05 };

/**
 * The CPU-side twin of the flex shader. Control-surface pivots are groups, not
 * vertices, so they cannot ride the vertex program — they have to evaluate the
 * identical bend function or they detach from the wing the moment it loads up.
 */
export function flexOffset(x, flex, roll, { halfSpan = FLEX.halfSpan, amp = FLEX.amp, sweepAmp = FLEX.sweepAmp } = {}) {
  const fw = Math.min(1, Math.abs(x) / halfSpan);
  const fw2 = fw * fw;
  return {
    dy: (flex + roll * Math.sign(x)) * fw2 * amp,
    dz: flex * fw2 * sweepAmp,
  };
}

export function flexMaterial(base, uniforms, {
  halfSpan = FLEX.halfSpan, fixed = null, offsetX = null, amp = FLEX.amp, sweepAmp = FLEX.sweepAmp,
} = {}) {
  const m = base.clone();
  const w = fixed == null ? null : Math.min(1, Math.abs(fixed) / halfSpan);
  const key = offsetX != null ? 'off' + offsetX.toFixed(3)
    : fixed == null ? 'span' : w.toFixed(3) + ':' + Math.sign(fixed);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlex = uniforms.flex;
    sh.uniforms.uFlexRoll = uniforms.roll;
    // A control surface lives in hinge-local space, so its own position.x is a
    // distance from the hinge, not a span. Adding the hinge station back gives
    // the shader the true span and the surface bends *with* the wing across its
    // own length instead of stepping rigidly at one station.
    const body = offsetX != null
      ? `float fx = position.x + ${offsetX.toFixed(4)};
         float fw = fx / ${halfSpan.toFixed(3)};
         float fw2 = min(1.0, fw * fw);
         float fs = sign(fx);`
      : fixed == null
      ? `float fw = position.x / ${halfSpan.toFixed(3)};
         float fw2 = fw * fw;
         float fs = sign(position.x);`
      : `float fw2 = ${(w * w).toFixed(5)};
         float fs = ${Math.sign(fixed).toFixed(1)};`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFlex;\nuniform float uFlexRoll;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { ${body}
          transformed.y += (uFlex + uFlexRoll * fs) * fw2 * ${amp.toFixed(3)};
          transformed.z += uFlex * fw2 * ${sweepAmp.toFixed(3)};
        }`);
  };
  m.customProgramCacheKey = () => 'vulpine-flex-' + key;
  return m;
}

export function disposeShipMaterials() {
  for (const k of Object.keys(SMat)) { SMat[k]?.dispose?.(); delete SMat[k]; }
  built = false;
}
