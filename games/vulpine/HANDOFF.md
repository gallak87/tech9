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

Keep the fan-out to **1 sub-agent at a time, plus yourself inline on a disjoint
lane**. Five parallel lanes hit the usage ceiling in ~15 minutes and three of
them landed dead code. Hand a sub-agent the API contract it needs *in the
prompt* — making it re-derive the interfaces from source is what burned the
budget the time before.

Two concurrent lanes turned out to be one too many, and **not** because of
merge conflicts — disjoint files never conflicted once. The problem is that
every lane drives the *same running app*. A before/after capture renders
whatever the other lane's files happen to be at that instant, so any A/B
measures both changes at once. It cost a whole enemy-legibility comparison
before it was spotted (the other lane had moved the `combat-wide` camera).

If you must measure a look while another lane is live, capture from a clean
worktree instead:

```bash
git worktree add /tmp/iso HEAD --detach
ln -s "$PWD/node_modules" /tmp/iso/games/vulpine/node_modules
cp src/<your file> /tmp/iso/games/vulpine/src/<your file>
# capture before/after in /tmp/iso; delete with: git worktree remove /tmp/iso
```

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
   stacked sheets rather than landmass. **Still open.** Ruled out, each by a
   measured experiment — do not re-test these:
   - *Not the lateral skirts.* Dropping `SKIRT` 55 → 10 changed the image not at
     all, and `hemDepth` measures 1 m on the far tier.
   - *Not the near/far tier seam.* They survive `freecam --hide "^ridge-"`, and
     both tiers now band-limit identically at the shared boundary column.
   - *Not far-tier aliasing.* They are inside `|u| < 1100`, i.e. near tier.
   - *Not water, not fog.* Survive `--nowater` and `--nofog`.
   - *Not fx.* `combat-wide` re-shot with every `fx.*` mesh forced invisible
     every frame: all fins survive unchanged → `shots/dfx/combat-wide.png`.
   - *They ARE `terrain-*` meshes.* Same shot with every `^terrain-` mesh
     forced invisible: every fin disappears and only the smooth far-tier
     `ridge-*` landmass remains → `shots/dter/combat-wide.png`.
   - **The height FIELD is clean.** `heightAtU()` sampled on the exact near-tier
     column set (153 columns, reproduced from `nearColumns()`) for every z from
     720 to −4000 in 6 m steps, looking for a vertex differing from *both*
     lateral neighbours by more than 40 m: **zero hits.**

   So the previous handoff's advice — bisect the noise bands in
   `profile.js:heightAtU` — **is a dead lead, do not spend budget on it.** The
   defect is in the *mesh*, i.e. `terrain.js`: index buffers, the LOD stitch,
   skirt topology, or the skirt normals/colours. The fins are much darker than
   surrounding rock, so it may be a shading artefact as much as a silhouette
   one. A wireframe capture already exists: `shots/dwire/combat-wide.png`,
   where they appear as dense near-vertical streaks following grid *columns* —
   many rows compressed into a narrow lateral band, consistent with a fold or
   stretched sliver triangles rather than a displaced vertex.
2. **Water is a mirror plane.** One clipped specular streak, no waves, no shore
   interaction, no depth falloff. `world/water.js` is largely untouched.
3. **No terrain shadows.** `castShadow = false` on every chunk (`terrain.js`),
   so a 1750 m mountain range casts nothing and the landscape has no form
   definition. The comment says it waits for CSM — that is the real fix.
4. ~~**Enemies unreadable at distance.**~~ **Partly fixed** (`fee163a`). Two
   causes, both measured: the hostile plating was a *cool* blue-grey at
   metalness 0.9, so with almost no diffuse term every hostile was painted the
   colour of the haze it flew against; and every emissive on these hulls points
   aft, so a closing hostile had no lit pixel at all. Plating is now warm at
   metalness 0.55, and each class carries one dorsal camera-facing beacon with
   a floor on its *angular* size (colour = class, blink pattern = second
   channel). Costs one draw per live enemy.
   **Not finished:** past ~800 m they are still small and quiet. Re-tune after
   the water lane lands, since the background they compete against will change.
5. **Rear attackers are unfair, not hard.** Owner feedback from live play: too
   many enemies end up behind you and shoot from there. The radar already knows
   where they are, so the fix is almost certainly a rear-threat indicator (an
   edge-of-screen warning arc when a hostile has you in its firing cone from
   behind) rather than removing the `from: 'behind'` waves — being flanked is
   good, being shot by something you were given no way to notice is not.
   Owner is still thinking about which; ask before changing wave composition.
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
- **`tools/inputtest.mjs`** presses real keys and reports what the sim did with
  each control — the screenshot harness never touches the keyboard, so "does
  the fire button fire" is a question no capture can answer. This is what
  caught the gun-convergence bug after a dozen captures had missed it.
  `--menu` additionally photographs the title card and pause menu, which are
  only reachable through real key presses.
- **`tools/pacing.mjs`** steps the fixed-step sim and samples the live fight
  10×/second, then reports wave-to-wave gaps, entry range and **time-on-target
  per class**. A screenshot cannot answer "is there dead air here" or "how long
  does a raptor stay shootable" — those are questions about the sim over time.
  This is what found the station-seek bug that had every enemy in the game
  lagging its commanded position. `node tools/pacing.mjs <port> <sim seconds>`.

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
