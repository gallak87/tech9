import * as THREE from 'three';
import { fbm2D } from '../core/rng.js';
import { BIOMES, VERTEX_SPACING_M, craterCentres } from '../../docs/specs/heightfields.mjs';
import { MAPS } from '../../docs/specs/world-graph.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// The mesh builder. BLOCKED-IN GROUND ONLY (world-runtime.md "What Phase 4a is
// NOT"): one terrain mesh per map, vertex-coloured from the biome's authored
// albedo table, plus a water plane where the biome has one and an ember tint
// where it has a lava channel. No props, no scatter, no fog, no weather.
//
// Vertex colour is the whole look surface this pass. `render/` is frozen, so
// `materials.ground` is used exactly as the Phase 0 placeholder uses it and no
// material in the shared kit is added to or mutated (CONTRACT.md §4.8).
// ─────────────────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const _c = new THREE.Color();
const _n = new THREE.Vector3();

/** One draw call per map at 0.5 m spacing. 90x60 m = 180x120 segments =
 *  181x121 = 21,901 vertices / 43,200 triangles — 1.7% of the 2.6 M budget. */
export function meshCost(widthM, depthM, spacing = VERTEX_SPACING_M) {
  const segX = Math.round(widthM / spacing);
  const segZ = Math.round(depthM / spacing);
  return {
    segX, segZ,
    vertices: (segX + 1) * (segZ + 1),
    triangles: segX * segZ * 2,
  };
}

/** Distance from (x,z) to a polyline, in the polyline's own units. */
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const vx = bx - ax, vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
    const dx = x - (ax + vx * t), dz = z - (az + vz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/** The lava channel, in WORLD metres.
 *
 *  `lavaChannel` in heightfields.mjs carries a width, a depth and an emissive
 *  colour but no route — the field itself never evaluates it. The craters do
 *  have authored centres, and molten rock running between the vents is the
 *  reading that needs no invented data, so the route is the polyline through
 *  `craterCentres` in authored order. */
function lavaRoute(field) {
  const b = BIOMES[field.biomeId];
  if (!b?.lavaChannel || !b.carve || b.carve.kind !== 'craters') return null;
  const pts = craterCentres(b.carve).map((c) => ({ x: c.cx - field.halfW, z: c.cz - field.halfD }));
  if (pts.length < 2) return null;
  return { pts, ...b.lavaChannel, colour: new THREE.Color(b.lavaChannel.emissive) };
}

/** Albedo palette for a map. Interiors carry a `biome` key too — the floor is
 *  the region's stone, just flatter — so both paths read the same authored table. */
function paletteOf(mapId) {
  const a = BIOMES[MAPS[mapId].biome].albedo;
  return {
    low: new THREE.Color(a.low),
    mid: new THREE.Color(a.mid),
    high: new THREE.Color(a.high),
    cliff: new THREE.Color(a.cliff),
  };
}

/**
 * Build the ground for one map.
 *
 * @param {object} field  from makeField()
 * @param {object} ctx    the shared context (materials only)
 * @returns {{ group: THREE.Group, owned: THREE.Material[], stats: object }}
 *          `owned` are materials THIS build allocated. Everything else in the
 *          group draws with a SHARED material and must never be disposed.
 */
export function buildMap(field, ctx) {
  const group = new THREE.Group();
  group.name = `map:${field.mapId}`;
  const owned = [];

  const { segX, segZ, vertices, triangles } = meshCost(field.widthM, field.depthM);
  const geo = new THREE.PlaneGeometry(field.widthM, field.depthM, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = field.heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, y);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const pal = paletteOf(field.mapId);
  const lava = lavaRoute(field);
  const span = Math.max(1e-3, maxY - minY);
  // Steepness is read against the BIOME's own ceiling, not a fixed one. The
  // placeholder's 0.22–0.7 band was cut for a 240 m field with 45° walls; these
  // fields top out at 18–33°, where `1 - n.y` never even reaches 0.22, so a
  // fixed band paints every biome with zero cliff and the carves go flat.
  const cliffRef = Math.max(1e-3, field.cliffRef);

  // Colour AFTER every height is written, so the slope term sees final geometry.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    field.normalAt(x, z, _n);
    const slope = (1 - _n.y) / cliffRef;              // 0 flat … 1 at the ceiling
    const t = (y - minY) / span;
    _c.copy(pal.low).lerp(pal.mid, THREE.MathUtils.smoothstep(t, 0.0, 0.45));
    _c.lerp(pal.high, THREE.MathUtils.smoothstep(t, 0.45, 0.95));
    _c.lerp(pal.cliff, THREE.MathUtils.smoothstep(slope, 0.45, 1.0));
    // Low-frequency mottling so the ground is never one flat wash. Kept coarse
    // on purpose — fine noise here would alias under the camera's pixel snap.
    const v = fbm2D(x * 0.031, z * 0.031, { octaves: 3, seed: 777 });
    _c.multiplyScalar(0.80 + v * 0.34);

    if (lava) {
      // Emissive as vertex colour, per the Phase 4a brief: no emissive material
      // is added, so this reads as HOT ROCK rather than as light. The lift above
      // 1.0 is what the bloom threshold catches at the channel centre.
      const d = distToPolyline(x, z, lava.pts);
      const k = 1 - THREE.MathUtils.smoothstep(d, lava.widthM * 0.5, lava.widthM * 1.6);
      if (k > 0) { _c.lerp(lava.colour, k * 0.9); _c.multiplyScalar(1 + k * 0.55); }
    }

    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const terrain = new THREE.Mesh(geo, ctx.materials.ground);
  terrain.receiveShadow = true;
  terrain.castShadow = true;          // ridges must shadow the valley behind them
  terrain.name = 'terrain';
  group.add(terrain);

  // ── standing water ────────────────────────────────────────────────────────
  // mire_bog only. Flat and translucent: no shader, no reflection, no normal
  // animation — this is a blocked-in pass and defect 5 is about the GROUND.
  let waterY = null;
  if (field.waterPlaneY != null) {
    waterY = field.waterPlaneY;
    const wgeo = new THREE.PlaneGeometry(field.widthM, field.depthM, 1, 1);
    wgeo.rotateX(-Math.PI / 2);
    // A CLONE of the shared ground material, never the instance (CONTRACT.md
    // §4.8). Clone shares the parent's texture objects, so this material is
    // disposed by hand on teardown and never through disposeTree.
    const wmat = ctx.materials.ground.clone();
    wmat.vertexColors = false;
    wmat.color = new THREE.Color(BIOMES[field.biomeId].albedo.low).multiplyScalar(0.55);
    wmat.roughness = 0.16;
    wmat.metalness = 0.0;
    wmat.transparent = true;
    wmat.opacity = 0.66;
    wmat.depthWrite = false;
    wmat.normalScale = new THREE.Vector2(0.12, 0.12);
    owned.push(wmat);
    const water = new THREE.Mesh(wgeo, wmat);
    water.position.y = waterY;
    water.receiveShadow = true;
    water.name = 'water';
    group.add(water);
  }

  return {
    group, owned,
    stats: {
      segX, segZ, vertices, triangles,
      minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), reliefM: +(maxY - minY).toFixed(2),
      waterY: waterY == null ? null : +waterY.toFixed(2),
      lava: !!lava,
      meshes: group.children.length,
    },
  };
}

export { DEG };
