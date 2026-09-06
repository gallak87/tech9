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

/** Side of one ground-detail texture tile, in world metres.
 *
 *  `materials.ground` bakes `repeat: 11` into its normal and roughness maps,
 *  and a PlaneGeometry's UVs run 0..1 whatever the plane measures. So the tile
 *  size is set by the geometry, not the material, and the geometry is this
 *  lane's — which matters because render/ is frozen.
 *
 *  MEASURED AT THE CAMERA THAT MATTERS. Matching the 240 m placeholder's
 *  density put one tile every 21.8 m, which is fine at the `wide` review
 *  camera 132 m out and catastrophic at the locked gameplay camera: that one
 *  frames FRAME_HEIGHT_M 18 m of world, so a 21.8 m tile is LARGER THAN THE
 *  SCREEN and the normal map reads as metre-wide plastic blobs rather than as
 *  ground. 2 m puts ~16 tiles across the frame — detail you read as surface,
 *  and still eight vertices per tile at VERTEX_SPACING_M so it survives the
 *  pixel-snap pass. */
const DETAIL_TILE_M = 2.0;

/** Repeats baked into materials.ground's detail maps by render/materials.js. */
const GROUND_MAP_REPEAT = 11;

/** Retile the detail maps to world metres, isotropically. See DETAIL_TILE_M. */
function scaleDetailUVs(geo, widthM, depthM) {
  const uv = geo.attributes.uv;
  const k = 1 / (DETAIL_TILE_M * GROUND_MAP_REPEAT);
  const sx = widthM * k, sy = depthM * k;
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

// ── the sea ─────────────────────────────────────────────────────────────────
// A `shore` carve tips the ground toward an edge, and until something fills the
// low ground the carve reads as a plate that got thinner on one side. Only
// grassland_ruins carves a shore; the sea is west of Haventide per the donor art
// and heightfields.mjs's own note on that carve.

/** Metres of water above the field's lowest point.
 *
 *  Measured, not picked: the shore drops 2.6 m over its 32 m run, so a 1.25 m
 *  fill puts the waterline 9-13 m in from the west edge depending on z — the
 *  coast then follows the terrain instead of ruling a straight line down the
 *  map — and leaves roughly 4 m of wet sand above it. */
const SHORE_SEA_LIFT_M = 1.25;

/** How far past the map the water runs. The sea stops at the map's EASTERN
 *  edge and does not wrap: filling all four sides would make Haventide an
 *  island, which is a design change and not a blocking-in decision. */
const SEA_REACH_M = 400;

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
  const shore = BIOMES[field.biomeId]?.carve?.kind === 'shore'
    ? { seaY: minY + SHORE_SEA_LIFT_M }
    : null;
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
    // Beach. The height ramp above already reaches `low` at the bottom of the
    // map, which for a shore biome is the wet ground — so the sand is a lerp
    // back toward `high`, the palette's own pale rock, rather than a colour
    // this file invented. Sand runs from a little under the waterline (visible
    // through the water) to 0.8 m above it, so the band follows the coast.
    if (shore) {
      const s = 1 - THREE.MathUtils.smoothstep(y, shore.seaY - 0.9, shore.seaY + 0.8);
      if (s > 0) _c.lerp(pal.high, s * 0.72);
    }
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

  // ── the sea ───────────────────────────────────────────────────────────────
  // Haventide only, and only because its biome carves a shore. Runs SEA_REACH_M
  // past the west, north and south edges so the water reaches the horizon
  // instead of ending in a visible rectangle; stops dead at the map's eastern
  // edge, where the inland ground is 2 m above it and hides the cut.
  let seaY = null;
  if (shore) {
    seaY = shore.seaY;
    const w = field.halfW + SEA_REACH_M;      // west edge out to the horizon
    const d = field.depthM + SEA_REACH_M * 2;
    const sgeo = new THREE.PlaneGeometry(w, d, 1, 1);
    sgeo.rotateX(-Math.PI / 2);
    scaleDetailUVs(sgeo, w, d);
    // A CLONE of the shared ground material, never the instance (CONTRACT.md
    // §4.8) — disposed by hand on teardown, since it still points at the shared
    // ground textures that disposeTree would take with it.
    const smat = ctx.materials.ground.clone();
    smat.vertexColors = false;
    // Open water, unlike the bog: it is deep, so it reads by REFLECTING the sky
    // rather than by showing the bed. Hence near-zero roughness and a lifted
    // envMap, and a tint pulled off the biome's own damp low tone so the coast
    // and the sea belong to one palette.
    smat.color = new THREE.Color(BIOMES[field.biomeId].albedo.low).multiplyScalar(0.42);
    smat.roughness = 0.05;
    smat.metalness = 0.0;
    smat.envMapIntensity = 2.2;
    smat.transparent = true;
    smat.opacity = 0.88;
    smat.depthWrite = false;
    smat.normalScale = new THREE.Vector2(0.06, 0.06);
    owned.push(smat);
    const sea = new THREE.Mesh(sgeo, smat);
    // Centre it so its EAST edge lands on the map's east edge.
    sea.position.set(field.halfW - w / 2, seaY, 0);
    sea.receiveShadow = true;
    sea.name = 'sea';
    group.add(sea);
  }

  return {
    group, owned,
    stats: {
      segX, segZ, vertices, triangles,
      minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), reliefM: +(maxY - minY).toFixed(2),
      waterY: waterY == null ? null : +waterY.toFixed(2),
      seaY: seaY == null ? null : +seaY.toFixed(2),
      lava: !!lava,
      meshes: group.children.length,
    },
  };
}

export { DEG };
