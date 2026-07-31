# Vulpine — resume handoff

Drop this into a fresh agent to pick up mid-build. Read `CONTRACT.md` (lane
ownership + hard rules) and `REVIEW.md` (the rubric) before touching anything.

## Scope decision (2026-07-31)

**Stop trying to finish all 9 km + boss.** The owner's call: polish the *first
couple of encounters* and the moment-to-moment gameplay/enemy feel until it is
genuinely AAA, rather than spreading thin across the whole level. The mission
script already runs end-to-end and the boss is wired — treat everything past
about `z = -3000` as roughed-in, not as something to keep adding to.

Concretely, the next agent should work on, in order:

1. **Encounter feel, waves 1–4** (`z = -260 … -1950`). Spacing, entry angles,
   how long a raptor stays shootable, whether the wasp swarm reads as a threat.
2. **Enemy legibility.** At 100 px a raptor and a wasp are currently the same
   dark speck. Silhouette and emissive colour need to separate them.
3. **The two terrain defects below**, which cost more per frame than anything
   else left.

Everything after the delta is deliberately left rough. Say so; don't pretend.

## The two commands to re-issue

`/goal`:

```
I want you to build a 3D flying game Star Fox Vulpine at the level of the Star Fox 64 game. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from textures to physics to anything you could think of.
on each item and have a separate sub-agent check it visually to ensure it looks triple A. That separate sub-agent should be a really harsh critic, and if it doesn't look triple A, it should keep going.
```

Keep the fan-out to **1–2 sub-agents at a time on disjoint files**. Five
parallel lanes hit the usage ceiling in ~15 minutes and three of them landed
dead code (see below). Hand a sub-agent the API contract it needs *in the
prompt* — making it re-derive the interfaces from source is what burned the
budget last time.

## What just changed (this session)

The previous session fanned out five lanes and **three of them never wired
their work in** — 4,873 lines of finished modules that nothing imported. That
is now fixed:

| Seam | Was | Now |
|---|---|---|
| `game/combat.js` | 40-line stub | full fight: waves, bullets, lock-on, bombs, wingmen, boss |
| `ui/index.js` | legend only | status/radar/score/reticle/comms/wingmen/boss-bar |
| `core/audio.js` | no-op | graph + voices + engine + beds + music, autoplay-safe |

Also fixed this session:

- **`enemies.js` crashed on the first spawn.** `Object3D.clone()` round-trips
  `userData` through JSON, so the prototype's `userData.face` mesh reference
  came back an inert plain object. Engine nodes are re-found on the clone now.
- **Wingmen could not be cloned.** The Arwing hangs `userData.api` off its root
  with a back-reference, so `clone(true)` threw on a circular structure.
  `cloneVisual()` in combat.js shares geometry and drops userData.
- **Terrain skirts hung 55 m curtains off every cliff rim.** A fixed drop is the
  wrong shape for a seam whose worst crack varies from centimetres to tens of
  metres. Each skirt vertex now drops to the lowest surface height within one
  coarse span (`hemDepth`), measured at 1 m on the far tier where it was 55.
- **Fog density 0.00050 → 0.00022.** The haze colour is ~3× brighter than lit
  rock, so a ridge 2 km out was 63% haze and the whole level collapsed to one
  blue wash. This was the single biggest cost to the frame.

## Where we left off

Branch `g/fox64`. Clean checkpoint is still `bd01ae4`; **everything above is
uncommitted** — commit it before doing anything destructive.

Current reference frames: `shots/c3/` (HUD + combat, `--hud --params fight=1`).
`shots/int0/` is the "before" for this session.

## Known defects, ranked by cost to the frame

1. **Thin tapering fins hang off the canyon rims** (right side of
   `shots/c5/combat-wide.png`, and every in-canyon frame). They read as torn
   geometry and are the single biggest reason the canyon still looks like
   stacked sheets rather than landmass. **Not yet diagnosed.** Ruled out, each
   by a measured experiment — do not re-test these:
   - *Not the lateral skirts.* Dropping `SKIRT` 55 → 10 changed the image not at
     all, and `hemDepth` measures 1 m on the far tier.
   - *Not the near/far tier seam.* They survive `freecam --hide "^ridge-"`, and
     both tiers now band-limit identically at the shared boundary column.
   - *Not far-tier aliasing.* They are inside `|u| < 1100`, i.e. near tier.
   - *Not water, not fog.* Survive `--nowater` and `--nofog`.
   They are therefore real near-tier surface. Next step: bisect the noise bands
   in `profile.js:heightAtU` (suspect the `plateau`/`relief` term just past the
   cliff top `a3`, where `amp` is small but `rel` swings ±300 m, or
   `bankJitter`) by zeroing one band at a time and re-shooting `combat-wide`.
2. **Water is a mirror plane.** One clipped specular streak, no waves, no shore
   interaction, no depth falloff. `world/water.js` is largely untouched.
3. **No terrain shadows.** `castShadow = false` on every chunk (`terrain.js`),
   so a 1750 m mountain range casts nothing and the landscape has no form
   definition. The comment says it waits for CSM — that is the real fix.
4. **Enemies unreadable at distance** (see scope list above).
5. **HUD status block is missing its text.** The `SHIELD` label and the numeral
   in `status.js` do not appear in `shots/c3`, though the gauges do and the
   legend's text renders fine. Suspect a `glyphs.js` baseline/clip issue.

## Harness (use it every iteration — never claim a look without a PNG you read)

```bash
cd games/vulpine
node tools/shot.mjs --shots combat-wave,combat-wide --t 20 --w 1600 --h 900 \
     --quality ultra --hud --params "fight=1" --out shots/rN --port <unique>
node tools/sheet.mjs shots/rN --cols 3 --width 560     # → shots/rN/sheet.png
node tools/shot.mjs --list --port <unique>             # all angles (don't `tail` it)
node tools/sheet.mjs shots/rN-1 shots/rN --pair --labels "before,after"
```

New this session:

- `--hud` shows the HUD (default off); `--params "k=v&k2=v2"` appends arbitrary
  URL switches.
- **`?fight=1`** drives the trigger and lock from the sim clock instead of from
  input, so a capture shows an actual firefight. The harness never touches the
  keyboard, so without this every review frame had cold guns.
- **`tools/freecam.mjs`** parks the camera anywhere and looks anywhere —
  `--pos x,y,z --look x,y,z --fov --nofog --nowater --wire`. Every named shot in
  `shots.js` frames the level from *inside* it, which is the wrong place to
  stand when the question is "what shape is this level actually". This is what
  finally settled that the landmass exists and the problem was haze.

Non-zero exit = console errors, printed. **Any console error is an automatic
fail.** `.fxdbg.mjs` reads live state *after* a shot is applied. Run both from
`games/vulpine`, not the repo root.

In-page: `__VULPINE__.probe()` (healthy daylight: median 0.10–0.20, p90 < 1.5,
clippedPct < 4, blackPct < 12), `.stats()`, `.post({exposure})`, `.setShot()`,
`.seek()`, `.step()`, `.hudVisible()`. URL params: `?exposure=`, `?nopost=1`,
`?bloom=0`, `?hud=1`, `?fight=1`.

## Diagnosis notes worth not repeating

- **The landmass is fine.** Peaks to 1750 m, 86–100% of the highland is above
  water, the mesh matches the height function. Two separate investigations have
  now concluded "the terrain is missing" from in-canyon cameras that simply had
  the highland outside the frustum. Use `freecam.mjs --nofog --nowater` before
  claiming geometry is absent.
- Perf numbers are noise while lanes render concurrently — validate serially.
- Agents must register review cameras via `registerShot()` **from their own
  file**; `src/game/shots.js` is shared/read-only.
- No binary assets, no network fetches, no `Math.random()` (use `rng('stream')`).
