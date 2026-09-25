# Capability promotion handoff

Completed the four user-requested promotions inside `_tech9`: grounded walking/input lifecycle, placement-derived collision helpers, supported Node startup and pond water with its coupled shore/terrain/vegetation example. Framework **2.1.0** registers modules **1.0.0**, forest starter **0.2.0** / scene **1.2.0**, and available pond starter **0.1.0** / scene **1.0.0**. Accepted games and the legacy root framework were not modified.

## Checkpoints and independent review

- `f27615150aabbdf7032f082325a1bbb1ca140557`: initial extraction, source-copy tooling, local Node launcher and Tidebreak preparation packet.
- `89bcfe0c46f505755940621d68e64b4a9a71662c`: corrected runtime and browser-test checkpoint. This is the source used for final behavioral and standalone-copy validation.
- `bae0357ad8680358aefbdb1dd7b208b8806954fc`: enable the pond starter after standalone proof; availability and framework documentation only. Runtime/source bytes are unchanged from the preceding checkpoint.

The independent `promotion_historian` reviewer owned no implementation. Its first frozen review found one P2: OS key repeats could revive held movement/look after pause/resume. The correction ignores repeats and tests movement and look separately, including a new physical press afterward. The reviewer verified the fix, all 14 controller tests and the canonical/copy hashes, and cleared remaining engineering blockers. Strict pond ports and the browser test's port override were also corrected.

The first forest walking browser run reached an intervening rock before its intended tree. The corrected test approaches an accessible authored tree through a clear waypoint and retains both boundary-reach and non-penetration assertions. The runtime collision was working; the test route was wrong. Neither this test failure nor the review finding is hidden by the final passing result.

## Validation

All relevant unit, lint/format and build checks passed: **55 framework/module**, **20 forest** and **14 pond** unit tests. Module checks verify byte-identical canonical/copy source plus version/hash records. Both builds retain Vite's ordinary large-chunk advisory; no bundle optimization or new art score is claimed.

Final browser validation against production builds was serialized:

| Build                             | Input/behavior checks                                                                                              | Result |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| Framework forest, default flight  | Input/elevation, bounds, five controls, views, resize, resource tuning, errors/test-hook absence                   | 10/10  |
| Framework forest, walking, headed | Start/movement/look, authored tree collision, pause/tuning, native capture, real focus transfer, resume and errors | 9/9    |
| Independent forest copy           | Real walking route, tree boundary, pause/look/menu behavior and production hook absence                            | 8/8    |
| Independent pond copy             | Real walk to shore/bank rock, pause/reset, five controls/reflection budgets, narrow layout and errors              | 8/8    |

The pond blur assertion dispatches a blur event; it is not native-focus proof. Native capture/focus was proven separately in the headed forest integration of the same copied controller. Full source details, commands, environment and compact results are in [review.json](./review.json).

Fresh-copy proof used a disposable Git fixture populated by `git archive` of `89bcfe0c`. Only its temporary catalog enabled the candidate pond so the actual fork tool could exercise both starters before publication. The receipt's fixture commit is `6b7a6868572194977bf96bfdfb24215da04c5135`; the review records each source snapshot hash. After copying, all framework scene/module/tool/catalog source was removed from that fixture. Both copies then passed independent `npm ci --offline --ignore-scripts --no-audit --no-fund`, units, production build and real-input browser checks. No dependency symlink or framework source was available to these copies. Install scripts were disabled for this fixture; no repository hooks were installed.

Browser: Chromium **151.0.7922.34**, Apple M1 Pro/ANGLE Metal, **1600 × 1000**. Headless forest flight at High observed mean **16.89 ms**, p95 **17.60 ms**; the headless pond copy at Balanced observed mean **8.33 ms**, p95 **9.20 ms**. These are browser animation-frame intervals under local scheduling, not isolated GPU timings or a general FPS guarantee. Browser/GPU work was serialized; external machine load was not controlled. There is no new AAA art cycle, and prior pilot scores remain unchanged.

## Use and next pilot

From the repository root, `./_tech9/run --runtime` reports a supported installed Node; `./_tech9/run run dev:walk` opens grounded forest exploration and `./_tech9/run run dev:pond` starts the neutral pond scene. Each scene retains its own dependency installation. Dev/preview ports are forest **4399/4400**, pond **4450/4451**; use a free `SCENE_PORT` for browser checks. Test-owned servers and browser instances were closed.

The [Tidebreak brief](../../games/tidebreak/BRIEF.md) and [kickoff prompt](../../games/tidebreak/PROMPT.md) are preparation only, exactly two documents. A fresh session/worktree will implement it. Start from the final promotion/evidence commit or a later clean descendant. Ocean around an island, boat movement, wake and chase camera remain new game-owned work; the pond module does not already supply them. The packet reserves ports **4460/4461/4462**, prescribes a managed goal and the independent **8/10 or four rounds** critic stop, and asks for consumer/historian notes afterward.

Water still has one real game consumer plus the framework example and independent copy proof. Collision remains conservative XZ geometry, and the pond's decorative deadfall/small foliage are not solid. Broader ocean/physics/mobile capabilities, existing-game upgrades and root migration remain outside this completed promotion.
