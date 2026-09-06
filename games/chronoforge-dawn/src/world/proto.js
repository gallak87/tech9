import * as THREE from 'three';
import { fbm2D, ridge2D, rng } from '../core/rng.js';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 0 PLACEHOLDER — the 240 m dune field and its material-study prop
// cluster, MOVED HERE UNCHANGED from src/world/index.js. Not a rewrite: the
// height field, the colour ramp, the prop cluster, the seeded scatter and both
// focus points are the same code producing the same bytes.
//
// It exists for one reason: the verification harness needs something REAL to
// photograph. A grey box tells you nothing about whether the lighting, the tone
// curve, the shadow bias or the material response are right, and every one of
// those has to be right before the world lane starts or they will debug the
// engine while they think they are debugging terrain.
//
// So this is a heightfield with genuine elevation, vertex-coloured by height and
// slope, a handful of props chosen to span the material gamut (rock, metal,
// painted dielectric, emissive neon) and an instanced scatter so contact shadows
// have something to land on.
//
// What it is NOT: biomes, fog of war, weather, rivers, cities, or any authored
// layout. That is what the twelve real maps in docs/specs/ are for; `proto` is
// the CONTROL SURFACE they are measured against.
//
// TWO THINGS DEPEND ON IT AND NEITHER MAY BREAK (docs/specs/world-runtime.md):
//   * every probe baseline in docs/STATUS.json was measured on this surface;
//   * Phase 2.5's character gate drives on it and needs a 34° slope to exist.
// So it stays the default, and nothing in this file is "tidied".
// ─────────────────────────────────────────────────────────────────────────────

export const PROTO_ID = 'proto';
const SIZE = 240;          // metres across
const SEGMENTS = 240;      // 1 m vertex spacing — Nyquist floor for the detail
const HALF = SIZE / 2;

/** The world height field, in metres. Deterministic and callable from probes. */
export function heightAt(x, z) {
  const s = 0.0068;
  const roll = fbm2D(x * s + 40, z * s + 17, { octaves: 5, gain: 0.5, seed: 101 }) - 0.5;
  const ridges = ridge2D(x * s * 0.62 + 9, z * s * 0.62 + 3, { octaves: 4, gain: 0.55, seed: 57 });
  const grit = fbm2D(x * 0.062, z * 0.062, { octaves: 3, gain: 0.5, seed: 404 }) - 0.5;

  let h = roll * 21 + Math.pow(ridges, 2.4) * 30 + grit * 0.55;

  // A dry riverbed running roughly NE→SW. Elevation alone is not "vertical
  // interest" — a world needs somewhere the ground goes DOWN, or the shadows
  // never cross anything.
  const bedX = Math.sin(z * 0.017) * 26 - 12;
  const d = Math.abs(x - bedX);
  const cut = Math.exp(-(d * d) / (2 * 15 * 15));
  h -= cut * 7.5;

  return h;
}

/** Surface normal by central difference — traversal and fx both need it. */
export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.6;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// Albedo, not "colour I like in a swatch". Dry dusty earth reflects ~25-30% of
// the light that hits it; the first pass used 0x6b5c44 (11% luminance), which is
// wet tarmac, and no amount of exposure recovers a frame from that — it only
// blows the sky trying. Brighten the surface, then set exposure.
const C_LOW = new THREE.Color(0x5c6b46);   // damp riverbed green
const C_MID = new THREE.Color(0x9d8259);   // dusty earth — the base palette
const C_HIGH = new THREE.Color(0xc2b6a0);  // exposed pale rock
const C_CLIFF = new THREE.Color(0x7e7469); // steep faces, cooler and darker
const _c = new THREE.Color();

function buildTerrain(materials) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
  }
  // Colour AFTER every height is written, so the slope term sees final geometry.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    normalAt(x, z, n);
    const slope = 1 - n.y;                               // 0 flat … 1 vertical
    const t = THREE.MathUtils.clamp((y + 9) / 26, 0, 1);
    _c.copy(C_LOW).lerp(C_MID, THREE.MathUtils.smoothstep(t, 0.0, 0.45));
    _c.lerp(C_HIGH, THREE.MathUtils.smoothstep(t, 0.45, 0.95));
    _c.lerp(C_CLIFF, THREE.MathUtils.smoothstep(slope, 0.22, 0.7));
    // Low-frequency mottling so the ground is never one flat wash. Kept coarse
    // on purpose — fine noise here would alias under the camera's pixel snap.
    const v = fbm2D(x * 0.031, z * 0.031, { octaves: 3, seed: 777 });
    _c.multiplyScalar(0.80 + v * 0.34);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, materials.ground);
  mesh.receiveShadow = true;
  mesh.castShadow = true;          // ridges must shadow the valley behind them
  mesh.name = 'terrain';
  return mesh;
}

/** A rock: an icosahedron pushed around by the same noise as the terrain, so
 *  the props and the ground look like they came from one place. */
function makeRock(radius, seed, materials) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = ridge2D(v.x * 0.9 + seed, v.z * 0.9 + v.y * 0.6, { octaves: 3, seed });
    v.multiplyScalar(0.74 + d * 0.5);
    v.y *= 0.78;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, materials.rock);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A terraformer pylon: metal shaft, painted collar, neon trim. Three materials
 *  in one silhouette is the fastest way to see whether light is doing its job. */
function makePylon(materials, height = 7.5) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.66, height, 12, 1), materials.metal);
  shaft.position.y = height / 2;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.7, 12), materials.painted);
  collar.position.y = height * 0.62;
  const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), materials.metal);
  cap.position.y = height + 0.25;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 8, 28), materials.neonCyan);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = height * 0.62;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.07, height * 0.7, 0.07), materials.neonMagenta);
  spine.position.set(0.5, height * 0.42, 0);
  for (const m of [shaft, collar, cap, trim, spine]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/**
 * Build the placeholder into a detachable group.
 *
 * Every mesh here draws with a SHARED material, so `owned` is empty and nothing
 * in this subtree may have its material disposed.
 */
export function buildProto(ctx) {
  const { materials } = ctx;
  const group = new THREE.Group();
  group.name = 'map:proto';

  group.add(buildTerrain(materials));

  // Rewind the named streams before drawing from them. On the FIRST build this
  // is a no-op — a fresh stream is already at its reset state, which is why the
  // baselines still reproduce — but `setMap('proto')` after eleven other maps
  // must lay the same boulders down, and a stream is page-lifetime state.
  const r = rng('world.phase0.props').reset();
  const props = new THREE.Group();
  props.name = 'props';
  group.add(props);

  // Material study cluster.
  //
  // The location is not arbitrary and must not be "tidied" back to the origin:
  // at DAWN_HOUR the sun is 15.8° up in the east, and most of this terrain is in
  // the shadow of the ridge line east of it — including the origin, which is why
  // the first pass produced a flat, shadowless hero frame that looked like a
  // lighting bug and was not one. This shoulder was picked by marching the sun
  // ray across the height field: it is lit, it has 15 m of relief within 22 m,
  // and two thirds of its neighbourhood is sunlit, so long shadows actually
  // cross something. Re-run that search if heightAt() ever changes.
  const cx = -24, cz = -57;
  const pylon = makePylon(materials);
  pylon.position.set(cx + 3.4, heightAt(cx + 3.4, cz - 1), cz - 1);
  props.add(pylon);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.35, 40, 24), materials.metal);
  sphere.position.set(cx - 3.2, heightAt(cx - 3.2, cz + 2.4) + 1.35, cz + 2.4);
  sphere.castShadow = sphere.receiveShadow = true;
  props.add(sphere);

  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.5, 8, 20), materials.painted);
  capsule.position.set(cx - 0.4, heightAt(cx - 0.4, cz + 3.6) + 1.36, cz + 3.6);
  capsule.castShadow = capsule.receiveShadow = true;
  props.add(capsule);

  // Boulders, scattered on the seeded stream so the layout is reproducible.
  for (let i = 0; i < 26; i++) {
    const a = r.range(0, Math.PI * 2), d = 8 + r.range(0, 78) * r.range(0.3, 1);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const rock = makeRock(r.range(0.5, 2.4), 100 + i, materials);
    rock.position.set(x, heightAt(x, z) - 0.25, z);
    rock.rotation.set(r.range(-0.3, 0.3), r.range(0, 6.28), r.range(-0.3, 0.3));
    props.add(rock);
  }

  // Pebble scatter as a single InstancedMesh — 900 draw calls is the budget and
  // 700 pebbles as separate meshes would spend most of it here.
  const pebGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const pebbles = new THREE.InstancedMesh(pebGeo, materials.rock, 700);
  pebbles.castShadow = pebbles.receiveShadow = true;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const pr = rng('world.phase0.pebbles').reset();
  for (let i = 0; i < 700; i++) {
    const x = pr.range(-HALF + 4, HALF - 4), z = pr.range(-HALF + 4, HALF - 4);
    pv.set(x, heightAt(x, z) + 0.06, z);
    e.set(pr.range(0, 6.28), pr.range(0, 6.28), pr.range(0, 6.28));
    q.setFromEuler(e);
    const s = pr.range(0.5, 1.7);
    sc.set(s, s * 0.7, s);
    mtx.compose(pv, q, sc);
    pebbles.setMatrixAt(i, mtx);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  props.add(pebbles);

  return {
    group,
    owned: [],
    focus: new THREE.Vector3(cx, heightAt(cx, cz), cz),
    propFocus: new THREE.Vector3(cx, heightAt(cx, cz) + 1.4, cz + 1.5),
    size: SIZE,
    widthM: SIZE, depthM: SIZE,
    heightAt, normalAt,
    stats: { segX: SEGMENTS, segZ: SEGMENTS, vertices: (SEGMENTS + 1) ** 2, triangles: SEGMENTS * SEGMENTS * 2 },
  };
}
