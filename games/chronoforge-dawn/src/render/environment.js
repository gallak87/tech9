import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DAWN_HOUR } from '../core/const.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment — sky, sun, image-based light, fog. The whole lighting model of
// the game lives here, and it is driven by ONE input: the hour of the day.
//
//   env.setTime(6.4)   // dawn — the signature hour
//
// Everything else follows: sun elevation and azimuth, key colour and intensity,
// the IBL probe baked off the live sky, fog colour and density, and the shadow
// frustum. Nothing anywhere else in the codebase creates a light.
//
// The sky is a physical scattering shader (Preetham/Hosek), not a gradient
// texture, because the horizon colour at 6.4 h is the single most load-bearing
// colour in this game and a hand-authored ramp would be wrong at every other
// hour. The IBL is baked FROM that sky, so ambient light and the sky the player
// sees can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

// Sunrise/sunset bracket the arc; MAX_ELEV is the noon peak. These are tuned so
// that DAWN_HOUR (6.4) puts the sun at ~11.6° — shadows 4.9x the height of what
// casts them, which is the whole point of the hour, and high enough that flat
// ground still receives real light. At the geometric 6° a literal sunrise would
// give, the cos law alone puts the ground at a linear 0.04 and the frame reads
// as night; the fix is a slightly later "dawn", not a brighter exposure, because
// exposure lifts the sky with it. Measured, not guessed: tools/probe.mjs.
const SUNRISE = 5.55;
const SUNSET = 19.8;
const MAX_ELEV_DEG = 62;
const AZ_RISE_DEG = 96;    // compass: 0 = +Z (north), 90 = +X (east)
const AZ_SET_DEG = 264;

const SKY_RADIUS = 4000;   // must sit inside camera.far — see const.js
export const CAMERA_NEAR = 0.8;
export const CAMERA_FAR = 6000;

/** Sun elevation (deg above horizon) and azimuth (deg) for an hour of day. */
export function sunAngles(hour) {
  const h = ((hour % 24) + 24) % 24;
  const t = (h - SUNRISE) / (SUNSET - SUNRISE);
  if (t <= 0 || t >= 1) {
    // Night: the moon runs the same arc, offset half a day. Keeping it on a
    // real arc rather than a fixed overhead light is what makes night shots
    // have a direction — and every shadow in this game needs a direction.
    const nt = t <= 0 ? (h + 24 - SUNSET) / (24 - SUNSET + SUNRISE)
      : (h - SUNSET) / (24 - SUNSET + SUNRISE);
    return {
      elevation: -MAX_ELEV_DEG * 0.55 * Math.sin(Math.PI * nt),
      azimuth: AZ_SET_DEG + (AZ_RISE_DEG + 360 - AZ_SET_DEG) * nt,
      night: true,
      moonElevation: MAX_ELEV_DEG * 0.5 * Math.sin(Math.PI * nt),
    };
  }
  return {
    elevation: MAX_ELEV_DEG * Math.sin(Math.PI * t),
    azimuth: AZ_RISE_DEG + (AZ_SET_DEG - AZ_RISE_DEG) * t,
    night: false,
    moonElevation: -10,
  };
}

/** Unit vector from the world toward the light, for an elevation/azimuth. */
function dirFromAngles(elevDeg, azDeg, out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(elevDeg);
  const a = THREE.MathUtils.degToRad(azDeg);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

// Moonlight runs its own ramp keyed on the MOON's elevation. It cannot share the
// sun ramp: the moon at 16° would index the sun's 16° entry and come out amber,
// which paints a midnight desert orange. Cold, weak, and still directional.
// Night is dark, not black: a player still has to read terrain, and a critic
// still has to score the frame. Tuned to a linear median near 0.03 with
// blackPct under 12 — dark enough to be night, lit enough to be a picture.
const MOON_RAMP = [
  [0,  0x5c74a8, 2.10],
  [12, 0x7a92c8, 3.90],
  [31, 0x93a9d8, 4.80],
];

const KEY_RAMP = [
  // elevation°, colour,     intensity
  [-90, 0x6f86c8, 0.35],   // moonlight — cold, weak, still directional
  [-4,  0x8f7fb8, 0.55],
  [0,   0xff4a12, 3.60],   // the sun on the horizon: deep amber
  [6,   0xff6f28, 6.40],
  [12,  0xff9042, 7.40],   // DAWN sits here — warm key, long shadows
  [22,  0xffb877, 7.20],
  [38,  0xffdcb4, 6.60],
  [62,  0xfff2e2, 6.10],   // noon — near white, shadows short, key relatively weaker
];

// Exposure is a RAMP over sun elevation, in the same idiom as KEY_RAMP above —
// not auto-exposure, and not one fixed number. The ground's response to the key
// is cos-law: sin(11.6 deg) = 0.20 at dawn against sin(61.3 deg) = 0.88 at noon,
// and the sky probe brightens on top of that. Measured on the `wide` shot the
// linear median ran 0.21 at 6.4 h and 1.80 at noon — 8.5x, which is the product
// of those two terms. It is NOT a key-intensity bug: KEY_RAMP is deliberately
// almost flat (7.4 -> 6.1) because the sun's own output does not change.
//
// Auto-exposure was rejected on purpose. A metered frame drifts as the player
// turns, so the hour a reviewer signs off is not the hour they get back. A
// table of art-directed stops is deterministic: same seed, same hour, same
// frame, every run.
//
// The [8] and [12] entries are load-bearing — together they put DAWN (11.55 deg)
// at 1.0503, the one exposure that has been signed off. Change either and
// re-run `node tools/probe.mjs --shots wide --hour 6.4`; the wide frame must
// still read median 0.212. Below the horizon the ramp flattens back to that same
// 1.05, so nothing about the moonlit look moves.
//
// Every number here was set against tools/probe.mjs, band: exposed median
// 0.09-0.25, p90 < 1.2, whitePct < 2, blackPct < 14.
const EXPOSURE_RAMP = [
  // elevation deg, exposure
  [-90, 1.05],    // deep night — the value MOON_RAMP was tuned against
  [-6,  1.05],
  [0,   2.10],    // sun on the horizon: the key is nearly gone, so lift
  [4,   1.48],
  [8,   1.25],
  [12,  1.025],   // with [8]: 11.55 deg -> 1.050, the signed-off dawn
  [16,  0.50],
  [22,  0.36],
  [30,  0.27],
  [42,  0.185],
  [52,  0.140],
  [62,  0.115],   // noon
];

function rampLookup(ramp, x) {
  let lo = ramp[0], hi = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (x >= ramp[i][0] && x <= ramp[i + 1][0]) { lo = ramp[i]; hi = ramp[i + 1]; break; }
  }
  const k = hi[0] === lo[0] ? 0 : (x - lo[0]) / (hi[0] - lo[0]);
  return { color: new THREE.Color(lo[1]).lerp(new THREE.Color(hi[1]), k), value: lo[2] + (hi[2] - lo[2]) * k };
}

/** rampLookup's scalar sibling, for tables of [x, value] rows with no colour. */
function rampValue(ramp, x) {
  const v = THREE.MathUtils.clamp(x, ramp[0][0], ramp[ramp.length - 1][0]);
  let lo = ramp[0], hi = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (v >= ramp[i][0] && v <= ramp[i + 1][0]) { lo = ramp[i]; hi = ramp[i + 1]; break; }
  }
  const k = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  return lo[1] + (hi[1] - lo[1]) * k;
}

/**
 * Post exposure for a sun elevation in degrees. Fixed per hour, never metered.
 * Exported so a probe can ask what the exposure at an hour will be without
 * booting a frame — see EXPOSURE_RAMP for why it is a table.
 */
export function exposureForElevation(elevationDeg) {
  return rampValue(EXPOSURE_RAMP, elevationDeg);
}

export class Environment {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.hour = DAWN_HOUR;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.skyColor = new THREE.Color(0x2a3550);
    this.horizonColor = new THREE.Color(0xffa060);

    /* sky — one instance in the world, one in an offscreen scene the IBL bakes
       from. Two meshes rather than one reparented mesh: reparenting mid-frame
       is a class of bug that only shows up in capture runs. */
    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_RADIUS);
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);

    this.iblSky = new Sky();
    this.iblSky.scale.setScalar(SKY_RADIUS);
    this.iblScene = new THREE.Scene();
    this.iblScene.add(this.iblSky);

    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.pmrem.compileEquirectangularShader();
    this._envRT = null;

    /* key light. The ONLY shadow caster in the game — a second shadowed light
       doubles the shadow pass for a fill that IBL already provides better. */
    this.key = new THREE.DirectionalLight(0xffffff, 3);
    this.key.castShadow = engine.q.shadows;
    this.key.shadow.mapSize.set(engine.q.shadowMap, engine.q.shadowMap);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 420;
    // At a 15° sun the light rays graze the terrain, which is exactly where
    // shadow acne lives. normalBias does the work (it offsets along the surface
    // normal, so it scales with the grazing angle); depth bias stays small or it
    // peter-pans every contact shadow, and contact is the whole point.
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.035;
    this.key.shadow.radius = 3;
    this.shadowRadius = 52;          // metres of world the shadow map covers
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    /* A weak bounce from the ground, tinted by the biome underfoot. IBL gives
       sky ambient; this gives the up-light that stops undersides going to
       black, which is the difference between "grounded" and "pasted on". */
    this.bounce = new THREE.HemisphereLight(0xffffff, 0x2a1f18, 0.35);
    this.scene.add(this.bounce);

    this.scene.fog = new THREE.FogExp2(0x9fb0c8, 0.0035);

    this.setTime(this.hour);
  }

  /** Hours 0–24. Everything about the look follows from this one number. */
  setTime(hour, { bakeIBL = true } = {}) {
    this.hour = ((hour % 24) + 24) % 24;
    const a = sunAngles(this.hour);
    this.angles = a;

    // Below the horizon the *sun* is gone but the moon runs its own arc; the
    // key light follows whichever body is up so shadows never simply vanish.
    const lightElev = a.night ? a.moonElevation : a.elevation;
    dirFromAngles(Math.max(lightElev, -3), a.azimuth, this.sunDir);

    // Sky shader wants the true sun, including below the horizon — that is how
    // it produces the deep blue of civil twilight rather than flat black.
    const skySun = dirFromAngles(a.elevation, a.azimuth);
    // How "low-sun" the hour is, 0 at 24° and up, 1 on the horizon. Every warm
    // term below is driven by it so the sky, the fog and the bounce cannot
    // disagree about what hour it is.
    const low = THREE.MathUtils.clamp(1 - Math.max(0, a.elevation) / 24, 0, 1);
    for (const s of [this.sky, this.iblSky]) {
      const u = s.material.uniforms;
      // Turbidity RISES as the sun drops. The first pass had this backwards and
      // produced a clear midday sky at 6 a.m. — pale cyan, blown at the horizon,
      // no amber anywhere. Haze near the horizon is most of what makes dawn look
      // like dawn: it is what turns the Mie lobe around the sun orange.
      u.turbidity.value = a.night ? 2.0 : 2.4 + low * 9.0;
      u.rayleigh.value = a.night ? 0.5 : 0.55 + (1 - low) * 1.9;
      // Mie is the glow AROUND the sun, and it grows as a solid angle: at 0.010
      // the halo alone was 70% of an into-the-sun frame and flat white, which is
      // not a highlight, it is a hole. 0.0035+ keeps the amber bloom near the
      // disc and gives the rest of the sky back.
      u.mieCoefficient.value = a.night ? 0.003 : 0.0035 + low * 0.0028;
      u.mieDirectionalG.value = 0.80;
      u.sunPosition.value.copy(skySun);
    }

    const key = a.night
      ? rampLookup(MOON_RAMP, Math.max(0, a.moonElevation))
      : rampLookup(KEY_RAMP, lightElev);
    this.key.color.copy(key.color);
    this.key.intensity = key.value;
    this.key.visible = this.key.intensity > 0.01;

    // Fog and hemisphere take the horizon colour so the far field, the sky and
    // the up-bounce always belong to the same hour.
    const warm = low;
    this.horizonColor.copy(key.color).lerp(new THREE.Color(0x9db9dd), 1 - warm * 0.92);
    if (a.night) this.horizonColor.set(0x28324e);
    this.scene.fog.color.copy(this.horizonColor).multiplyScalar(a.night ? 0.35 : 0.62);
    this.scene.fog.density = (a.night ? 0.0034 : 0.0011 + warm * 0.0017);

    this.bounce.color.copy(this.horizonColor);
    this.bounce.groundColor.set(a.night ? 0x121520 : 0x33241a);
    this.bounce.intensity = a.night ? 0.30 : 0.14 + warm * 0.10;

    // The scattering sky is BRIGHT in absolute terms — near the sun it runs past
    // 10 — so the probe it bakes carries real energy. At 1.0 it drowns the key
    // light, every surface converges on sky colour and the frame goes milky.
    // 0.42 is where ambient still fills the shadows and the sun still reads as
    // the light source. Measured on the `wide` shot: blown-white 5.2% -> 0.4%.
    this.scene.environmentIntensity = a.night ? 1.35 : 0.42;

    // Exposure follows the sun as well. One fixed number cannot serve a ground
    // that receives 8.5x more light at noon than at dawn — see EXPOSURE_RAMP.
    // It is set from here, not from postfx, so exactly one place in the codebase
    // knows what hour it is. `engine.post` is null until engine.buildPost(), and
    // the constructor's first setTime lands before that: postfx ships the dawn
    // value as its seed, so the pre-post frame is never wrong.
    // A manual __DAWN__.post({ exposure }) overrides this until the next time
    // change, which is exactly what a lighting probe wants.
    if (this.engine.post) this.engine.post.params.exposure = exposureForElevation(a.elevation);

    if (bakeIBL) this.bakeIBL();
    return this;
  }

  /**
   * Re-bake the light probe off the live sky. ~10 ms, so it is called on a time
   * change, never per frame. A lane animating time of day should call
   * `setTime(h, { bakeIBL: false })` each frame and `bakeIBL()` a few times a
   * second — the ambient term moves far more slowly than the eye can tell.
   */
  bakeIBL() {
    const rt = this.pmrem.fromScene(this.iblScene, 0.02, 1, SKY_RADIUS * 1.2);
    this._envRT?.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.background = rt.texture;
    this.scene.backgroundIntensity = 1.0;
    // The sky MESH still draws — the PMREM background is a blurred probe and
    // loses the sun disc and the horizon's hard gradient. The mesh is the sky
    // the player sees; the probe is the light it casts.
    this.sky.visible = true;
    this.scene.background = null;
    return rt;
  }

  /**
   * Keep the shadow frustum tight around whatever the camera is looking at.
   * A world-sized shadow camera is how you get 4 cm of texel resolution and
   * mush under every actor; this follows the focus and stays at ~2.5 cm/texel.
   */
  update(dt, focus) {
    if (!focus) return;
    const r = this.shadowRadius;
    const cam = this.key.shadow.camera;
    if (cam.right !== r) {
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.updateProjectionMatrix();
    }
    // Snap the light to shadow-texel increments. Without this the map crawls
    // as the party walks and every shadow edge shimmers — the single most
    // visible artefact in a following-camera game.
    const texel = (r * 2) / this.engine.q.shadowMap;
    const sx = Math.round(focus.x / texel) * texel;
    const sz = Math.round(focus.z / texel) * texel;
    this.key.target.position.set(sx, focus.y, sz);
    this.key.position.copy(this.key.target.position).addScaledVector(this.sunDir, 160);
    this.key.target.updateMatrixWorld();
  }

  /** Sun/moon elevation in degrees — probes assert against this. */
  get elevation() { return this.angles?.elevation ?? 0; }
  get isNight() { return !!this.angles?.night; }

  dispose() {
    this._envRT?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose(); this.sky.material.dispose();
    this.iblSky.geometry.dispose(); this.iblSky.material.dispose();
  }
}
