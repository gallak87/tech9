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

/** The world size the shared ground detail maps were tuned against.
 *
 *  `materials.ground` bakes `repeat: 11` into its normal and roughness maps,
 *  and a PlaneGeometry's UVs run 0..1 whatever the plane measures — so those 11
 *  repeats land every 21.8 m on the 240 m placeholder and every 8.2 x 5.5 m on
 *  a 90 x 60 m map. That is both four times too dense and ANISOTROPIC, and it
 *  reads on screen as a woven pattern crawling over the whole surface.
 *
 *  render/ is frozen, so the fix belongs to the geometry: scale the UVs by the
 *  map's size against this reference and every map gets the placeholder's exact
 *  world-space detail density on both axes. */
const DETAIL_REFERENCE_M = 240;

/** Retile the detail maps to world metres. See DETAIL_REFERENCE_M. */
function scaleDetailUVs(geo, widthM, depthM) {
  const uv = geo.attributes.uv;
  const sx = widthM / DETAIL_REFERENCE_M, sy = depthM / DETAIL_REFERENCE_M;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return geo;
}

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
  scaleDetailUVs(geo, field.widthM, field.depthM);

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
      // is added, so this reads as HOT ROCK rather than as light.
      //
      // The band is the AUTHORED 3.5 m and not a metre more. The first pass
      // faded from 0.5w to 1.6w and lifted the result 1.55x; bloom turned that
      // into a 20 m orange blob with white holes in it, which is the "flat white
      // hole" failure the probe exists to catch. Full colour inside 0.3w, gone
      // by 0.55w, and the lift stays under the bloom threshold.
      const d = distToPolyline(x, z, lava.pts);
      const k = 1 - THREE.MathUtils.smoothstep(d, lava.widthM * 0.30, lava.widthM * 0.55);
      if (k > 0) { _c.lerp(lava.colour, k * 0.85); _c.multiplyScalar(1 + k * 0.22); }
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
    scaleDetailUVs(wgeo, field.widthM, field.depthM);
    // A CLONE of the shared ground material, never the instance (CONTRACT.md
    // §4.8). Clone shares the parent's texture objects, so this material is
    // disposed by hand on teardown and never through disposeTree.
    const wmat = ctx.materials.ground.clone();
    wmat.vertexColors = false;
    // Darker and cooler than the bank it sits in, or the pools read as mud
    // rather than as standing water. Low roughness plus a lifted envMap is the
    // whole trick: what makes water look like water at a raking dawn key is
    // that it reflects the SKY and the ground does not.
    wmat.color = new THREE.Color(BIOMES[field.biomeId].albedo.low).multiplyScalar(0.34);
    wmat.roughness = 0.08;
    wmat.metalness = 0.0;
    wmat.envMapIntensity = 1.6;
    wmat.transparent = true;
    wmat.opacity = 0.80;
    wmat.depthWrite = false;
    wmat.normalScale = new THREE.Vector2(0.10, 0.10);
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
