import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { buildMaterials } from './render/materials.js';
import { primeTextureCache, flushTextureCache, clearTextureCache } from './render/texcache.js';
import { Environment } from './render/environment.js';
import { Corneria, DNA_BY_ID } from './world/corneria.js';
import { createArwing } from './ships/arwing.js';
import { Flight, TUNE as FLIGHT_TUNE } from './game/flight.js';
import { SHOTS, applyShot } from './game/shots.js';
import { installFx } from './fx/index.js';
import { installCombat } from './game/combat.js';
import { installUI } from './ui/index.js';
import { installAudio } from './core/audio.js';
import { installMode } from './game/mode.js';
import { installCampaign, LEVELS } from './game/campaign.js';
import { installDevPanel } from './dev/panel.js';
import { createLoader } from './ui/loading.js';

// ─────────────────────────────────────────────────────────────────────────────
// Boot + main loop.
//
// This is the ONE integration point. Subsystems are installed here through
// fixed seams (installFx / installCombat / installUI / installAudio) and never
// reach into each other, so each one can be worked on in isolation without
// touching this file.
//
// Boot is staged: each `await loader.stage()` names the work that follows and
// yields a frame, which is the only way the browser composites anything during
// an otherwise synchronous ~5 s init. Stage weights are rough shares of that
// wall time, so the bar advances at roughly a constant rate.
// ─────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const qualityParam = params.get('quality') || 'high';
const shotParam = params.get('shot');
const seekParam = parseFloat(params.get('t') || '0');
// `?level=` boots straight into a campaign level: its world AND its wave tables,
// which is why it is not a `?dna=`. Reviewing a level through the previous
// level's encounters measures nothing. Falls back to the first level.
const levelIndex = Math.max(0, LEVELS.findIndex(l => l.id === params.get('level')));
const startLevel = LEVELS[levelIndex];
const presetParam = params.get('env') || startLevel.env;

const railYawParam = parseFloat(params.get('railyaw'));
if (!Number.isNaN(railYawParam)) FLIGHT_TUNE.railYawFollow = railYawParam;

const loader = createLoader();
await loader.stage('SPINNING UP RENDERER', 0.01);

// Before the first `cached()` call, because that is synchronous and everything
// downstream of it — the world builder's job closures especially — has no way to
// await anything. `?texcache=0` bakes from scratch; `tools/digest.mjs` always
// passes it, since proving the generators unchanged means running them.
await primeTextureCache({ enabled: params.get('texcache') !== '0' });

const engine = new Engine({ quality: qualityParam });
await loader.stage('BAKING SURFACE MATERIALS', 0.18);

buildMaterials(engine);
await loader.stage('BAKING SKY AND LIGHT PROBE', 0.38);

const env = new Environment(engine, presetParam);
await loader.stage('LINKING POST CHAIN', 0.41);

engine.buildPost();
env.apply(presetParam);            // re-apply now that post exists
await loader.stage(`GENERATING ${startLevel.name}`, 0.47);

const world = new Corneria(engine.scene, DNA_BY_ID[startLevel.dna]);
await loader.stage('ASSEMBLING ARWING', 0.60);

const ship = createArwing({ scale: 1.0 });
engine.scene.add(ship);

const flight = new Flight(ship, world);

Input.init();
await loader.stage('ARMING FLIGHT SYSTEMS', 0.69);

/** Context handed to every subsystem. Add fields, never remove them. */
const ctx = {
  THREE, engine,
  scene: engine.scene,
  camera: engine.camera,
  env, world, ship, flight,
  input: Input,
  get time() { return simTime; },
  get dt() { return engine.dt; },
};

ctx.fx = installFx(ctx);
ctx.combat = installCombat(ctx);
ctx.ui = installUI(ctx);
ctx.audio = installAudio(ctx);
// After combat, which owns `ctx.state` — the campaign publishes onto it. This is
// a new seam in a shared file: the campaign is the only thing that may end a
// mission, and it needs a per-frame tick nothing else can give it.
ctx.campaign = installCampaign(ctx, levelIndex);

// Hulls the motion blur must not touch. The pass reprojects depth as if every
// pixel were static world geometry, which is maximally wrong for anything that
// moves *with* the player — the Arwing, the station-keeping boss, and any
// formation pacing it. `combat.group` already owns enemies, wingmen and the
// boss, so the whole dynamic set is these two roots. Trails and fx are
// deliberately absent: those genuinely should smear.
if (engine.post) engine.post.motion.dynamic = [ship, ctx.combat.group];

// The review harness drives the game by seeking to a fixed sim time or by
// naming a shot; neither wants to be greeted by a title card, so those boots
// go straight to PLAYING. A plain visit gets the title.
const mode = installMode(ctx, {
  startPaused: !shotParam && !(seekParam > 0) && params.get('nomenu') !== '1',
});
ctx.mode = mode;

engine.onResize = (w, h) => { ctx.ui.resize(w, h); };

/* ── deterministic stepping ─────────────────────────────────────────────── */
const FIXED = 1 / 120;
let acc = 0;
let simTime = 0;

function step(dt) {
  flight.update(dt, Input.state);
  world.update(dt);
  ctx.combat.update(dt);
  // FX deliberately does NOT run here. It emits from ctx.ship.position, which
  // inside the sim holds the fixed-step state while the ship is *drawn*
  // interpolated — trails would attach up to a full step ahead of the visible
  // ship, wobbling with alpha. It runs in updateScene() instead, after the
  // render transform is applied, so emitters sit exactly on the drawn ship.
  simTime += dt;
}

function updateScene(dt, moveCamera = true, alpha = 1) {
  // Render interpolation: the sim is fixed-step, frames are not. Drawing the
  // raw sim state makes the ship stutter whenever steps-per-frame oscillates.
  flight.applyRenderState(alpha);
  ship.updateMatrixWorld(true);
  // Visual FX belong in the render phase: they emit from the ship's *drawn*
  // transform, so this must come after applyRenderState.
  ctx.fx.update(dt);
  if (moveCamera) flight.updateCamera(dt, engine.camera, alpha);
  env.update(dt, flight.pos, engine.camera);
  autoFocus();
  if (engine.post) engine.post.motion.strength = 0.32 + flight.boostActive * 0.85;
  ctx.audio.setEngine(flight.throttleN, flight.boostActive);
  ctx.audio.update(dt);
  ctx.ui.update(dt);
  ctx.ui.draw();
}

/** A camera operator keeps the subject sharp — so focus tracks the ship. */
function autoFocus() {
  if (!engine.post) return;
  const d = engine.camera.position.distanceTo(ship.position);
  const p = engine.post.dof.params;
  p.focus = d;
  // A flight game needs the world legible: the far field gets a hint of
  // softness for depth cueing, never enough to turn the level into mush.
  p.focalRange = Math.max(45, d * 2.2);
  p.maxCoC = d < 25 ? 4.5 : 2.2;
  p.nearScale = d < 25 ? 0.5 : 0.12;
}

/** Fast-forward the simulation to an absolute time without rendering. */
function seekTo(t) {
  const target = Math.max(0, t);
  let guard = 0;
  while (simTime < target - FIXED * 0.5 && guard++ < 200000) step(FIXED);
  updateScene(FIXED);
  if (engine.post) engine.post.motion.reset();
}

/* ── main loop ──────────────────────────────────────────────────────────── */
let running = true;
let shotMode = null;

function frame() {
  requestAnimationFrame(frame);
  const dt = engine.tick();

  // Input is sampled once per frame, OUTSIDE the fixed step. It used to live
  // inside step(), which meant a paused game stopped reading the keyboard and
  // could never be un-paused. Sampling here also matches what input actually
  // is — a per-frame poll of devices, not a quantity the sim integrates.
  if (!shotMode) {
    Input.update(dt, simTime);
    if (Input.state.anyPressed) ctx.audio.unlock();
    mode.update(dt);
  }

  if (running && !shotMode && mode.simActive) {
    // BEFORE the sim, not in updateScene. The campaign writes `flight.climb`,
    // which both the sim (ship position) and the camera read. Ticked in the
    // render phase it lands between them: the ship is placed with the previous
    // value while the camera uses the new one, and at the ascent's ~940 m/s that
    // is ~15 m of camera-above-ship against a 17 m chase distance — the hull
    // leaves the bottom of the frame.
    ctx.campaign.update(dt);
    acc += dt;
    let guard = 0;
    while (acc >= FIXED && guard++ < 8) { step(FIXED); acc -= FIXED; }
    updateScene(dt, true, acc / FIXED);
  } else if (shotMode) {
    applyShot(shotMode, ctx);
    updateScene(dt, false);
  } else {
    // Title card or paused: keep presenting frames so the menu animates over a
    // live view of the level, but advance nothing. The scene already holds its
    // last state, so only the 2D overlay needs redrawing — and it gets real
    // frame dt, because sim time is exactly what is frozen here.
    ctx.audio.setEngine(0, 0);   // don't hold a running engine note under a menu
    ctx.ui.update(dt);
    ctx.ui.draw();
  }
  engine.render();
}

/* ── capture / debug API ─────────────────────────────────────────────────── */
const api = {
  ctx, engine, env, world, ship, flight, THREE,
  get fx() { return ctx.fx; },
  get ui() { return ctx.ui; },
  get combat() { return ctx.combat; },
  get state() { return ctx.state; },
  ready: false,
  // -1 until the texture cache has finished writing. `bootprof --warm` waits on
  // this before reloading, or it would measure a half-written cache.
  cacheWrote: -1,
  // The manual escape hatch, for when a boot looks wrong and you want to rule
  // the cache out: `__VULPINE__.clearTexCache()`, then reload. The source stamp
  // should make this unnecessary — if you ever need it, that is a bug worth
  // reporting rather than working around.
  clearTexCache: () => clearTextureCache(),
  get shots() { return Object.keys(SHOTS); },
  pause() { running = false; },
  resume() { running = true; },
  seek: seekTo,
  step(n = 1) { for (let i = 0; i < n; i++) step(FIXED); updateScene(FIXED, !shotMode); },
  setShot(name) {
    shotMode = name || null;
    if (shotMode) running = false;
  },
  setEnv(name) { env.apply(name); },
  hudVisible(v) { ctx.ui.visible = v; ctx.ui.draw(); },
  /** Live post knobs — the review loop drives these to A/B a look in seconds. */
  post(patch = {}) {
    const p = engine.post;
    if (!p) return null;
    if (patch.exposure != null) p.params.exposure = patch.exposure;
    if (patch.trim != null) p.params.trim = patch.trim;
    if (patch.bloom) Object.assign(p.params.bloom, patch.bloom);
    if (patch.grade) for (const [k, v] of Object.entries(patch.grade)) {
      // Caps fallback for acronym uniforms (`uCA`) — see environment.js:apply.
      const g = p.grade.material.uniforms;
      const u = g['u' + k[0].toUpperCase() + k.slice(1)] || g['u' + k.toUpperCase()];
      if (u) { if (u.value?.set && Array.isArray(v)) u.value.set(...v); else u.value = v; }
    }
    if (patch.enable) for (const [k, v] of Object.entries(patch.enable)) p.setEnabled(k, v);
    if (patch.godRays) Object.assign(p.godRays.params, patch.godRays);
    if (patch.dof) Object.assign(p.dof.params, patch.dof);
    return {
      exposure: p.params.exposure, trim: p.params.trim, bloom: { ...p.params.bloom },
      passes: ['godRays', 'dof', 'motion', 'bloom', 'smaa'].reduce((a, k) => (a[k] = p[k].enabled, a), {}),
    };
  },
  probe() { return engine.post ? engine.post.probe() : null; },
  stats() {
    return {
      fps: 1000 / engine.avgFrameMs,
      frameMs: engine.avgFrameMs,
      calls: engine.renderer.info.render.calls,
      tris: engine.renderer.info.render.triangles,
      programs: engine.renderer.info.programs?.length ?? 0,
      textures: engine.renderer.info.memory.textures,
      geometries: engine.renderer.info.memory.geometries,
      speed: flight.speed,
      pos: flight.pos.toArray().map(v => +v.toFixed(1)),
    };
  },
};
window.__VULPINE__ = api;

// Playtest scaffolding. Talks to the game only through `api`, renders as DOM
// rather than on the HUD canvas, and stays hidden until backquote is pressed —
// which is what keeps it out of every screenshot the harness takes off this
// same dev server. `?dev=1` opens it on load.
installDevPanel(api);

// URL overrides, for fast A/B without a rebuild: ?exposure=0.6&nopost=1
const expParam = parseFloat(params.get('exposure'));
if (!Number.isNaN(expParam)) api.post({ exposure: expParam });
if (params.get('nopost')) api.post({ enable: { godRays: false, dof: false, motion: false, bloom: false, smaa: false } });
for (const pass of ['godRays', 'dof', 'motion', 'bloom', 'smaa']) {
  const v = params.get(pass.toLowerCase());
  if (v != null) api.post({ enable: { [pass]: v !== '0' && v !== 'false' } });
}
if (params.get('hud') === '0') api.hudVisible(false);

// Start on a weapon tier, so the pre-boss grants can be A/B'd without flying
// 7 km to reach them. `?wpn=3` is the tier the carrier is balanced against.
// `?grants=0` suppresses the pre-boss grants, which is the baseline arm of any
// measurement of the fight.
const wpnParam = parseInt(params.get('wpn'), 10);
if (Number.isFinite(wpnParam)) for (let i = 0; i < wpnParam; i++) ctx.combat.grantWeapon();
if (params.get('grants') === '0') ctx.combat.grants = false;

/* ── go ──────────────────────────────────────────────────────────────────── */
await loader.stage('COMPILING SHADERS', 0.79);
engine.renderer.compile(engine.scene, engine.camera);
await loader.stage('WARMING UP', 0.94);
if (seekParam > 0) seekTo(seekParam);
else updateScene(FIXED);
if (shotParam) api.setShot(shotParam);

frame();

// The overlay fades over live frames and removes itself; readiness is signalled
// only afterwards so no capture path (?t=, ?shot=) can screenshot through it.
await loader.finish();

// Signal readiness only after several presented frames, so the harness never
// screenshots a half-compiled pipeline.
let readyFrames = 0;
const readyTick = () => {
  if (++readyFrames >= 5) {
    api.ready = true;
    document.body.dataset.ready = '1';
    // After ready, never during boot: writing ~25 MB is a structured clone of
    // the very thing being optimised. A hop that bakes a new world's sets adds
    // to the same queue and the next flush takes them too.
    flushTextureCache().then((n) => { api.cacheWrote = n; });
    return;
  }
  requestAnimationFrame(readyTick);
};
requestAnimationFrame(readyTick);
