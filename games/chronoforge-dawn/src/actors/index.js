import * as THREE from 'three';
import { bus } from '../core/events.js';
import { disposeTree } from '../core/engine.js';
import { HERO_M } from '../core/const.js';
import { snapUnitPx, SPRITE_PX_PER_METRE, HERO_SPRITE_ROWS, TONE_BANDS } from '../../docs/specs/rig.mjs';
import { buildActor, paletteFor } from './rig.js';
import { makeActorMaterial, makeActorUniforms } from './material.js';
import { Animator, POSE_NAMES } from './poses.js';
import { makeGate } from './gate.js';
import { groundActor, footError } from './ground.js';

// ─────────────────────────────────────────────────────────────────────────────
// actors — code-built rigs, the socket/pose library, and the pixel-snap +
// palette-quantise pass that makes a rig read as a sprite.
//
// One shared material and one shared uniform block for the whole cast: the body
// of every actor is a single SkinnedMesh, so a party of three plus three
// enemies is 6 body draws, 6 weapon draws and 6 beacon draws, not two hundred.
//
// Everything numeric comes from docs/specs/rig.mjs and docs/specs/palette.mjs.
// ─────────────────────────────────────────────────────────────────────────────

// Staged 5.2 m toward the camera from the world focus. That is not an
// arbitrary offset: the Phase 0 material-study props (metal sphere, painted
// capsule) sit within 3.6 m of the focus and a rig placed on top of them is
// occluded in the one shot the critic scores. In front of them the actors
// occlude the props instead, which is the correct depth order anyway.
const STAGE_Z = 5.2;

/** Hard ceiling on the pixel-snap grid, in framebuffer pixels. See updateSnap(). */
const SNAP_MAX_PX = 2.4;
const SHOWCASE = [
  { id: 'kaida', faction: 'ally', dx: -3.0 },
  { id: 'vex', faction: 'ally', dx: -1.0 },
  { id: 'rune', faction: 'ally', dx: 1.0 },
  { id: 'grunt', faction: 'hostile', dx: 3.2 },
];

export function installActors(ctx) {
  const { engine, scene } = ctx;
  const params = new URLSearchParams(location.search);

  const root = new THREE.Group();
  root.name = 'actors';
  scene.add(root);

  const uniforms = makeActorUniforms();
  const material = makeActorMaterial(uniforms, { name: 'actor-shared' });
  const actors = [];
  let groundOn = true;
  let forgePending = 0;
  let snapOn = true;
  let snapBoost = 1.0;
  let viewScale = 1.0;
  let lastSnapPx = 0;
  let lastHeroPx = 0;
  let gate = null;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  /** Ground the rig on the terrain and apply the clip's root motion. */
  function place(a) {
    const w = ctx.world;
    const yaw = a.base.yaw + (a.poseOffset?.yaw || 0);
    const off = a.poseOffset || { y: 0, z: 0 };
    const fz = Math.cos(yaw) * off.z, fx = Math.sin(yaw) * off.z;
    const x = a.base.x + fx * a.scale * viewScale;
    const z = a.base.z + fz * a.scale * viewScale;
    const g = w?.heightAt ? w.heightAt(x, z) : 0;
    a.root.position.set(x, g + off.y * a.scale * viewScale, z);
    a.root.rotation.y = yaw;
    a.root.scale.setScalar(a.scale * viewScale);
  }

  /**
   * Spawn an actor.
   * @param {object} def  { id, faction, x, z, yaw, pose }
   */
  function spawn(def = {}) {
    const a = buildActor({
      id: def.id || 'kaida',
      faction: def.faction || 'ally',
      uniforms, material,
    });
    a.base = { x: def.x ?? 0, z: def.z ?? 0, yaw: def.yaw ?? 0 };
    a.anim = new Animator(a);
    a.poseOffset = { y: 0, z: 0, yaw: 0 };
    a.anim.play(def.pose || 'idle', { fade: 0 });
    a.anim.apply();
    place(a);
    root.add(a.root);
    actors.push(a);
    /* A forged character swaps its body in ASYNCHRONOUSLY — the glb is a fetch.
       Until it lands the actor is still wearing the code-built rig, so anything
       that photographs or measures a character has to know to wait, or it
       silently captures the placeholder. Counted here; surfaced on __DAWN__. */
    if (a.forgeReady) {
      forgePending++;
      a.forgeReady.finally(() => { forgePending--; });
    }
    bus.emit('actor:spawned', { id: a.id, faction: a.faction, tris: a.tris });
    return a;
  }

  function despawn(a) {
    const i = actors.indexOf(a);
    if (i < 0) return false;
    actors.splice(i, 1);
    /* A forged body owns geometry and textures the lines below do not reach.
       Set by gltf-actor.js, and only once a glb has actually swapped in. */
    a.releaseForge?.();
    a.beaconMat?.dispose();
    a.mesh.geometry.dispose();
    a.weapon?.geometry.dispose();
    a.beacon?.geometry.dispose();
    root.remove(a.root);
    bus.emit('actor:despawned', { id: a.id });
    return true;
  }

  function clear() { while (actors.length) despawn(actors[0]); }

  /** ARCHITECTURE.md's required surface: pose(actor, name, t). */
  function pose(actor, name, t = null) {
    if (!actor?.anim) return null;
    if (t == null) {
      actor.anim.play(name, { fade: 0.18 });
    } else {
      actor.anim.clip = name; actor.anim.t = t; actor.anim.blend = 1; actor.anim.prev = null;
      actor.anim.apply();
      place(actor);
    }
    bus.emit('actor:pose', { id: actor.id, pose: name });
    return name;
  }

  /** ARCHITECTURE.md's required surface: socket(actor, name). */
  function socket(actor, name) { return actor?.sockets?.[name] || null; }

  /* ── the pixel-snap grid, recomputed per frame ───────────────────────────
     snapUnitPx() is imported from docs/specs/rig.mjs. The only thing computed
     here is the actor's on-screen height in FRAMEBUFFER pixels, which is a
     camera fact, not a spec constant — measured by projecting a HERO_M rod at
     the reference actor rather than derived from FOV, so it stays correct
     through a battle push-in and a portrait camera without a second formula. */
  function updateSnap() {
    const cam = engine.camera;
    const ref = actors[0];
    const fbH = engine.size.y * engine.dpr;
    if (!ref) { uniforms.uSnapPx.value = 0; return; }
    _a.copy(ref.root.position);
    _b.copy(_a).setY(_a.y + HERO_M * ref.scale * viewScale);
    _a.project(cam); _b.project(cam);
    const px = Math.abs(_b.y - _a.y) * 0.5 * fbH;
    lastHeroPx = px;
    /* Clamp. snapUnitPx scales with the actor's screen height, which is correct
       at the shipping framing (~1 px) and catastrophic the moment anyone zooms
       in to LOOK at the character: at the ?dev=2 close-up it reached 16.6 px and
       shattered her into loose plates with gaps between them. That artifact was
       read as a modelling failure when it was the snap. A sprite grid coarser
       than SNAP_MAX_PX stops being a sprite grid and starts being damage. */
    const s = Math.min(SNAP_MAX_PX, snapUnitPx(px, HERO_M * ref.scale * viewScale) * snapBoost);
    lastSnapPx = s;
    uniforms.uSnapPx.value = snapOn ? s : 0;
    uniforms.uResolution.value.set(engine.size.x * engine.dpr, fbH);
  }

  /* ── review cameras, registered from this file (never core/shots.js) ───── */
  const focusOf = () => (ctx.world?.focus ? ctx.world.focus.clone() : new THREE.Vector3());

  /* A review camera whose subject is the cast must HAVE a cast. Nothing else
     spawns actors in a capture boot — the harness passes play=0 so shots frame
     the world — and an empty lineup renders as a clean, plausible, WRONG frame
     that nothing complains about. Same failure class as the forge race: the
     placeholder for "no subject" looks fine. */
  function ensureCast() { if (!actors.length) { showcase(); applySolo(); } }

  ctx.registerShot('actors-lineup', (c) => {
    ensureCast();
    const t = actors.length ? actors[0].root.position.clone() : focusOf();
    if (actors.length) {
      t.set(0, 0, 0);
      for (const a of actors) t.add(a.root.position);
      t.multiplyScalar(1 / actors.length);
    }
    t.y += 0.95 * viewScale;
    const cam = c.camera;
    const p = THREE.MathUtils.degToRad(55);            // the locked pitch, kept
    const d = 9.5 * viewScale;
    cam.position.set(t.x, t.y + Math.sin(p) * d, t.z + Math.cos(p) * d);
    cam.fov = 30; cam.near = 0.2; cam.far = 2000;
    cam.updateProjectionMatrix();
    cam.lookAt(t);
  });

  ctx.registerShot('actors-crop', (c) => {
    ensureCast();
    const a = actors[0];
    const t = a ? a.root.position.clone() : focusOf();
    t.y += 1.05 * (a?.scale ?? 1) * viewScale;
    const cam = c.camera;
    cam.position.set(t.x + 1.15, t.y + 0.55, t.z + 2.6);
    cam.fov = 30; cam.near = 0.1; cam.far = 2000;
    cam.updateProjectionMatrix();
    cam.lookAt(t.x, t.y - 0.05, t.z);
  });

  /* The portrait camera from docs/specs/hud.mjs §PORTRAIT: front three-quarter,
     15° yaw off the character's own forward, 6° down. The gameplay 55° pitch on
     a portrait reads as the top of a head, which is why this exists. */
  ctx.registerShot('actors-portrait', (c) => {
    ensureCast();
    const a = actors[0];
    const t = a ? a.root.position.clone() : focusOf();
    const s = (a?.scale ?? 1) * viewScale;
    t.y += 1.44 * s;
    const yaw = (a?.base.yaw ?? 0) + THREE.MathUtils.degToRad(15);
    const pit = THREE.MathUtils.degToRad(6);
    const d = 1.5 * s;
    const cam = c.camera;
    cam.position.set(t.x + Math.sin(yaw) * Math.cos(pit) * d, t.y + Math.sin(pit) * d, t.z + Math.cos(yaw) * Math.cos(pit) * d);
    cam.fov = 24; cam.near = 0.05; cam.far = 500;
    cam.updateProjectionMatrix();
    cam.lookAt(t);
  });

  /* ── showcase ────────────────────────────────────────────────────────────
     Staged AT the world focus so the locked `hero` shot frames it with no
     camera trickery: the critic scores the rig at the framing the player
     actually gets, standing on real terrain, casting a real shadow. */
  function showcase(opts = {}) {
    clear();
    const f = focusOf();
    for (const s of SHOWCASE) {
      spawn({ id: s.id, faction: s.faction, x: f.x + s.dx, z: f.z + STAGE_Z, yaw: 0, pose: opts.pose || 'idle' });
    }
    return true;
  }

  /* ── dev-panel rig viewer ────────────────────────────────────────────────
     Registered from this file through ctx.dev.register — devpanel.js is not
     edited. This is the human-facing half of the Phase 2 gate: the moment a
     character exists it is clickable, and the moment an animation lands it is
     clickable. */
  let solo = 'all';
  function applySolo() {
    for (const a of actors) a.root.visible = (solo === 'all' || a.id === solo);
    if (solo !== 'all') {
      const f = focusOf();
      for (const a of actors) if (a.id === solo) { a.base.x = f.x; a.base.z = f.z + STAGE_Z; }
    } else {
      const f = focusOf();
      for (const a of actors) {
        const s = SHOWCASE.find(x => x.id === a.id);
        if (s) { a.base.x = f.x + s.dx; a.base.z = f.z + STAGE_Z; }
      }
    }
  }

  /* Two tiers. The rig VIEWER stages its own four-actor lineup and force-poses
     every actor in the scene, which actively fights the free-roam play sample —
     so it is not registered at all while ?play=1 is driving. The snap/ramp
     sliders are tuning, not viewing, and hide behind ?tune=1. What is left at
     plain ?dev=1 is two readouts.
     devpanel.js is integrator-only, so "collapse a group" is expressed by not
     registering it rather than by a control this file does not own. */
  const dev = ctx.dev;
  /* Traversal graduated out of ?play=1 — play is ON unless opted out. The
     rig viewer is the control you want when you are NOT driving. */
  const playing = params.get('play') !== '0' || params.get('showcase') === 'traversal';
  const tuning = params.get('tune') === '1';
  if (dev && !playing) {
    dev.register({
      group: 'rig', label: 'Viewer', type: 'toggle',
      get: () => actors.length > 0,
      set: (v) => { if (v) { showcase(); applySolo(); } else clear(); },
    });
    dev.register({
      group: 'rig', label: 'Solo', type: 'select',
      options: () => ['all', ...SHOWCASE.map(s => s.id)],
      get: () => solo,
      set: (v) => { solo = v; applySolo(); },
    });
    dev.register({
      group: 'rig', label: 'Pose', type: 'select',
      options: () => [...POSE_NAMES],
      get: () => actors[0]?.anim.clip ?? 'idle',
      set: (v) => { for (const a of actors) pose(a, v); },
    });
    dev.register({
      group: 'rig', label: 'Replay', type: 'button', text: '>',
      action: () => { const p = actors[0]?.anim.clip ?? 'idle'; for (const a of actors) pose(a, p); },
    });
    dev.register({
      group: 'rig', label: 'Size', type: 'range', min: 1, max: 5, step: 0.5,
      get: () => viewScale, set: (v) => { viewScale = v; }, format: (v) => v.toFixed(1) + 'x',
    });
  }
  if (dev && tuning) {
    dev.register({
      group: 'snap', label: 'Snap', type: 'toggle',
      get: () => snapOn, set: (v) => { snapOn = v; },
    });
    dev.register({
      group: 'snap', label: 'Grid', type: 'range', min: 0.5, max: 8, step: 0.25,
      get: () => snapBoost, set: (v) => { snapBoost = v; },
      format: (v) => (SPRITE_PX_PER_METRE / v).toFixed(0) + 'px/m',
    });
    dev.register({
      group: 'snap', label: 'Bands', type: 'range', min: 0, max: 1, step: 0.05,
      get: () => uniforms.uBandStrength.value, set: (v) => { uniforms.uBandStrength.value = v; },
      format: (v) => v.toFixed(2),
    });
    dev.register({
      group: 'snap', label: 'Pivot', type: 'range', min: 0.06, max: 1.2, step: 0.02,
      get: () => uniforms.uPivot.value, set: (v) => { uniforms.uPivot.value = v; },
      format: (v) => v.toFixed(2),
    });
    dev.register({
      group: 'snap', label: 'Neon', type: 'range', min: 0, max: 8, step: 0.2,
      get: () => uniforms.uEmissive.value, set: (v) => { uniforms.uEmissive.value = v; },
      format: (v) => v.toFixed(1),
    });
  }
  if (dev) {
    dev.register({
      group: 'rig', label: 'Feet', type: 'readout',
      get: () => {
        const a = actors[0];
        if (!a || !ctx.world?.heightAt) return '--';
        const e = footError(a, ctx.world);
        return `L${(e.L ?? 0).toFixed(3)} R${(e.R ?? 0).toFixed(3)}  ${(a.ik?.slopeDeg ?? 0).toFixed(0)}deg`;
      },
    });
    dev.register({
      group: 'rig', label: 'Ground', type: 'toggle',
      get: () => groundOn, set: (v) => { groundOn = v; },
    });
    dev.register({
      group: 'rig', label: 'Rig', type: 'readout',
      get: () => actors.length
        ? `${lastHeroPx.toFixed(0)}px  snap ${lastSnapPx.toFixed(2)}`
        : 'off',
    });
    dev.register({
      group: 'rig', label: 'Cast', type: 'readout',
      get: () => `${actors.length} act  ${actors.reduce((s, a) => s + a.tris, 0)} tri`,
    });
    /* Which body the lead actor is showing, plus the two numbers the forge
       measured off it. A glb has no `aPart`, so the look/Part select above is
       inert on a forged character — read out rather than disabled, since
       devpanel.js is integrator-only. */
    dev.register({
      group: 'rig', label: 'Source', type: 'readout',
      get: () => {
        const a = actors[0];
        if (!a) return '--';
        if (a.source !== 'gltf') return 'code-built';
        return `glb x${a.rigScale.toFixed(3)} sole ${a.soleM.toFixed(3)}  Part n/a`;
      },
    });
  }

  if (params.get('showcase') === 'actors') showcase();

  /* ── tick ─────────────────────────────────────────────────────────────── */
  let clock = 0;
  function update(dt) {
    clock += dt;
    for (const a of actors) {
      a.anim.update(dt);
      place(a);
      // Phase 2.4 — feet plant, body leans, sole rolls onto the hill.
      if (groundOn) groundActor(a, ctx.world, dt);
      // IFF beacon pulse — 0.6 Hz ally, 0.9 Hz hostile, per palette.mjs
      const k = 0.72 + 0.28 * Math.sin(clock * Math.PI * 2 * a.pulseHz);
      a.beaconUniforms.uEmissive.value = 3.4 * k;
    }
    updateSnap();
  }

  return {
    root, actors, spawn, despawn, clear, pose, socket, showcase,
    poses: POSE_NAMES,
    /** How many spawned actors are still waiting on their generated body.
     *  0 means every character on screen is the one it is supposed to be. */
    forgePending: () => forgePending,
    material, uniforms,
    /** The offscreen measurement rig tools/rig.mjs drives. Built lazily so a
     *  normal game session never pays for it. */
    get gate() { return gate || (gate = makeGate(ctx)); },
    setSnap(on, boost) { snapOn = !!on; if (boost != null) snapBoost = boost; },
    setGround(on) { groundOn = !!on; return groundOn; },
    footError: (a = actors[0]) => (a && ctx.world?.heightAt ? footError(a, ctx.world) : null),
    update,
    report() {
      return {
        cast: actors.length,
        ids: actors.map(a => a.id),
        sources: actors.map(a => a.source || 'code'),
        tris: actors.reduce((s, a) => s + a.tris, 0),
        draws: actors.length * 3,
        spritePxPerMetre: SPRITE_PX_PER_METRE,
        heroSpriteRows: HERO_SPRITE_ROWS,
        toneBands: TONE_BANDS,
        heroScreenPx: +lastHeroPx.toFixed(1),
        snapUnitPx: +lastSnapPx.toFixed(3),
        snap: snapOn,
      };
    },
    dispose() { clear(); gate?.dispose(); material.dispose(); disposeTree(root); },
  };
}
