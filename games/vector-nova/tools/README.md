# Verification tools

Run `npm test` for all circuits' numerical checks: magnetic handling, Nacre flight, devices, camera composition, track frames/clearance, replay, catalog loading and resource lifecycle. `npm run lint` checks source and formatting; `npm run build` produces the shared application.

Run `npm run check:level -- <slug>` for the reusable CPU module/track/racing contract (all production levels must declare shared racing) and `VN_URL=<preview-url> npm run verify:level -- <slug>` for the generic short hidden runtime smoke check. See [level-checks](level-checks/README.md) for options, scope and limitations.

Run `node tools/assets-verify.mjs` for canonical runtime inventory, provenance and embedded GLB dependencies; `node tools/rival-assets-verify.mjs` also checks rival geometry and export hashes. Run `VN_URL=<preview-url> node tools/racing-verify.mjs` for shared race/device, replay, desktop and mobile checks; `VN_SMOKE_ONLY=1` limits it to loading checks, and `VN_LEVELS=orbital,glasswake` selects circuits.

`VN_URL=<preview-url> node tools/expansion-umbra-verify.mjs` checks short actual-key curved flights/landings, imperfect approaches, recovery, tidal controls, event pause/replay and selected-level asset failure. Run the generic level check alongside it for production/shape presets and idempotent teardown. After desktop critique finishes, `VN_URL=<preview-url> node tools/expansion-umbra-mobile.mjs` checks portrait and two landscape sizes in production/shape at high and low/reduced motion, including pointer capture/release and review controls.

The older browser harnesses are circuit-specific. `npm run verify` covers baseline Halcyon controls; `npm run verify:orbital` covers Asterion. The `gate4-1-*` and `gate4-2-*` tools retain Nacre and Halcyon-device checks. Read a harness's options before using it; passing another level URL does not make its assertions generic.

`VN_URL=<preview-url> node tools/nacre-racing-verify.mjs` checks actual two-lap replay results, dry/submerged devices and both audio buses, real underwater jump bubbles, pause and disposal. Desktop checks precede portrait/landscape; `VN_DESKTOP_ONLY=1` or `VN_MOBILE_ONLY=1` selects a pass.

Use `VN_URL` to target the intended existing preview. Verify the served build before opening a browser. Keep checks hidden/headless and use short real-input segments plus fast numerical traversal/replay checks. `lap-run.mjs` is a legacy real-time full-lap driver; run it only when the user explicitly requests that check. No unsolicited videos or reference playback.

`VN_EVIDENCE` selects ignored output; the main harness accepts `VN_BROWSER_PATH` or `VN_BROWSER_CHANNEL`. Raw captures/reports belong in `.experiments/`. Preserve servers owned by other sessions and close the verification browser afterward. Hidden timings and viewport checks do not establish foreground performance, physical-device support or audible quality.

`VN_URL=<preview-url> node tools/expansion-zephyr-verify.mjs` checks short real-key cathedral traversal, waterfall flights, recovery, tower pause/replay and owned geometry/sky load failures; `--shape` selects the neutral route. `node tools/expansion-zephyr-clearance.mjs` samples actual exported triangles around the banked route and flight poses. After desktop critique, `VN_URL=<preview-url> node tools/expansion-zephyr-mobile.mjs` checks full-hull framing, HUD/touch separation, release/cancel/blur and recovery in portrait and two landscape sizes at high/low/reduced motion; `VN_SHAPE_ONLY=1` selects shape review, and `VN_VIEWPORT=portrait,landscape,compact` can select affected sizes for a recheck.
