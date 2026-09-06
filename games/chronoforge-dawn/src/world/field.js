import * as THREE from 'three';
import { fbm2D } from '../core/rng.js';
import {
  BIOMES, INTERIOR_FIELD, VERTEX_SPACING_M, MAX_WALKABLE_SLOPE_DEG,
  heightAt as specHeightAt, waterPlaneOf,
} from '../../docs/specs/heightfields.mjs';
import { MAPS, TILE_M } from '../../docs/specs/world-graph.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// The field adapter — the ONE place where authored space becomes engine space.
//
// docs/specs/heightfields.mjs evaluates in MAP-LOCAL metres with the origin at
// the map's NW corner. The engine centres every map on the world origin. So:
//
//     xLocal = worldX + widthM / 2        worldX = xLocal - widthM / 2
//     zLocal = worldZ + depthM / 2        worldZ = zLocal - depthM / 2
//
// Nothing outside this file does that arithmetic, and nothing outside
// src/world/ sees a tile (CONTRACT.md §4.10).
//
// The spec module is imported, not copied. It is a RUNNABLE spec — the same
// file `node docs/specs/heightfields.mjs` gates — so there is exactly one
// heightAt in the repo, the same way src/actors/rig.js imports docs/specs/rig.mjs.
// ─────────────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Signed value noise in [-1,1] at a wavelength in metres.
 *  Same construction as the spec's private `sfbm`; it is not exported, and the
 *  interior floor is the one field the spec does not evaluate for us. */
const sfbm = (x, z, lam, o) =>
  fbm2D(x / lam, z / lam, { octaves: o.octaves, lacunarity: o.lacunarity, gain: o.gain, seed: o.seed }) * 2 - 1;

/** Interiors are floors, not terrain: INTERIOR_FIELD's micro-relief only, so a
 *  contact shadow does not land on a mathematically perfect plane. `amplitudeM`
 *  is peak-to-peak everywhere in the spec, hence the halving. No BASE_FIT — that
 *  constant corrects the multi-octave biome stack's measured range, and this is
 *  two octaves of one term. */
function interiorHeightAt(xLocal, zLocal) {
  const f = INTERIOR_FIELD;
  return sfbm(xLocal, zLocal, f.wavelengthM, f) * (f.amplitudeM / 2);
}

/**
 * Build the field for one map.
 *
 * @param {string} mapId  any key of world-graph MAPS
 * @returns {{
 *   mapId: string, biomeId: string|null, isInterior: boolean,
 *   widthM: number, depthM: number, halfW: number, halfD: number,
 *   maxSlopeDeg: number, waterPlaneY: number|null,
 *   heightAt(x:number, z:number): number,
 *   normalAt(x:number, z:number, out?:THREE.Vector3): THREE.Vector3,
 *   toWorld(tx:number, ty:number, out?:THREE.Vector3): THREE.Vector3,
 *   toLocal(x:number, z:number, out?:{x:number,z:number}): {x:number,z:number},
 * }}
 */
export function makeField(mapId) {
  const m = MAPS[mapId];
  if (!m) throw new Error(`[world] unknown map "${mapId}"`);

  const isInterior = !!m.isInterior;
  const biomeId = isInterior ? null : m.biome;
  const widthM = m.w * TILE_M;
  const depthM = m.h * TILE_M;
  const halfW = widthM / 2;
  const halfD = depthM / 2;

  const biome = BIOMES[m.biome] || null;
  const maxSlopeDeg = isInterior
    ? INTERIOR_FIELD.maxSlopeDeg
    : (biome?.maxSlopeDeg ?? MAX_WALKABLE_SLOPE_DEG);

  const evalLocal = isInterior
    ? interiorHeightAt
    : (xl, zl) => specHeightAt(biomeId, xl, zl);

  /** WORLD metres in, metres out.
   *
   *  Outside the extents the local coordinate is CLAMPED to the boundary rather
   *  than let through. Extrapolating the noise past the edge is free elevation
   *  nobody authored and nobody gated: the spec proves every slope under
   *  MAX_WALKABLE_SLOPE_DEG *inside* the map only. Clamping makes the surface
   *  outside a flat skirt at the edge value, so an actor pushed past the
   *  boundary — traversal clamps to ±size/2 - 4, which is generous on the short
   *  axis of a rectangular map — still stands on ground instead of falling. */
  function heightAt(x, z) {
    return evalLocal(
      clamp(x + halfW, 0, widthM),
      clamp(z + halfD, 0, depthM),
    );
  }

  /** Surface normal by central difference, at the mesh's own spacing. */
  function normalAt(x, z, out = new THREE.Vector3()) {
    const e = VERTEX_SPACING_M;
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  /** Tile (authoring data) -> world metres, y on the surface. */
  function toWorld(tx, ty, out = new THREE.Vector3()) {
    const x = (tx + 0.5) * TILE_M - halfW;
    const z = (ty + 0.5) * TILE_M - halfD;
    return out.set(x, heightAt(x, z), z);
  }

  /** World metres -> map-local metres. For anything that has to talk to the spec. */
  function toLocal(x, z, out = { x: 0, z: 0 }) {
    out.x = x + halfW; out.z = z + halfD;
    return out;
  }

  return {
    mapId, biomeId, isInterior,
    widthM, depthM, halfW, halfD,
    maxSlopeDeg,
    /** Absolute Y of the standing-water plane, or null. Spec-derived (field
     *  median + the authored offset), so it costs one full map sample — cached
     *  by the spec, and only mire_bog has one. */
    waterPlaneY: biomeId ? waterPlaneOf(biomeId) : null,
    /** Cliff colour is keyed off the biome's own ceiling, not a global one. */
    cliffRef: 1 - Math.cos(maxSlopeDeg * DEG),
    heightAt, normalAt, toWorld, toLocal,
  };
}

export { VERTEX_SPACING_M };
