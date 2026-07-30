# Visual review protocol

The build is not finished when it looks good. It is finished when a reviewer
shown this frame beside a modern Star Fox remaster **cannot reliably pick the
fan project** — and, on the shots we care about most, picks ours.

Reviewers here are adversarial by design. A review that returns "looks great,
ship it" on a first pass has failed at its job.

---

## Running a review

```bash
cd games/vulpine
node tools/shot.mjs --shots chase,ship-hero,ship-rear,ship-detail,ship-engines,valley,water,sun,underside \
     --t 14 --w 1920 --h 1080 --quality ultra --out shots/rN --port <yours>
node tools/sheet.mjs shots/rN --cols 2 --width 620      # → shots/rN/sheet.png
```

Read the contact sheet first for overall impression, then read the individual
full-resolution PNGs for anything you're about to criticise. **Never review from
the contact sheet alone** — it is downsampled, and downsampling hides exactly
the aliasing, banding and texture-resolution problems you are looking for.

A/B two builds:

```bash
node tools/sheet.mjs shots/rN-1 shots/rN --pair --labels "before,after"
```

---

## The rubric

Score each 1–10. **7 = a competent indie game. 9 = shipped AAA. 10 = the frame
is better than the reference.** Anything below 8 is a defect list, not an
opinion.

| # | Axis | What a 9 looks like |
|---|---|---|
| 1 | **Silhouette & readability** | Every object identifiable at 100 px. Friend/foe instantly separable. The eye knows where to look. |
| 2 | **Form & construction** | Surfaces read as manufactured objects with thickness and interior volume. No box-stacking, no untextured flats, no geometry that only works from one angle. |
| 3 | **Material response** | Metal, paint, glass, rock and water respond visibly differently to the same light. Highlights have shape. Nothing reads as grey plastic. |
| 4 | **Lighting** | Key/fill/rim separation. Real IBL. Contact darkening where objects meet. Shadow direction consistent everywhere. |
| 5 | **Atmosphere & depth** | Aerial perspective, layered distance, sky with structure. The horizon is a place, not a fog wall. |
| 6 | **Colour & tone** | A deliberate palette. Highlights roll off instead of clipping. Shadows have hue. Not washed, not crushed. |
| 7 | **Effects & motion** | Explosions, trails and impacts have staging and weight. Nothing is a flat billboard. Speed is legible. |
| 8 | **Post discipline** | You cannot name the effects. No bloom halos, no DOF mush, no visible aberration, no crawling edges. |
| 9 | **Density & craft** | Detail rewards a second look. No visible tiling, no repeated silhouettes in one frame, no empty screen thirds. |
| 10 | **Cohesion** | Everything looks like it came from one art direction and one renderer. |

Also report the measurements, not just impressions:

- `__VULPINE__.probe()` — healthy daylight is median 0.10–0.20, p90 < 1.5,
  clippedPct < 4, blackPct < 12.
- `__VULPINE__.stats()` — must hold 16.6 ms at 1080p `--quality high`.
- Console errors from the harness exit output. Any error is an automatic fail.

---

## Writing the verdict

For every axis under 9, give:

1. **The specific frame** — shot name, and where in it.
2. **What is wrong**, in rendering terms, not vibes. "The wing has no contact
   shadow against the fuselage so it reads as a decal" beats "wings look flat".
3. **The fix**, concrete enough to act on.

Rank the findings by how much each one costs the frame. Three real problems
ranked by severity are worth more than twelve observations.

End with one line: **would a player shown this and Star Fox 64 side by side
call this the newer game?** Yes or no, and the single thing most responsible
for the answer.

---

## Things that have already been shipped as bugs here

Check for them; they recur.

- Procedural detail past Nyquist for its sampling rate → aliased fizz that
  looks like noise, not detail. (`fbm2D` applied frequency twice.)
- Post-process offsets written in UV units instead of pixels → ~100 px of
  chromatic rainbow at 1280 wide.
- Terrain self-shadowing at heightfield scale → acne over the whole level.
- Depth of field focused on the wrong plane → the entire world soft while the
  subject is sharp, or vice versa.
- Emissive materials cranked to compensate for a bad exposure → everything
  blooms and the grade can never be fixed.
