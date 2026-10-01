# Verification tools

Run `npm test` for all circuits' numerical checks: magnetic handling, Nacre flight, devices, camera composition, track frames/clearance, replay, catalog loading and resource lifecycle. `npm run lint` checks source and formatting; `npm run build` produces the shared application.

Run `npm run check:level -- <slug>` for the reusable CPU module/track contract and `VN_URL=<preview-url> npm run verify:level -- <slug>` for the generic short hidden runtime smoke check. See [level-checks](level-checks/README.md) for options, scope and limitations.

The older browser harnesses are circuit-specific. `npm run verify` covers baseline Halcyon controls; `npm run verify:orbital` covers Asterion. The `gate4-1-*` and `gate4-2-*` tools retain Nacre and Halcyon-device checks. Read a harness's options before using it; passing another level URL does not make its assertions generic.

Use `VN_URL` to target the intended existing preview. Verify the served build before opening a browser. The active level agent runs browser/render batches sequentially and closes owned processes afterward; no GPU grant or coordination ledger is required. Complete desktop production and critique before the final mobile pass. Keep checks hidden/headless and use short real-input segments plus fast numerical traversal/replay checks. `lap-run.mjs` is a legacy real-time full-lap driver; run it only when the user explicitly requests that check. No unsolicited videos or reference playback.

`VN_EVIDENCE` selects ignored output; the main harness accepts `VN_BROWSER_PATH` or `VN_BROWSER_CHANNEL`. Raw captures/reports belong in `.experiments/`. Preserve servers owned by other sessions and close the verification browser afterward. Hidden timings and viewport checks do not establish foreground performance, physical-device support or audible quality.
