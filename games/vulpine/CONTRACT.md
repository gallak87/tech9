# Star Fox Vulpine — build contract

**Target:** a Three.js flight-shooter that beats Star Fox 64 in a blind
side-by-side on visuals, with 2020s rendering. Arcade on-rails feel, AAA finish.

Several agents work this repo **in parallel**. The rules below exist so that
never turns into a merge fight or a mystery regression.

---

## 1. File ownership — do not edit outside your lane

| Lane | Owns | Must not touch |
|---|---|---|
| **world** | `src/world/**` | anything else |
| **ship** | `src/ships/**`, `src/render/geobuild.js` | `render/postfx.js`, `render/environment.js` |
| **render** | `src/render/postfx.js`, `src/render/environment.js`, `src/render/materials.js`, `src/render/textures.js` | `src/world/**`, `src/ships/**` |
| **fx** | `src/fx/**` | anything else |
| **combat** | `src/game/combat.js`, `src/game/ai.js`, `src/game/pickups.js` | `src/game/flight.js` |
| **flight** | `src/game/flight.js` | `src/game/combat.js` |
| **ui** | `src/ui/**` | the Three scene, the post chain |
| **audio** | `src/core/audio.js`, `src/audio/**` | anything else |

`src/main.js`, `src/core/engine.js`, `src/game/shots.js` and this file are
**shared** — treat them as read-only. If you genuinely need a new seam, say so
in your report instead of editing.

Everything you need is already wired: `installFx`, `installCombat`,
`installUI`, `installAudio` are called from `main.js` and handed the shared
`ctx`. Fill in your module; the wiring is done.

Need a review camera angle? `registerShot('my-shot', ctx => {...})` from **your
own file**. Do not edit `shots.js`.

---

## 2. The context object

```js
ctx = {
  THREE, engine, scene, camera,
  env,        // Environment  — sky, sun, IBL, fog
  world,      // Corneria     — terrain, water, groundAt(x,z)
  ship,       // Arwing root; ship.userData.api for animation
  flight,     // Flight       — pos, speed, boostActive, off, railZ, addShake()
  input,      // Input.state
  fx, combat, ui, audio,
  state,      // gameplay state the HUD reads (shield, lives, lockOn, enemies…)
  time, dt,
}
```

---

## 3. Seeing what you built

There is a real GPU screenshot harness. **Use it every iteration — do not
guess.** Never claim something looks good without a PNG you have actually
looked at.

```bash
cd games/vulpine
node tools/shot.mjs --shots ship-hero,valley --t 14 --out shots/mywork
node tools/shot.mjs --list                       # available angles
node tools/shot.mjs --js "__VULPINE__.post({exposure:0.3})"   # live tweak
```

Useful flags: `--w/--h`, `--t <sim seconds>`, `--quality ultra|high|medium`,
`--env corneria|sunset|space`, `--port` (**pick a unique port if another agent
is running the harness**), `--js "<expr>"` evaluated before capture.

The harness exits non-zero on console errors and prints them. A silent black
PNG is worse than a crash — always read the exit output.

`window.__VULPINE__` in the page gives you `post()`, `probe()`, `stats()`,
`seek()`, `step()`, `setShot()`, `setEnv()`, `hudVisible()`.

### Measure, don't eyeball

`__VULPINE__.probe()` returns a linear-light histogram of the frame.
Healthy daylight: **median 0.10–0.20, p90 < 1.5, clippedPct < 4, blackPct < 12**.
If you are fighting the look, probe first — the answer is usually exposure.

---

## 4. Hard rules

1. **No binary assets and no network fetches.** Every texture, mesh and sound
   is generated in code. `render/textures.js` has the noise and baking kit.
2. **No `Math.random()`.** Use `rng('your.stream')` from `core/rng.js` so
   captures are reproducible. Non-determinism makes review impossible.
3. **Frame budget: 16.6 ms at 1080p `--quality high`** on an M1 Pro.
   `stats()` reports it. Blowing the budget is a defect, not a trade-off.
4. **Nyquist.** Procedural detail finer than ~4× the sampling rate is not
   detail, it is noise. This already cost the project one full debug cycle —
   see the comment on `fbm2D`.
5. **Post-process units are pixels, not UVs.** Same reason.
6. Dispose geometry/materials you replace. `stats()` shows the counts.
7. Do not disable a pass to make your thing look better. Fix your thing.
8. **A new or reworked level must name a `section`/`path` combination no
   existing level uses.** If it cannot, it is not a new level — it is a variant
   of one that exists. Five of seven levels collapsed onto one cross-section
   because adding a DNA was free and adding a shape was not; this is the check
   that keeps that from happening again. See `PLAN-LEVELS.md`.
9. **The rail does not turn.** `centreline.x.waves` and `.bends` are empty on
   every level and a zone may not carry a `bend`. The ship's offset box travels
   with the rail, so lateral rail motion is not scenery — it is the player's own
   lateral throw being spent on following the corridor, and aiming is mostly
   horizontal. Vertical is still authorable and costs less: the box is 105 m
   wide against 78/46 tall. `tools/shape.mjs --strict` gates it at 0.5° of yaw.

---

## 5. What "AAA" means here, concretely

- **Silhouette first.** If it doesn't read at 100 px, no amount of shader saves it.
- **Material variety.** Nothing should look like one grey plastic. Metal, paint,
  glass, rock and water must respond differently to the same light.
- **No untextured flat faces** in hero framing.
- **Everything moves.** Static geometry in a 200 m/s game reads as cardboard.
- **Light does the work.** Key/fill/rim separation, real IBL, contact shadows.
- **Restraint in post.** Bloom, DOF and CA are seasoning. If a reviewer can
  name the effect, it is too strong.
