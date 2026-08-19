import * as THREE from 'three';
import {
  WORLD, DNA, setActiveDNA, centrelineX, centrelineY,
  terrainHeight, terrainNormal, profileAt, heightAtU,
} from './profile.js';
import { DNA_CORNERIA, DNA_FICHINA, DNA_BY_ID } from './dna.js';
import {
  terrainMaterial, waterMaterial, deepWaterMaterial, iceMaterial, rockPropMaterial,
  concreteMaterial, steelMaterial, cityMaterial,
  configureWorldFields, worldFieldJobs, disposeWorldFields,
} from './world-materials.js';
import { Terrain } from './terrain.js';
import { Belt } from './belt.js';
import { Works } from './works.js';
import { Water } from './water.js';
import { PlanarReflection } from './reflection.js';
import { registerWorldShots } from './shots.js';

// ─────────────────────────────────────────────────────────────────────────────
// The world you fly down at 175 m/s.
//
// One world is live at a time and it is described by a DNA (see dna.js): nine
// kilometres of corridor, a cross-section that changes along it, a surface at
// y = 0 and a skin. Corneria is a river — an open bay, a gorge that closes to a
// hundred metres, a city up both banks, a breached dam and a delta. Fichina is
// a glacial trough of the same length and nothing else the same.
//
// This file owns nothing but the assembly; the shape lives in profile.js, the
// meshing in terrain.js / water.js.
//
// World axes: the rail runs toward -Z, +X is right, +Y is up. The surface is at
// `WORLD.waterLevel`.
//
// ── Swapping worlds mid-flight ───────────────────────────────────────────────
// `rebuild(dna)` swaps the DNA immediately and then meshes the new world over
// as many frames as the caller is willing to pay for, via `step(budgetMs)`.
// Immediately means immediately: `groundAt`, `landAt` and `centrelineX` answer
// for the *new* world from the instant `rebuild` returns, because they are pure
// functions of the height field and need no mesh. The flight model can keep
// asking for clearance every tick across the whole transition and will get the
// right number for the world it is descending into — there is simply nothing
// drawn there yet.
// ─────────────────────────────────────────────────────────────────────────────

export { WORLD, DNA, centrelineX, centrelineY, terrainHeight, terrainNormal };
export { DNA_CORNERIA, DNA_FICHINA, DNA_BY_ID };

/**
 * Metres below the rail that a field world's play volume closes. Not ground:
 * nothing is drawn there and the player's offset box bottoms out at 46.
 */
const FIELD_FLOOR = 150;

export class Corneria {
  constructor(scene, dna = DNA_CORNERIA) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'corneria';
    scene.add(this.root);

    this._time = 0;
    this._camPos = new THREE.Vector3(0, 60, 0);
    this._renderer = null;
    this._camera = null;
    this._reflHide = [];

    // Both surface materials share one reflector, by uniform identity — the
    // per-frame update happens once, in reflection.js. It outlives a rebuild:
    // the plane may move, but the render target and its uniforms do not need
    // to be thrown away to do that.
    this.reflection = new PlanarReflection(scene, { planeY: dna.waterLevel ?? 0 });

    this.terrainMat = null;
    this.waterMat = null;
    this.deepMat = null;
    this.terrain = null;
    this.water = null;
    this.belt = null;
    this.works = null;

    this._jobs = [];
    this._done = 0;

    // A one-triangle sentinel drawn before everything else, purely so the world
    // learns where the camera is. `update(dt)` has no other way to find out, and
    // distance-driven LOD is the difference between 90k and 900k triangles.
    this._probe = this._makeProbe();
    this.root.add(this._probe);

    this.rebuild(dna);
    // Boot has no frame budget to spend and main.js expects a finished world.
    while (this.step(Infinity) < 1);

    registerWorldShots(this);
  }

  _makeProbe() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100000;
    mesh.onBeforeRender = (renderer, _s, camera) => {
      this._camPos.copy(camera.position);
      // The only handle the world has on the renderer. A rebuild needs it to
      // warm the new shaders before the first frame that draws them.
      this._renderer = renderer;
      this._camera = camera;
      // LOD first, or the mirrored pass draws a different tier than the screen.
      this._applyLOD();
      this._reflect(renderer, camera);
    };
    return mesh;
  }

  /* ── build ──────────────────────────────────────────────────────────────── */

  /**
   * Begin swapping the world to `dna`. Disposes the terrain, surface, materials
   * and baked fields of the world being replaced, makes `dna` active, and
   * queues the build.
   *
   * Nothing is meshed here. Drive `step(budgetMs)` once per frame until it
   * returns 1.
   *
   * @returns {{step:(ms:number)=>number, progress:number, done:boolean}}
   */
  rebuild(dna) {
    if (this.terrain) this.terrain.dispose();
    if (this.water) this.water.dispose();
    if (this.belt) this.belt.dispose();
    if (this.works) this.works.dispose();
    for (const m of [this.terrainMat, this.waterMat, this.deepMat]) if (m) m.dispose();
    this.terrain = this.water = this.belt = this.works = null;
    this.terrainMat = this.waterMat = this.deepMat = null;
    disposeWorldFields();

    setActiveDNA(dna);
    configureWorldFields();
    this.reflection.planeY = WORLD.waterLevel;

    // Constructing these meshes nothing: each only plans its tiers and hands
    // back a queue. That is what lets the whole job list — and therefore the
    // progress denominator — be known before the first frame of the swap.
    //
    // The backend decides what a world is made of. A `field` world has no
    // heightfield, so it has no terrain, no surface plane and no baked shore or
    // horizon — those three fields are all defined in rail space against a
    // continuous ground that is not there.
    const field = WORLD.backend === 'field';
    const built = WORLD.backend === 'works';
    const natural = !field && !built;
    this.terrain = natural ? new Terrain(this.root, null) : null;
    this.belt = field ? new Belt(this.root, null) : null;
    this.works = built ? new Works(this.root, null) : null;
    this.water = (natural && WORLD.surface !== 'none')
      ? new Water(this.root, null, null, { apronDrop: WORLD.surface === 'ice' ? 1.5 : 12 })
      : null;

    // Order is a dependency chain: the tile bakes and the materials come first
    // because a mesh needs one handed to it, and the baked fields come before
    // any mesh exists because the first frame that draws one compiles a shader
    // that samples them.
    this._jobs = [
      () => this._makeMaterials(),
      ...(natural ? worldFieldJobs() : []),
      ...(this.terrain ? this.terrain.jobs : []),
      ...(this.belt ? this.belt.jobs : []),
      ...(this.works ? this.works.jobs : []),
      ...(this.water ? this.water.jobs : []),
      () => this._warm(),
    ];
    this._done = 0;

    return {
      step: (ms) => this.step(ms),
      get progress() { return this.buildProgress; },
      get done() { return this.buildProgress >= 1; },
    };
  }

  _makeMaterials() {
    if (WORLD.backend === 'works') {
      // Three materials, because a built thing is three materials: plate you
      // shoot past, deck you fly over, and the lit apertures that are the only
      // thing saying anything lives here. All three were written long ago and
      // had never been imported by anything.
      this.worksMats = {
        plate: steelMaterial(0x9aa3ad),
        deck: concreteMaterial({ color: 0xada89e, scale: 0.045 }),
        lit: cityMaterial({ tint: 0xb2b8c0, glass: 0x1a2430, litColor: 0xffd6a0, lit: 0.28 }),
      };
      this.works.mats = this.worksMats;
      this.terrainMat = this.worksMats.plate;
      return;
    }
    if (WORLD.backend === 'field') {
      // The one consumer `rockPropMaterial` was written for. It is triplanar in
      // world space, which is why the belt bakes each body's transform into its
      // chunk rather than instancing.
      // `bedded: false` — these were never on a planet, so no Y-banded strata
      // and no waterline. `env` is up because a body in vacuum is lit by the sun
      // and the nebula and has no sky fill to lift its shadow side.
      this.terrainMat = rockPropMaterial({ scale: 0.055, bedded: false, env: 1.25 });
      this.belt.material = this.terrainMat;
      return;
    }
    this.terrainMat = terrainMaterial();
    if (WORLD.surface === 'ice') {
      this.waterMat = iceMaterial(this.reflection);
      this.deepMat = iceMaterial(this.reflection);
    } else if (WORLD.surface !== 'none') {
      this.waterMat = waterMaterial(this.reflection);
      this.deepMat = deepWaterMaterial(this.reflection);
    }
    this.terrain.material = this.terrainMat;
    if (this.water) {
      this.water.material = this.waterMat;
      this.water.deepMaterial = this.deepMat;
    }
  }

  /**
   * Compile the new programs before the first frame that would draw them.
   * Skipped at boot, where main.js compiles the whole scene anyway.
   */
  _warm() {
    if (!this._renderer || !this._camera) return;
    // `renderer.compile` walks `traverseVisible`, and the hop hides this root
    // before the build is queued — so warming a hidden world compiles nothing
    // and the whole cost lands on the first frame that draws it instead.
    // Compiling does not draw, so unhiding across the call costs nothing.
    const vis = this.root.visible;
    this.root.visible = true;
    this._renderer.compile(this.scene, this._camera);
    // Tried and rejected 2026-08-15: also rendering the scene into a 1x1 target
    // here, to pre-upload vertex buffers and the shadow map. It cost ~800 ms in
    // the `space` phase and moved re-entry's worst frame 203 -> 198 ms, i.e.
    // nothing. Whatever re-entry still pays for is not geometry upload.
    this.root.visible = vis;
  }

  /**
   * Spend up to `budgetMs` of wall time on the queued build.
   * Always runs at least one job, so progress cannot stall on a budget of 0.
   * @returns {number} 0..1, 1 when the world is finished.
   */
  step(budgetMs = 8) {
    const t0 = performance.now();
    do {
      if (this._done >= this._jobs.length) return 1;
      this._jobs[this._done++]();
    } while (performance.now() - t0 < budgetMs);
    return this.buildProgress;
  }

  get buildProgress() {
    return this._jobs.length ? Math.min(1, this._done / this._jobs.length) : 1;
  }

  /* ── per-frame ──────────────────────────────────────────────────────────── */

  /** Mirror the scene into the reflector. Runs before anything else is drawn. */
  _reflect(renderer, camera) {
    const r = this.reflection;
    if (!r || !r.enabled || !this.water) return;
    const hide = this._reflHide;
    hide.length = 0;
    // The surface cannot reflect itself, and the probe must not re-enter this.
    hide.push(this.water.group, this._probe);
    // Sky dome, starfield and nebula stay out: the buffer clears to alpha 0 so
    // the shader can keep the sky IBL where the reflection ray misses geometry,
    // and drawing them would write alpha 1 everywhere. Re-collected per frame
    // because changing preset rebuilds the nebula.
    const env = this.scene.getObjectByName('environment');
    if (env) for (const o of env.children) if (o.isMesh && o.renderOrder <= -999) hide.push(o);
    r.hide = hide;
    r.render(renderer, camera);
  }

  _applyLOD() {
    if (this.terrain) this.terrain.updateLOD(this._camPos);
    if (this.belt) this.belt.updateLOD(this._camPos);
    if (this.works) this.works.updateLOD(this._camPos);
    if (this.water) this.water.updateLOD(this._camPos);
  }

  update(dt) {
    this._time += dt;
    // The apron runs the same surface shader, so it needs the same clock.
    for (const m of [this.waterMat, this.deepMat]) {
      const sh = m && m.userData.shader;
      if (sh && sh.uniforms.uTime) sh.uniforms.uTime.value = this._time;
    }
  }

  /* ── queries ────────────────────────────────────────────────────────────── */
  //
  // Pure functions of the active DNA. They are correct the moment `rebuild`
  // returns and stay correct while the world is being meshed, which is the
  // whole point of keeping the height field out of the geometry.

  /** Ground clearance at a world point — used by the flight model and by AI. */
  groundAt(x, z) {
    // A field world has no ground, but every clamp in ai.js is one-sided
    // (`if (y < g) y = g`) and `dieStep` ends a kill on `pos.y <= g`, so at
    // -Infinity a dying craft never lands and falls until its timer expires.
    // A shelf under the rail restores both: far enough down that the player's
    // -46 offset never reaches it, so nothing is drawn there and nothing is felt.
    if (WORLD.backend === 'field') return centrelineY(z) - FIELD_FLOOR;
    // A built world has a real floor — the deck — so the ground cushion, the
    // AI's altitude clamps and ground batteries all behave exactly as they do
    // in a canyon. Flat, so it is the whole height field.
    if (WORLD.backend === 'works') return Works.deckY();
    return WORLD.surface === 'none'
      ? terrainHeight(x, z)
      : Math.max(terrainHeight(x, z), WORLD.waterLevel);
  }

  /**
   * Underside of anything overhead at a world point, or Infinity where the sky
   * is open. The mirror of `groundAt`, and Infinity everywhere except a `works`
   * corridor: `terrain` is single-valued so it can never put geometry above the
   * rail, and `field` always leaves sky between its bodies.
   */
  ceilingAt(x, z) {
    return this.works ? this.works.ceilingAt(z) : Infinity;
  }

  /** Terrain height ignoring the surface — placement helper for the built world. */
  landAt(x, z) { return terrainHeight(x, z); }

  landAtU(u, z) { return heightAtU(u, z, profileAt(z, {})); }
}
