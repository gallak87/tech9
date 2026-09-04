import { limb, slab, spike } from './shape.js';
import { MAT } from './material.js';

// ─────────────────────────────────────────────────────────────────────────────
// KAIDA — the reference character.
//
// Phase 2.3 pass 1: SILHOUETTE. Whole body as lofted masses, judged in one
// look, because proportion is the thing that cannot be fixed later. Detail —
// face, hair tips, jacket seams, the blade's crystal facets — is pass 2.
//
// Every number here was read off her own six sprites in
// games/chronoforge/src/assets/kaida_*.png, not invented. Those sprites are a
// DESIGN INPUT, NOT A SCORING TARGET: the job is to carry her identity into a
// 3D cross-section language, not to match an illustration pixel for pixel.
//
// Her identity, in the order it reads at distance:
//   1. the pink bob — a real volume with weight, not a slab on a cube
//   2. the teal jacket against dark trousers — the value break at the waist
//   3. the magenta blade
//
// Bone offsets come from docs/specs/rig.mjs and are NOT touched here. The
// skeleton was never the problem; hips sit at y 0.96, spine_upper at 1.32,
// neck at 1.40 and the crown lands on HERO_M = 1.72, which is 5.5 heads and
// already in the right family. What was wrong was that every one of those
// volumes was a box.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kaida's palette, read off the sprites.
 *
 * The inherited HERO_PALETTES.kaida was invented rather than sampled and is
 * wrong in ways you can see: clothPrimary #1c2f44 is dark navy where the jacket
 * is plainly teal, skin #e8b48f is a tan where she is pale, and `eyes` was
 * #22e5ff driven through MAT.NEON, which is the glowing white bar that eats her
 * whole head in every capture. Sampled values, from kaida_overworld.png:
 *
 *   jacket  #6dd5de / #5bbec9 / #3c859e      trousers #444556 / #372940
 *   hair    #ec6193 / #d65b8d / #9c3d65      skin     #fff4e2
 *   belt    #563935   buckle #bca07e         boots    #1a1714
 */
export const KAIDA_PALETTE = {
  skin: '#f2ddc8',
  skinShade: '#d9b49b',
  hair: '#d63f74',
  hairLit: '#f2789e',
  hairDark: '#8e2b52',
  eyes: '#3b2f46',                 // MAT.CLOTH, not NEON — she has a face, not a visor
  clothPrimary: '#4fbcc9',         // the teal jacket
  clothPrimaryDark: '#2f6f86',
  clothSecondary: '#4a4560',       // trousers. #383349 sampled true but crushed
                                   // to flat black under the toon ramp's bottom
                                   // band; lifted until the ramp is re-tuned.
  collar: '#241d2b',               // the dark under-layer at the throat
  belt: '#563935',
  trim: '#c8a35a',                 // brass buckle, sword guard
  glove: '#6b5a49',
  boot: '#241f1b',
  metal: '#8e97a2',
  weaponEmissive: '#ff5fc0',       // the blade. Magenta in the sprite, NOT blue.
  shadowTint: '#0f0a14',
};

/* ── proportions, metres in rig space ─────────────────────────────────────────
   Named so a change is a decision rather than a nudge to a magic number. */
const HEAD_R = 0.088;      // half-width at the cheekbone
const SHOULDER_R = 0.163;  // half-width across the deltoids
const WAIST_R = 0.112;     // the number a box cannot have — see the torso loft
const HIP_R = 0.128;
const ARM_R = 0.049;
const LEG_R = 0.072;
const BOOT_R = 0.082;

/**
 * Kaida's shell. Same contract as rig.js's prism-based `shellParts`:
 * {bone, geo, key, mat, tag}, geometry in bone-local space, +Y up the bone.
 *
 * `tag` groups vertices so tools/rig.mjs can fingerprint "head" and "torso"
 * independently of how many pieces each is made from — and so a signed-off part
 * can be hash-locked while its neighbours are still moving.
 */
export function kaidaShellParts() {
  const parts = [];
  /* `ink: false` marks a DECAL — a part that sits on another part's surface
     rather than forming the silhouette. Two things follow, and both are bugs we
     hit: it must not be expanded by the outline hull (it would punch out
     through its own host), and it must sit PROUD of that host rather than
     coincident with it, or the two surfaces z-fight into the flickering hairline
     seams that are visible even from the far camera. Clearances below are
     explicit for that reason — every decal is pushed clear of what it sits on. */
  const add = (bone, geo, key, mat, tag, ink = true) => parts.push({ bone, geo, key, mat, tag, ink });

  /** Decal clearance. Below ~2 mm the depth buffer cannot separate two surfaces
   *  at this scene scale and they shimmer against each other. */
  const CLR = 0.004;

  /** Joint overlap. Every vertex is weighted 100% to ONE bone, so nothing
   *  deforms — when a knee bends, the thigh and the shin simply rotate apart
   *  and leave a wedge-shaped hole you can see straight through. Visible from
   *  the far camera, and the single ugliest thing on her.
   *
   *  Rigid skinning is the right call for this look, so the fix is not smooth
   *  weights: it is to run each segment PAST its joint so the two shells
   *  interpenetrate and the hole has nowhere to open. The overlap has to exceed
   *  the sagitta of the joint's rotation — roughly r·(1−cos θ) for a bend of θ
   *  — and a knee at 70 deg on a 50 mm shin wants ~33 mm. */
  const OVER = 0.045;

  /* ── pelvis ────────────────────────────────────────────────────────────────
     Wider at the hip than at the waist above it. That single relationship is
     most of what separates a figure from a stack of blocks, and it is exactly
     what one box per limb cannot express. */
  add('hips', limb([
    { y: -0.11, rx: HIP_R * 0.86, rz: 0.082, p: 3.0 },
    { y: -0.02, rx: HIP_R, rz: 0.090, p: 3.2 },
    { y: 0.07, rx: HIP_R * 0.94, rz: 0.084, p: 3.2 },
    { y: 0.15, rx: WAIST_R * 1.02, rz: 0.076, p: 3.0 },
  ]), 'clothSecondary', MAT.CLOTH, 'torso');

  // belt — a shallow band at the natural waist, and the value break the sprite
  // uses to separate the teal top from the dark trousers.
  add('hips', limb([
    { y: 0.10, rx: HIP_R * 0.94 + CLR * 2, rz: 0.084 + CLR * 2, p: 3.6 },
    { y: 0.155, rx: WAIST_R * 1.02 + CLR * 2, rz: 0.076 + CLR * 2, p: 3.6 },
  ]), 'belt', MAT.HIDE, 'torso', false);
  add('hips', slab({ y0: 0.112, y1: 0.148, w: 0.052, d: 0.018, z: 0.084 + CLR * 4, p: 4.0 }), 'trim', MAT.METAL, 'torso', false);
  // hip pouch, her left — an asymmetry, because a perfectly symmetric character
  // reads as a mannequin at any polygon count.
  add('hips', slab({ y0: 0.01, y1: 0.10, w: 0.056, d: 0.040, x: HIP_R * 0.92, z: 0.020, p: 3.4 }), 'belt', MAT.HIDE, 'torso', false);

  /* ── torso: the jacket ─────────────────────────────────────────────────────
     Seven stations from waist to collar. The waist is genuinely narrower than
     both the ribs above and the hips below. */
  add('spine_upper', limb([
    { y: -0.30, rx: WAIST_R * 0.99, rz: 0.074, p: 3.0 },
    { y: -0.22, rx: WAIST_R, rz: 0.076, p: 3.0 },
    { y: -0.14, rx: 0.128, rz: 0.086, p: 3.2 },
    { y: -0.06, rx: 0.146, rz: 0.096, p: 3.4 },
    { y: 0.01, rx: 0.156, rz: 0.098, p: 3.5 },
    { y: 0.055, rx: SHOULDER_R, rz: 0.094, p: 3.6 },
    { y: 0.088, rx: 0.132, rz: 0.080, p: 3.2 },
  ]), 'clothPrimary', MAT.CLOTH, 'torso');

  // open collar over a dark under-layer — the sprite's strongest torso read
  add('spine_upper', limb([
    { y: 0.06, rx: 0.062, rz: 0.050, p: 3.0 },
    { y: 0.115, rx: 0.055, rz: 0.046, p: 3.0 },
  ]), 'collar', MAT.CLOTH, 'torso', false);
  add('spine_upper', slab({ y0: -0.02, y1: 0.10, w: 0.052, d: 0.024, z: 0.098 + CLR, x: 0.030, x1: 0.014, p: 3.2 }), 'clothPrimaryDark', MAT.CLOTH, 'torso', false);
  add('spine_upper', slab({ y0: -0.02, y1: 0.10, w: 0.052, d: 0.024, z: 0.098 + CLR, x: -0.030, x1: -0.014, p: 3.2 }), 'clothPrimaryDark', MAT.CLOTH, 'torso', false);
  // neck rides the chest, not the head, so turning the head does not drag it
  add('spine_upper', limb([
    { y: 0.03, rx: 0.044, rz: 0.044, p: 2.8 },
    { y: 0.105, rx: 0.040, rz: 0.040, p: 2.8 },
  ]), 'skin', MAT.SKIN, 'torso', false);

  /* ── head ──────────────────────────────────────────────────────────────────
     A rounded skull that narrows to a jaw, not a cube. p climbs to 3.8 at the
     brow and drops to 2.4 at the crown, so the top is round and the cheek still
     has a plane to catch the key light — which is what makes a toon ramp read
     as form instead of as a flat fill. */
  add('neck', limb([
    { y: 0.030 - OVER, rx: HEAD_R * 0.52, rz: HEAD_R * 0.54, p: 2.6 },  // down into the collar
    { y: 0.030, rx: HEAD_R * 0.60, rz: HEAD_R * 0.62, p: 2.6 },   // under the jaw
    { y: 0.085, rx: HEAD_R * 0.86, rz: HEAD_R * 0.90, p: 3.0 },   // jaw
    { y: 0.150, rx: HEAD_R, rz: HEAD_R * 1.02, p: 3.6 },          // cheekbone
    { y: 0.215, rx: HEAD_R * 1.02, rz: HEAD_R * 1.04, p: 3.8 },   // brow
    { y: 0.272, rx: HEAD_R * 0.92, rz: HEAD_R * 0.94, p: 3.0 },   // crown
    { y: 0.310, rx: HEAD_R * 0.46, rz: HEAD_R * 0.48, p: 2.4 },
  ]), 'skin', MAT.SKIN, 'head');

  // eyes — a narrow dark band, MAT.CLOTH. Deliberately NOT the emissive bar the
  // first rig had: at 43 px a glowing visor is the only thing you see.
  add('neck', slab({ y0: 0.183, y1: 0.199, w: 0.082, d: 0.014, z: HEAD_R * 1.04 + CLR, p: 4.0 }), 'eyes', MAT.CLOTH, 'head', false);

  /* ── hair: the bob ─────────────────────────────────────────────────────────
     Her single most identifying feature and the one the box rig reduced to a
     magenta slab. Four masses:
       cap    — over the crown and down the back of the skull
       sides  — left and right, falling to just under the jaw and curling in
       fringe — across the brow, sitting proud of the face
       flick  — the longer sweep on her left, so the bob is not symmetrical
     Built OVER the skull rather than replacing it, so the face still shows. */
  add('neck', limb([
    { y: 0.150, rx: HEAD_R * 1.14, rz: HEAD_R * 1.16, p: 3.4, z: -0.026 },
    { y: 0.235, rx: HEAD_R * 1.20, rz: HEAD_R * 1.22, p: 3.6, z: -0.020 },
    { y: 0.292, rx: HEAD_R * 1.08, rz: HEAD_R * 1.10, p: 3.0, z: -0.014 },
    { y: 0.330, rx: HEAD_R * 0.50, rz: HEAD_R * 0.54, p: 2.4 },
  ]), 'hair', MAT.CLOTH, 'head');

  for (const sgn of [1, -1]) {
    add('neck', limb([
      { y: 0.055, rx: 0.030, rz: 0.044, p: 2.8, x: sgn * 0.092, z: -0.030 },
      { y: 0.120, rx: 0.038, rz: 0.056, p: 3.0, x: sgn * 0.100, z: -0.026 },
      { y: 0.200, rx: 0.040, rz: 0.060, p: 3.2, x: sgn * 0.102, z: -0.020 },
      { y: 0.262, rx: 0.032, rz: 0.048, p: 3.0, x: sgn * 0.088, z: -0.018 },
    ]), 'hair', MAT.CLOTH, 'head');
  }

  /* Fringe — PROUD of the brow. The first attempt put it at z 0.062 with a
     half-depth of 0.020, so its front face landed at 0.082 while the skull's own
     front is at 0.092: the whole fringe was buried inside the head, z-fighting,
     and what read as a black hole where her face should be was the skull's own
     shadowed interior showing through. Sit hair OUTSIDE the skull, always. */
  add('neck', slab({
    y0: 0.212, y1: 0.290, w: 0.158, d: 0.046, w1: 0.140, d1: 0.034,
    z: 0.080, z1: 0.058, x: 0.006, x1: -0.004, p: 3.4,
  }), 'hairLit', MAT.CLOTH, 'head');

  // the flick, and the two spiky tips that keep the bob from reading as a helmet
  add('neck', spike({ y0: 0.230, y1: 0.098, rx: 0.030, rz: 0.036, x: 0.088, z: -0.030, x1: 0.116, z1: -0.062, p: 2.6, tip: 0.008 }), 'hair', MAT.CLOTH, 'head');
  add('neck', spike({ y0: 0.268, y1: 0.196, rx: 0.026, rz: 0.030, x: -0.052, z: -0.076, x1: -0.070, z1: -0.126, p: 2.6, tip: 0.006 }), 'hairDark', MAT.CLOTH, 'head');
  add('neck', spike({ y0: 0.276, y1: 0.230, rx: 0.024, rz: 0.026, x: 0.028, z: -0.080, x1: 0.040, z1: -0.132, p: 2.6, tip: 0.006 }), 'hair', MAT.CLOTH, 'head');

  /* ── arms ──────────────────────────────────────────────────────────────────
     Sleeves rolled to mid-forearm, per the sprite: the jacket ends in a cuff
     and bare forearm runs to a glove. The cuff is a flare, which is a station
     with a bigger radius — the kind of read that costs one row in a table here
     and is impossible with one box per bone. */
  for (const s of ['L', 'R']) {
    const sgn = s === 'L' ? 1 : -1;
    add(`shoulder_${s}`, limb([
      { y: -0.26 - OVER * 0.6, rx: ARM_R * 0.92, rz: ARM_R * 0.92, p: 3.0 },
      { y: -0.26, rx: ARM_R * 0.96, rz: ARM_R * 0.96, p: 3.0 },
      { y: -0.12, rx: ARM_R * 1.08, rz: ARM_R * 1.08, p: 3.2 },
      { y: 0.010, rx: ARM_R * 1.30, rz: ARM_R * 1.26, p: 3.4, x: sgn * 0.008 },
      { y: 0.048, rx: ARM_R * 1.02, rz: ARM_R * 1.00, p: 3.0, x: sgn * 0.012 },
    ]), 'clothPrimary', MAT.CLOTH, 'arm');

    add(`upperArm_${s}`, limb([
      { y: -0.25 - OVER, rx: ARM_R * 0.84, rz: ARM_R * 0.84, p: 3.0 },
      { y: -0.25, rx: ARM_R * 0.86, rz: ARM_R * 0.86, p: 3.0 },
      { y: -0.13, rx: ARM_R * 0.92, rz: ARM_R * 0.92, p: 3.0 },
      { y: 0.010, rx: ARM_R * 0.99, rz: ARM_R * 0.99, p: 3.0 },
    ]), 'clothPrimary', MAT.CLOTH, 'arm');
    // the rolled cuff, sitting just below the elbow
    add(`upperArm_${s}`, limb([
      { y: -0.255, rx: ARM_R * 0.86 + CLR * 2, rz: ARM_R * 0.86 + CLR * 2, p: 3.4 },
      { y: -0.205, rx: ARM_R * 0.90 + CLR * 2, rz: ARM_R * 0.90 + CLR * 2, p: 3.4 },
    ]), 'clothPrimaryDark', MAT.CLOTH, 'arm', false);

    add(`lowerArm_${s}`, limb([
      { y: -0.235 - OVER * 0.7, rx: ARM_R * 0.66, rz: ARM_R * 0.68, p: 2.9 },
      { y: -0.235, rx: ARM_R * 0.68, rz: ARM_R * 0.70, p: 2.9 },
      { y: -0.12, rx: ARM_R * 0.76, rz: ARM_R * 0.78, p: 2.9 },
      { y: 0.010, rx: ARM_R * 0.84, rz: ARM_R * 0.86, p: 3.0 },
      { y: 0.010 + OVER * 0.8, rx: ARM_R * 0.80, rz: ARM_R * 0.82, p: 3.0 },
    ]), 'skin', MAT.SKIN, 'arm');

    add(`hand_${s}`, limb([
      { y: -0.085, rx: ARM_R * 0.72, rz: ARM_R * 0.60, p: 3.2 },
      { y: -0.030, rx: ARM_R * 0.86, rz: ARM_R * 0.70, p: 3.4 },
      { y: 0.012, rx: ARM_R * 0.80, rz: ARM_R * 0.66, p: 3.2 },
    ]), 'glove', MAT.HIDE, 'arm');
  }

  /* ── legs ──────────────────────────────────────────────────────────────────
     Thigh tapers to the knee, calf swells and tapers to the ankle, and the boot
     flares back out over the lower calf. Three direction changes down one leg;
     the box rig had zero. */
  for (const s of ['L', 'R']) {
    add(`upperLeg_${s}`, limb([
      { y: -0.44 - OVER, rx: LEG_R * 0.70, rz: LEG_R * 0.74, p: 3.0 },
      { y: -0.44, rx: LEG_R * 0.72, rz: LEG_R * 0.76, p: 3.0 },
      { y: -0.28, rx: LEG_R * 0.82, rz: LEG_R * 0.88, p: 3.0 },
      { y: -0.12, rx: LEG_R * 0.94, rz: LEG_R * 1.00, p: 3.1 },
      { y: 0.020, rx: LEG_R * 1.04, rz: LEG_R * 1.10, p: 3.2 },
      { y: 0.020 + OVER, rx: LEG_R * 0.96, rz: LEG_R * 1.02, p: 3.2 },
    ]), 'clothSecondary', MAT.CLOTH, 'leg');

    add(`lowerLeg_${s}`, limb([
      { y: -0.46 - OVER * 0.5, rx: LEG_R * 0.54, rz: LEG_R * 0.58, p: 3.0 },
      { y: -0.46, rx: LEG_R * 0.56, rz: LEG_R * 0.60, p: 3.0 },
      { y: -0.34, rx: LEG_R * 0.66, rz: LEG_R * 0.72, p: 3.0 },
      { y: -0.18, rx: LEG_R * 0.82, rz: LEG_R * 0.90, p: 3.1 },
      { y: 0.010, rx: LEG_R * 0.76, rz: LEG_R * 0.84, p: 3.0 },
      { y: 0.010 + OVER, rx: LEG_R * 0.70, rz: LEG_R * 0.78, p: 3.0 },
    ]), 'clothSecondary', MAT.CLOTH, 'leg');

    // boot — flares over the calf, then closes to the ankle
    add(`lowerLeg_${s}`, limb([
      { y: -0.465, rx: LEG_R * 0.56 + CLR * 2, rz: LEG_R * 0.60 + CLR * 2, p: 3.2 },
      { y: -0.38, rx: LEG_R * 0.72 + CLR * 2, rz: LEG_R * 0.78 + CLR * 2, p: 3.2 },
      { y: -0.28, rx: LEG_R * 0.90, rz: LEG_R * 0.98, p: 3.3 },
      { y: -0.24, rx: LEG_R * 0.84, rz: LEG_R * 0.92, p: 3.2 },
    ]), 'boot', MAT.HIDE, 'leg');

    add(`foot_${s}`, limb([
      { y: -0.075, rx: BOOT_R * 0.86, rz: BOOT_R * 0.70, p: 3.4, z: -0.020 },
      { y: -0.045, rx: BOOT_R * 0.98, rz: BOOT_R * 1.42, p: 3.6, z: 0.026 },
      { y: 0.010, rx: BOOT_R * 0.92, rz: BOOT_R * 1.30, p: 3.4, z: 0.020 },
      { y: 0.050, rx: BOOT_R * 0.78, rz: BOOT_R * 0.86, p: 3.0, z: -0.004 },
    ]), 'boot', MAT.HIDE, 'leg');
  }

  return parts;
}

/**
 * Her sword. Authored with the grip at the origin and +Y toward the tip, per
 * the socket contract in docs/specs/rig.mjs — which is what lets three
 * different swords share one socket transform with no per-item offset hack.
 *
 * The blade is a crystal, not a plate: two lofted facets that meet at a ridge,
 * tapering to a point. Magenta and emissive, which is what it is in the sprite
 * — the human remembered it as blue, and that is worth confirming before pass 2
 * spends time on the crystal detail.
 */
export function kaidaWeaponParts() {
  const p = [];
  const add = (geo, key, mat) => p.push({ geo, key, mat });

  add(limb([
    { y: -0.115, rx: 0.019, rz: 0.013, p: 3.0 },
    { y: -0.060, rx: 0.017, rz: 0.012, p: 3.0 },
    { y: 0.010, rx: 0.019, rz: 0.013, p: 3.0 },
  ]), 'shadowTint', MAT.HIDE);
  add(limb([
    { y: -0.128, rx: 0.026, rz: 0.020, p: 3.4 },
    { y: -0.112, rx: 0.022, rz: 0.017, p: 3.2 },
  ]), 'trim', MAT.METAL);
  // crossguard, swept forward
  add(limb([
    { y: 0.012, rx: 0.088, rz: 0.024, p: 4.0 },
    { y: 0.040, rx: 0.074, rz: 0.020, p: 3.6 },
    { y: 0.056, rx: 0.030, rz: 0.016, p: 3.0 },
  ]), 'trim', MAT.METAL);
  // blade — a low `p` and 4 sides makes a faceted crystal rather than a plate
  add(limb([
    { y: 0.050, rx: 0.030, rz: 0.014, p: 2.2 },
    { y: 0.190, rx: 0.037, rz: 0.017, p: 2.0 },
    { y: 0.420, rx: 0.033, rz: 0.015, p: 2.0 },
    { y: 0.640, rx: 0.024, rz: 0.011, p: 2.0 },
    { y: 0.760, rx: 0.005, rz: 0.003, p: 2.0 },
  ], { sides: 4 }), 'weaponEmissive', MAT.NEON);
  return p;
}
