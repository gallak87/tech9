# Gate 4.2 integration boundaries

Source checkout: `/Users/g/.codex/worktrees/gate4-2-halcyon-pickups/tech9`, branch `codex/gate4-2-halcyon-pickups`. Approved base `13bba6aca7c7a7aeb9b6af56a21a46a6111dfd36`. The user explicitly approved Gate 4.2 and authorized its commit/local merge on 2026-09-29; permission comes from that request, not the critic score.

## Shared runtime foundation

Shared changes were supplied by Gate 4.1, then applied here without unrelated Nacre code. Exact hashes are in STATUS.json:

1. Common runtime preflight: `/tmp/gate4-1-preflight.patch`.
2. Deterministic initial replay state and all-mode presentation update: `/tmp/gate4-1-preflight-supplement.patch`.
3. Input-log validation and replay re-export: `/tmp/gate4-replay-recording.patch`.
4. Protected-impact notice and compact landscape map: revised `/tmp/gate4-shared-feedback-ui.patch`.
5. Transactional malformed-initial replay rejection: `/tmp/gate4-replay-transaction.patch`.
6. Portrait lap-status wrap: `/tmp/gate4-portrait-timing.patch`; its exact added rule was appended with owner approval because the patch's surrounding Nacre CSS is absent here.

The central integrator should retain its own corresponding shared files and merge this feature's exclusive paths once. Do not import an entire core file from this lane over newer Nacre integration. The final no-op Halcyon stub is deliberately replaced by the real adapter.

## Feature-owned files

- `src/pickups/halcyon/**`: deterministic adapter/simulation/placements plus owned geometry, effects, audio, HUD and cleanup.
- `src/physics/index.js`: additive per-call propulsion/shield options; defaults and baseline physics version 3 remain unchanged.
- `tools/gate4-2-*.mjs`: unit and production-browser verification/critic harnesses.
- `docs/gate4-2/**`: this lane's durable status, findings, tuning, provenance and resource evidence.

There are no package/lockfile, input, ship-model, route, city, orbital or other-game changes from this feature. Core/camera/race/shared UI differences in this checkout are solely the reviewed shared foundation above. Dependencies and dist are isolated; no baseline server was repointed.

## Review and regression

Parent-owned preview: `http://127.0.0.1:5194/?features=halcyon-pickups`. Plain `/` remains pickup-free. Drive over amber Vector strips and through teal Aegis pickups; there is no item-use key. Existing W/arrow throttle, A/D steering, S brake, Shift manual boost, R recovery and Esc pause remain. Title practice selector exposes parked device/impact scenarios.

Use Node 22.15.0 (or compatible required runtime) and the existing `npm test`, `npm run lint`, `npm run build` scripts. Browser tools must use the explicitly assigned `VN_URL` and parent-serialized GPU slot; they do not start servers. Keep production dist frozen during captures. Do not run normal-speed automated full laps or create videos.

Final integration must check plain Halcyon, feature Halcyon, orbital production/shape and Nacre production/shape in the combined checkout. Exact track ID plus explicit feature flag must reject devices, feature state and HUD on the other circuits. Nacre code is absent from this deliberately isolated lane, so its integrated isolation check is recorded as pending rather than fabricated.

Final Gate 4.2 human approval was given on 2026-09-29. The existing explicit opt-in is retained. Broader levels, AI, inventory, weapons and additional mechanic types are outside this handoff.

## Prepared transfer

`/tmp/gate4-2-halcyon-feature.patch` contains only the feature-owned paths above. `/tmp/gate4-2-halcyon-manifest.json` records its SHA-256 and exact file list. The adapter entry diff replaces the reviewed preflight no-op stub; the rest of the feature folder is new. Physics and lane status are diffed against the approved base. No core, camera, race, shared UI, dependency or shared documentation files are included. Retain the shared owner's current integration; do not reapply already-adopted preflight patches blindly.

The package is verified by applying it to a temporary approved-base/stub fixture and comparing every produced file byte-for-byte with the lane checkout. Before integration, use `git apply --check` in the target checkout and review any stub/shared-physics divergence rather than forcing a patch. The original package predates the human-approval documentation; the approved branch commit is the authoritative transfer. Final combined-circuit validation belongs to the central integrator, and is not a new critic counter.

Current lane validation: 120 tests, full lint and production build pass; round 2 passes 17 targeted browser assertions with zero errors. Additional four-image same-pose comparison confirms the remaining portrait crop also exists without pickups. Critique ends at 2/8 with original FAIL/8.8 retained, pickup-specific blockers closed, baseline deferral and external-evidence hold. See CRITIQUE.md for the honest review outcome and subsequent human approval.

## Authorized local merge

Target: `g/scene-test` in `/Users/g/code/scratch/tech9`. Include the reviewed shared runtime/repair foundation needed by Halcyon and the approved Gate 4.2 implementation. Preserve the parent’s existing uncommitted AGENTS.md, GATE4_HANDOFF.md and global STATUS.json coordination edits. No Nacre implementation, approval, default-on change or remote push is part of this merge. Keep review servers and the feature checkout available.
