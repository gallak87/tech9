# Reusable level checks

These checks use the shipped [level API](../../docs/LEVEL_API.md). They do not select art, prescribe route shape, require flat ground, or load a copied runtime.

```sh
npm run check:level -- <slug>
npm run check:level -- <slug> --step .5 --arc-tolerance .01 --max-frame-turn .1
npm test
```

The CPU command loads only `src/levels/<slug>/{metadata,index}.js`, validates the same metadata/descriptor rules as discovery, awaits track creation, and checks production/shape route parity when shape is supported. Track construction must work without a renderer. It reports finite orthonormal axes, quaternion agreement, negative/multiple-lap wrapping, physical metre sampling, bounded frame changes including the seam, contiguous named sections, ordered checkpoints and finite supplied scenario fields. Checkpoints accept `distance` or `s`; supplied aliases/index must agree. Scenario omissions retain the shared vehicle defaults; no special scenario names are required.

For level-owned tests, import `assertTrackContract(track, options)` from `track-contract.mjs`, or await `assertLevelContract({ metadata, createLevel }, options)` from `level-contract.mjs`. Defaults sample at most 1 metre apart, allow 1% relative chord error and 0.1 radians of frame rotation per metre. These configurable numerical limits are not difficulty scores. Sampling is bounded to 4–25000 intervals; choose an appropriate smaller step for sharp geometry. This cannot establish continuity between every possible point, scenery clearance, real driving feel or valid Nacre flight gaps. Keep those authored tests.

## Hidden runtime smoke check

Build and start the intended worktree's own preview on a free port first. The command requires `VN_URL` and never starts or replaces a server:

```sh
VN_URL=http://127.0.0.1:5180 npm run verify:level -- <slug>
```

Optional `VN_BROWSER_PATH` or `VN_BROWSER_CHANNEL` selects Chromium; `VN_EVIDENCE` selects an ignored output folder. One hidden browser checks high/low and supported shape/production combinations, using brief real keyboard input. It verifies readiness, finite vehicle/camera poses, the served track identity, pause/input clearing, deterministic replay, review camera when supported, reset, repeated disposal and unknown-level/owned-asset failure cleanup. Low also enables reduced motion. Requests and metrics are retained in the ignored JSON report for selected-asset diagnostics. No video, normal-speed lap or screenshot is produced.

A passing smoke check does not certify visual quality, foreground pacing, audible mix or physical gamepad/mobile support. Library lifecycle tests inject failures and malformed components directly; the browser command exercises the actual selected module and renderer. Use authored scenery/geometry tests alongside these shared checks.

Halcyon's focused desktop check is `VN_URL=<url> node tools/halcyon-gameplay-verify.mjs` (optional `VN_BROWSER_PATH` and `VN_EVIDENCE` as above). It covers normal-launch devices and the 2×2 field, solo practice, pause/replay rollback, acquisition feedback, high/low reduced-motion behavior, two-lap timing with continued driving, and retained paddock results. Full-lap input is generated with the actual physics on the CPU and played through accelerated replay; short real-input checks exercise presentation. Screenshots and raw results stay under `.experiments/`. It replaces the retired opt-in Gate 4.2 browser scripts.

Cindercoil's local `expansion-cindercoil-*.test.mjs` checks cover transported frames, actual vent flight, outboard rail catches, hazard/replay state and asset ownership. Against a production preview, `VN_URL=<url> node tools/expansion-cindercoil-assets.mjs` checks kit/sky/surface-load failures. After desktop changes settle, `VN_URL=<url> node tools/expansion-cindercoil-mobile.mjs` checks portrait/short-landscape high/low layouts, touch release/cancel, focus loss and actual landing/recovery cues. Both browser tools stay headless, close their browsers and store raw results under ignored `.experiments/`.
