# Vulpine — resume handoff

Drop this into a fresh agent to pick up mid-build. Read `ROADMAP.md` (the plan —
what is done, what is next, what is out of scope), `CONTRACT.md` (lane ownership
+ hard rules) and `REVIEW.md` (the rubric) before touching anything.

## Keeping the plan honest

`ROADMAP.md` is the plan. This file is the queue and the session log. They drift
apart unless you close the loop, and for seven sessions there was no plan at all
to drift from — every session re-derived its priorities from a defect list, which
is how a scope decision the owner made out loud ended up buried in a bug note.

So:

- **Every commit that closes a roadmap item ticks its box in the same commit.**
  Not afterwards, not "in the next one". If the commit does not close an item,
  say which phase it belongs to in the message.
- **At the end of a phase**, re-cut the `Status:` line at the top of
  `ROADMAP.md`, move the finished block into `## Done` with the files it landed
  in, and delete the finished items from the defect list below.
- **Anything discovered mid-session that is not this session's work** goes into
  `ROADMAP.md` under the phase it belongs to — not into a comment, not into a
  commit message, not only here.
- **Do not add a module the roadmap does not ask for.** Ship criterion 7 is "no
  dead code"; this project has now shipped ~5,400 lines of finished, unimported
  modules across two sessions. `world/reflection.js` was the last of them and is
  now wired; the built-world materials (Phase 9) are the remaining ~160 lines.

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

## Session 2026-08-01 (b) — boss fight + water

Two lanes, one sub-agent on water and the main agent inline on the boss.

**Boss (`game/combat.js`, `ships/boss.js`, `ui/bosshealth.js`).** All three of the
owner's live-play complaints were real and all three are fixed. Measured with
the new `tools/bossprobe.mjs`, over a 45 s fight:

| | before | after |
|---|---|---|
| in weapon range (<1100 m) | drifted out | **100%** |
| inside the ±17° lock cone | ~68% | **95.6%** |
| lock ever holds the boss | impossible | **53.9%** (on a weak point) |
| rounds that landed on it | **0** | **147** |
| closest any round got to the hull | 282 m | **12 m** |
| a part visibly flashing | 0% | **85%** |

Four separate causes, none of which was "drift":

1. *Station-keeping sampled the ground in the wrong place.* Altitude was floored
   at `groundAt(player.x, player.z − 560) + 80`; the river meanders ~120 m over
   560 m, so that point is inside the canyon wall for most of the level and
   `groundAt` returned the rim. The carrier was ordered to ~450 m while the
   player flew at 70, biased by the meander — the reported "up and to the left".
   It now samples under itself and is hard-clamped into a box around the player
   (`TUNE.boss`). The box is the leash; it cannot leave the weapon envelope.
2. *The weak-point table was double-offset.* `part.local` is measured in the
   carrier's frame but was composed with the part **node's** `matrixWorld`, which
   already carries that offset. Measured on the live rig: nacelles resolved
   60.8 m from the hull centre instead of 30, turrets 28–44 m instead of ~16,
   the core 9 m instead of 4.4. Every collision test and every lock point in the
   fight aimed at empty space beside the ship. `api.partPoint()` now owns it.
3. *The lock point flipped between the two nacelles every tick.* They are 60 m
   apart, so the seeker's lead term read a 1/120 s flip as ~7 km/s of target
   motion and threw every guided round a kilometre wide. The chosen part is
   sticky now — held until it dies or the core opens.
4. *Collision was a point test, not a sweep.* A tap round covers 16 m per tick
   against a 13 m hit sphere, so fast rounds tunnelled through the hull.

Also: the hit register (per-part additive shell, amber on a destructible, cold
blue on plating; pooled hull blooms parked at the contact point in the ship's
frame; impacts scaled to the part; a strike flash and an aim marker on the boss
bar's part strip), and an HP rebalance — 95 s of *flawless* fire to kill it was
a wall, not a fight.

**Harness gotcha worth not rediscovering.** `__VULPINE__.step(n)` runs n fixed
ticks and refreshes the rendered scene **once**, at the end. The guns converge on
the camera ray and the camera only moves in that refresh, so a probe that batches
30 ticks fires 30 volleys down a camera pose up to 44 m stale and *nothing hits
anything*. That artefact alone cost most of a debugging session. Step one tick at
a time. Real play is fine (`frame()` batches at most 2).

**Water (`world/water.js`, `world/world-materials.js`).** The "polished plastic
sheet" was **not** the water shader. The Gerstner and ripple code was running
correctly the whole time and was simply **hidden**: the 42 km open-ocean apron, a
plain `MeshStandardMaterial` disc, sat 2.5 m below a surface whose swell troughs
reach 4.8 m, so across most of a grazing frame the apron won the depth test and
you were looking at an untextured disc. Proof pair: `shots/wdiag3/graze-apronly.png`
(apron only) is pixel-for-pixel the old "broken" look; `graze-noapron.png` shows
the real surface. Apron dropped to y = −12 and given the same surface shader.
On top of that: a 6-band ripple system faded on **pixel footprint** (`fwidth`)
rather than camera distance — at 200 m/s the grazing angle dominates, which is
why the old distance fade left the near field bare — with the lost amplitude
handed to roughness Toksvig-style; `ior: 1.333` so water stops rendering brighter
than the rock beside it; Beer-curve depth absorption; a three-part shoreline; sun
glitter. Before/after: `shots/base01/water.png` → `shots/commit-check/water.png`.

**`src/world/reflection.js` is now wired** (`corneria.js`). Constructed once,
shared by both water materials by uniform identity, driven from the sentinel
probe's `onBeforeRender` after `_applyLOD()` — LOD first, or the mirrored pass
draws a coarser tier than the one on screen. Hidden for the pass: the water
group, the probe itself, and every `environment` child with `renderOrder <= -999`
(sky dome, starfield, nebula). Hiding those is load-bearing, not an optimisation:
the buffer is cleared to alpha 0 so the shader can tell "this ray hit rock" from
"this ray went to sky" and keep the IBL for the second case. Draw the dome and
every one of those pixels gets alpha 1 and the distinction is gone.
Result: `shots/wdiag2/graze.png` → `shots/refl1/graze.png`.

### Next steps, in order

1. **The frame is over budget, and it is not the reflection.** First
   contract-point reading ever taken (1080p `--quality high`, serial, same five
   shots): 17.3 ms with the reflector disabled, 18.1 ms with it. The base frame
   was already over on its own. Profile that before optimising anything, and
   note run-to-run variance is ±2 ms — one reading proves nothing.
2. Tune the shoreline — the beach edge is still a hard geometric line with no
   foam and the sand is a flat untextured wedge (`shots/refl1/w-shore.png`).
3. `w-shore` composites at median 0.068 against a 0.10–0.20 target. Clipping and
   black are healthy, so it is grade rather than range.

## What changed the session before

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

**Resolved since this list was written** — do not re-investigate:
- ~~Fins hanging off the canyon rims.~~ The terrain index buffers were wound
  backwards, so back-face culling kept the faces turned *away* from the camera.
  Fixed in `4bb0eeb`; the note below is kept only for the elimination trail.
- ~~Water is a mirror plane.~~ It was the apron occluding it. See above. Planar
  reflection is still not wired in.
- ~~No terrain shadows.~~ Delivered as a baked **horizon map** rather than CSM —
  eight compass sectors of horizon elevation per point, evaluated per fragment
  against the live sun (`GLSL_HORIZON` in `world-materials.js`). No cascade seam,
  no acne, no range limit, and it tracks the environment preset.
- ~~HUD status block missing its text.~~ `SHIELD` and the numeral render.
- ~~The boss drifts out of the fight.~~ / ~~No hit feedback on the boss.~~ Both
  fixed and measured — see the table above.

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
6. **The boss drifts out of the fight.** Owner feedback from live play
   (2026-08-01): Gargantua climbs away up and to the *left* and parks there,
   far enough out that player fire simply does not land. The only way to bring
   it back is to descend, at which point it re-enters range. So the encounter
   has a dead phase in the middle of it where the player has no way to make
   progress and no indication of why. Two things to separate before fixing:
   whether the boss's station-keeping is *drifting* (an integration or
   leash bug — cf. the station-seek bug in `ai.js` that had every enemy lagging
   its commanded position) or whether the pattern genuinely commands that
   position and the arena is simply too large. Note the bias is consistently
   up-and-left, not random, which points at the former. Look at `ships/boss.js`
   and the boss branch of `game/combat.js`. Unmeasured so far — `tools/pacing.mjs`
   samples the live fight over time and is the right instrument; extend it to
   log boss position and player-to-boss range per second.
7. **No hit feedback on the boss (and possibly on hulls generally).** Owner
   feedback from live play (2026-08-01): rounds landing on the boss produce no
   read, so there is no way to tell a hit from a miss — which is most of why
   the out-of-range phase above is confusing rather than merely annoying.
   Wanted: a short light pulse on impact. `fx.impact()` and `fx.shieldHit()`
   already exist and are wired for foes (`hurtFoe` passes an impact point and a
   normal); check whether `bossHit()` in `combat.js` calls anything equivalent,
   and whether the boss's own materials have a hit-flash channel the way
   `f.hitFlash` gives the raptors one. Cheapest strong version is an emissive
   flash on the struck part plus one pooled point light — the pool already
   exists in `fx/index.js` (`LIGHTS = 3`, idled at intensity 0). Keep it under
   ~0.12 s; a flash you can name is too long.

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

- **`tools/bossprobe.mjs`** steps to the boss trigger and then samples the fight
  4×/second: the leash envelope in each axis, how much of the fight the carrier
  spends inside the guns' range and cone, whether the lock ever holds it, which
  part it holds, how many rounds actually land, and when each weak point dies.
  `node tools/bossprobe.mjs <port> <fight seconds>`. It tops the player's shield
  up every tick — the harness never dodges, so without that the player is dead
  with `outcome: 'lose'` before the carrier even spawns and every counter freezes.

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
