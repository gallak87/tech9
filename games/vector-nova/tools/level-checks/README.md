# Reusable level checks

These checks use the shipped [level API](../../docs/EXPANSION_LEVEL_CONTRACT.md). They do not select art, prescribe route shape, require flat ground, or load a copied runtime.

```sh
npm run check:level -- <slug>
npm run check:level -- <slug> --step .5 --arc-tolerance .01 --max-frame-turn .1
npm test
```

The CPU command loads only `src/levels/<slug>/{metadata,index}.js`, validates the same metadata/descriptor rules as discovery, awaits track creation, and checks production/shape route parity when shape is supported. Track construction must work without a renderer. It reports finite orthonormal axes, quaternion agreement, negative/multiple-lap wrapping, physical metre sampling, bounded frame changes including the seam, contiguous named sections, ordered checkpoints and finite supplied scenario fields. Checkpoints accept `distance` or `s`; supplied aliases/index must agree. Scenario omissions retain the shared vehicle defaults; no special scenario names are required.

For level-owned tests, import `assertTrackContract(track, options)` from `track-contract.mjs`, or await `assertLevelContract({ metadata, createLevel }, options)` from `level-contract.mjs`. Defaults sample at most 1 metre apart, allow 1% relative chord error and 0.1 radians of frame rotation per metre. These configurable numerical limits are not difficulty scores. Sampling is bounded to 4–25000 intervals; choose an appropriate smaller step for sharp geometry. This cannot establish continuity between every possible point, scenery clearance, real driving feel or valid Nacre flight gaps. Keep those authored tests.

## Hidden runtime smoke check

Coordinate the GPU slot and start the intended worktree's own built preview first. The command requires `VN_URL` and never starts or replaces a server:

```sh
VN_URL=http://127.0.0.1:5180 npm run verify:level -- <slug>
```

Optional `VN_BROWSER_PATH` or `VN_BROWSER_CHANNEL` selects Chromium; `VN_EVIDENCE` selects an ignored output folder. One hidden browser checks high/low and supported shape/production combinations, using brief real keyboard input. It verifies readiness, finite vehicle/camera poses, the served track identity, pause/input clearing, deterministic replay, review camera when supported, reset, repeated disposal and unknown-level/owned-asset failure cleanup. Low also enables reduced motion. Requests and metrics are retained in the ignored JSON report for selected-asset/budget review. No video, normal-speed lap or screenshot is produced.

A passing smoke check does not certify visual quality, foreground pacing, audible mix or physical gamepad/mobile support. Library lifecycle tests inject failures and malformed components directly; the browser command exercises the actual selected module and renderer. Builders should run their own scenery/geometry tests alongside these shared checks.
