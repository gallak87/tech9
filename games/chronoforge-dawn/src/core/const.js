// ─────────────────────────────────────────────────────────────────────────────
// The numbers every lane must agree on. SHARED CORE — read-only to builders.
//
// If a lane needs one of these changed, that is a core-change request to the
// integrator, not an edit. A lane that hard-codes its own copy of TILE_M is how
// two subsystems end up half a metre apart six phases from now.
// ─────────────────────────────────────────────────────────────────────────────

/* ── units ────────────────────────────────────────────────────────────────
   Metres, +Y up, right-handed. Seconds. Degrees only in authored data and at
   API boundaries; radians everywhere inside. Colours are LINEAR in the scene
   and sRGB only at the very end of the post chain and in UI CSS.            */
export const TILE_M = 2.0;        // one authoring tile = 2 m. Tiles never leave data.
export const HERO_M = 1.72;       // a hero is this tall; scale checks use it
export const GRAVITY = 9.81;

/* ── the locked camera ────────────────────────────────────────────────────
   CONCEPT.md fixes this: 55° pitch, no player rotation, no player zoom. It is an
   art-direction decision — one known framing means every vista is hand-tunable
   and no unlit angle is reachable — so it lives in core where no lane can drift
   it. The single licensed exception is a combo finisher, a scripted 2–3 s cut
   that may break pitch and must restore it; it goes through `rig.cinematic()`.  */
export const LOCKED_PITCH_DEG = 55;
export const LOCKED_YAW_DEG = 0;   // camera sits due +Z of the party, looking −Z

/**
 * The "orthographic scale" the concept defers to dev, expressed the way it is
 * actually useful: the world-space height of the image plane at the focus
 * point, in metres. 18 m puts a 1.72 m hero at ~62 px of a 1080p frame
 * (a vertical rod projects at cos(55°) = 0.574 of its length), which is the
 * smallest a rig can be and still read as a deliberate pixel-art silhouette.
 * Visible ground at that scale is ≈ 32 m across by 22 m deep.
 *
 * Projection is a narrow-FOV PERSPECTIVE camera, not a true orthographic one.
 * Ortho would give free tile alignment but costs every depth cue the look is
 * built on: circle-of-confusion falloff, parallax between terrain layers, sun
 * shafts, and correct occlusion of what is behind a ridge. At 30° FOV the
 * divergence across the frame is small enough to read as orthographic while
 * keeping all of it. FRAME_HEIGHT_M is the knob; FOV follows from it.
 */
export const FRAME_HEIGHT_M = 18;
export const CAMERA_FOV_DEG = 30;

/* ── budget ───────────────────────────────────────────────────────────────
   Hard gate at 1080p. Blowing it is a defect, not a trade-off. `stats()`
   grades against it and the critic reads that grade.                        */
export const BUDGET = {
  frameMs: 16.6,
  drawCalls: 900,
  triangles: 2_600_000,
  programs: 220,
};

/* ── time of day ──────────────────────────────────────────────────────────
   Hours, 0–24. DAWN is the signature hour — the frame every reviewer judges —
   so it is the default for every capture unless a probe says otherwise.      */
export const DAWN_HOUR = 6.4;
export const NOON_HOUR = 12.5;
export const DUSK_HOUR = 18.9;
export const NIGHT_HOUR = 22.5;
