# Pinewatch Hunt execution and handoff

Playable pilot delivered on isolated branch `codex/pinewatch-hunt`, based on preparation checkpoint `f5c3be1d`. Worktree: `/Users/g/.codex/worktrees/pinewatch-hunt/tech9`. Only this game's and run's tracked paths changed. No push, publication, promotion, fishing edits or framework migration.

The complete loop is implemented and verified through real keyboard/mouse input: enter → follow tracks → quiet approach → aim/draw/release → hit → walk to animal → E retrieve → success → retry. Separate real-input checks cover misses, empty quiver, alert/flee/escape, retry, pause while moving/drawing, keyboard menu navigation, sign/log collisions and fresh state. The deer has an articulated procedural model, idle/step/alert/flee/down presentation; the bow, grip, string and nocked arrow are visible. One authored bounded encounter; non-graphic and intentionally silent.

## Run

```sh
export PATH=/Users/g/.nvm/versions/node/v22.15.0/bin:$PATH
cd /Users/g/.codex/worktrees/pinewatch-hunt/tech9/_tech9/games/pinewatch-hunt
npm run dev
```

Open http://127.0.0.1:4430. Dependencies are already installed. Fresh install uses `npm ci` with Node `^22.13.0 || >=24`. Production: `npm run build && npm run preview`, port 4431. Task-owned servers and browsers are stopped after verification.

WASD walk; mouse or arrows look; hold Shift for quiet approach; hold RMB or Q to aim; hold LMB or Space to draw then release; E retrieves within 3 m; Escape/P pauses. Visible buttons resume or start a fresh hunt. Pause menu offers graphics quality. Stay quiet inside 23 m; full draw and a clear body shot within 26 m. Stop moving to reduce alertness. The opening teaches the sequence and keyboard fallback.

## Verification

Final implementation: `236e569ae5ab60eacfdb31a3f11ceae38bbecc94`.

- `npm test`: **28 passing tests**, including rules, collision, lifecycle, settings isolation and production-controller input behavior.
- `npm run lint`: pass, including formatting.
- `npm run build`: pass; Vite's ordinary bundle-size advisory remains (Three.js-containing JS about 719 kB uncompressed / 190 kB gzip).
- `SCENE_PORT=4432 npm run verify`: **12 passing real-input browser checks**, including the whole successful hunt and failed hunts. Zero console, asset/request or WebGL errors.
- Final report: [round-4/verification.json](reviews/round-4/verification.json). Test hooks are read-only and only available behind `?test=1`. No teleport or award-hit hook exists. Browser blur is explicitly injected for the core focus-loss check; controller unit tests use synthetic event targets.
- Native boundary: early headed diagnostics on `80595a53` successfully exercised native pointer capture, blur release, resume and explicit pointer unlock. The exact-final `verify:native` suite could not finish after the host Mac locked. Computer-use reported “The Mac is locked and automatic unlock could not unlock it.” An asynchronous unlock request was sent; no bypass was attempted. **Exact-final native OS mouse/focus/pointer-lock validation remains unverified.** Synthetic controller tests support behavior but do not replace that native check. Run `SCENE_PORT=4432 npm run verify:native` on an unlocked desktop to complete it. This is an environment limitation, separate from code correctness and visual quality.

Performance: **60.0 observed FPS**, mean 16.666 ms, p95 16.7 ms over 210 frame intervals; 1600 × 1000, DPR 1, Balanced. Chrome 153.0.8010.53 headless, macOS arm64, Apple M1 Pro, ANGLE Metal Renderer Apple M1 Pro. This is requestAnimationFrame timing on the actual host, not isolated GPU time or a hardware guarantee. Other machine workloads were not controlled. All task-owned captures were serialized.

## Independent art gate

**FAILED at the four-round cap: 6.1/10 against an 8/10 threshold.** No further art rounds were run.

| Round | Frozen implementation           | Score | Result                                                                         |
| ----- | ------------------------------- | ----- | ------------------------------------------------------------------------------ |
| 1     | `80595a53`                      | 5.3   | Deer, bow, forest and tracks need refinement; three correctness findings       |
| 2     | `c854ad7f` (runtime `52b987dc`) | 5.8   | Smoother anatomy, smaller bow/grip, flat tracks; correctness findings resolved |
| 3     | `5d7693b4`                      | 6.0   | Fur, wood, forward arrow and forest depth improve                              |
| 4     | `236e569a`                      | 6.1   | Final coat/glove improvement; cap reached                                      |

The separate critic `/root/critic` inspected frozen code and actual browser captures; it did not author implementation. Compact JSON plus two representative screenshots per round are committed separately from code. The reviewer did not independently run the browser or establish temporal animation quality. Final [intro](reviews/round-4/intro.png), [aiming view](reviews/round-4/aim.png), and [review](reviews/round-4/review.json).

Remaining visual deficits: procedural-looking deer anatomy/face/coat, simple glove and bow detail, coarse repeated canopy shapes and pale sky gaps. This is a coherent playable prototype, not AAA finished art. Independent correctness review found no remaining known code blockers after fixes to alpha-card arrow obstruction, deadfall collision and menu keys.

## Limitations and stopping point

One deterministic animal and route; simple distance/noise awareness and immediate ray-tested shooting with a cosmetic arrow; approximate circle-chain solids; small plants are passable; no audio, mobile controls, inventory, economy, gore or ecosystem. A practiced run is shorter than the brief's three-to-five-minute exploratory target. Further depth and visual work wait for user playtesting. Native verification remains the documented environment follow-up above.

Provenance receipts `tech9.json` and `GAME_PLAN.json` remain unchanged from the CLI fork, including their original scaffold wording. Original Blender/GLB/texture/font source and license files are preserved. New models/textures are authored locally; see `public/game/ASSETS.md`. [Consumer notes](CONSUMER_NOTES.md) record framework friction and potential reuse; nothing was promoted.
