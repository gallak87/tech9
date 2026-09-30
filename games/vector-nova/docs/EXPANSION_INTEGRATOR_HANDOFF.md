# Fresh integrator — launch seven overnight level chats

Use the [launch ledger](expansion/LAUNCH_STATE.json) for current readiness, reviewed base, foundation and assignments. Update shared status there only; handoffs describe the execution procedure.

## Assignment and authority

When dispatched, review the shared base, prepare the foundation, launch **seven separate level chats**, and coordinate their parallel overnight production through final playable handback. Their approved concepts are Vesper Canopy, Glasswake Comet, Cindercoil, Saffron Leviathan, Zephyr Basilica, Helion Flare and Umbra Fold. **No human review stop during those builds before end state.** Build and check bare shapes internally, then continue full world/raceway production and the independent critic loop. Each level has one counter, capped at eight completed formal rounds; final human approval remains required.

Use this handoff to run the wave from a fresh integrator chat. Verify ledger state and the actual contract implementation before creating production chats.

The user is working directly with the old Gate 4 chats. **Do not ping fzero-42 or assign either old lane new work.** Use the merged shared branch; do not import extra changes from old level checkouts. The gameplay proposals in ROADMAP Gates 5–8 are separate and are not assigned to these level builders. No new AI, race modes, ships, inventory, weapons, economy or online systems belong in this wave.

The user authorizes seven new chats and their coordination; use the app tools to create them, not instructions for the user to click New Chat seven times. Keep the user's configured model/settings unless they explicitly request an override. No new commit, push or merge to the primary branch is authorized by this handoff; use reproducible patches and isolated review checkouts until separately requested.

## Locations and known state

- Primary repository: `/Users/g/code/scratch/tech9`, branch `g/scene-test`.
- Game: `games/vector-nova`; Node 22.13+ is required. Known runtime: `/Users/g/.nvm/versions/node/v22.15.0/bin`.
- Select the foundation from the shared branch and record its exact revision in the ledger. Preserve all merged circuits, real Halcyon devices and the asynchronous Blender Kestrel.
- Reuse the preparation worktree recorded in the ledger. Inspect its actual base/status and preserve the prepared tooling before updating it; preparation is not proof of a frozen foundation.
- Take the current documentation snapshot from the primary branch. Preserve the lean docs; do not restore completed review logs or older duplicated handoffs from feature branches.
- Local project discovered at drafting: `tech9`, project ID `dc94574c-5974-490b-b65f-d526f858778d`, host `local`. Call `list_projects` again before `create_thread`; use its returned ID rather than assuming persistence.
- Old parent/server-owner chat: `01a0eae4-476d-74c1-a7e8-e69338097bc1`.
- Nacre reference chat: `fzero-41`, local `01a0ebc7-32f4-79d1-b223-ebbf88104f31`. The shared branch is the integration source; no old lane needs to be relaunched.
- Pickups: `fzero-42`, local `01a0ebc7-8a1b-73c0-a593-e57b58629913`; checkout `/Users/g/.codex/worktrees/gate4-2-halcyon-pickups/tech9`. Initial pass merged at the base above; user may have subsequent work. Do not pull those changing files into this wave.

Start with `AGENTS.md`, the small global status and the [launch ledger](expansion/LAUNCH_STATE.json). For foundation work read architecture and [level API](EXPANSION_LEVEL_CONTRACT.md); for dispatch use the [common brief](EXPANSION_HANDOFF.md) and the relevant map brief. Consult roadmap/art sections only when needed. Do not preload every status file or old transcript.

If relying on old chat contents, call `read_thread` once before relying on them, then prefer compact `wait_threads` cursors. There is no need to read full old transcripts to launch this wave.

## Phase 0 — review the shared base for reuse

Inspect the recorded shared revision and actual working tree. Use the roadmap cleanup list as the starting point for the final reuse review, preserving the approved behavior.

Review reusable versus level-specific responsibilities: route/frame generation, launch/landing alignment if present, scene/backdrop/lighting factories, material and geometry helpers, water/weather lifecycle, deterministic scenarios/replays, texture/reflection ownership, reset/dispose, quality/reduced-motion handling, and shared UI/camera hooks. Look especially for cloned runtime paths, imports of another world's mutable source, hardcoded circuit identities, default-physics changes, unbounded resource generation and visual behavior hidden in global callbacks. Preserve the working art and human-directed handling while extracting only demonstrated common needs.

Produce a concise review with concrete findings and a reuse plan: what is already suitable, what needs a narrow repair/extraction, what should stay local, and which compatibility checks prove existing circuits still work. No blanket rewrite or automatic merge of an unapproved level. Resolve important correctness/lifecycle blockers before freezing a common package; keep purely local visual detail local. Record the reviewed candidate, findings/disposition, selected base and shared source provenance in the launch ledger. Then continue the workflow below within the user's authorization; do not invent another early shape-approval stop for each map.

## Phase 1 — freeze a working shared foundation before dispatch

1. Inspect the primary checkout and preparation worktree without resetting either. Preserve all existing dirty files. Copy only the current shared documents listed in the launch ledger and `docs/expansion/**` to the preparation checkout. Record actual base SHA, worktree and document snapshot in the ledger.
2. Review and complete the small generic level-loading/rendering/review contract described in `EXPANSION_LEVEL_CONTRACT.md`, informed by the completed reuse review rather than by speculative APIs. Inspect the merged level-selection code before changing it. Do not tell seven builders to independently edit `src/core/main.js` to add their maps. Keep a single runtime and entry point. Work from the recorded shared base.
3. Verify the foundation with a temporary, explicitly disposable fixture level, including an authored shape, production environment/backdrop, review views and one custom scenario. It is a test fixture, not a substitute for any of the seven finished levels. Remove fixture-only routes/assets before the final foundation package.
4. Run meaningful contract tests, full lint and build, and bounded hidden production checks of plain Halcyon, opt-in pickups, Orbital and Nacre production/shape, and the fixture. Preserve control direction, stationary slopes, pause/reset/replay, inspection, resource disposal and feature isolation. Coordinate GPU access before opening Chromium; see below.
5. Keep `EXPANSION_LEVEL_CONTRACT.md` aligned with the **actual verified exports and lifecycle** and record the frozen revision and verification result in the launch ledger. Include a minimal working builder example, a track/review/scenario schema, lighting/backdrop ownership and error behavior. Do not dispatch with unresolved required interfaces.
6. The README has been refreshed around the whole game. Keep circuit availability and features accurate as integration proceeds, with current setup/controls and links to focused docs. Retain the small status/current-handoff policy; do not regenerate historical report piles.
7. Freeze a complete binary-capable **foundation patch + manifest** against the base, including new files and the required shared document snapshot. Use a clean fixture to prove `git apply --check`, actual application, file hashes and boot. No commit is needed: a temporary Git index can stage only selected foundation paths to produce the patch without changing the real index. Record a durable absolute package path and SHA256 in the launch ledger; `.experiments/expansion-foundation/` in the primary game is an appropriate ignored location.

Only the integrator edits shared core/renderer/camera/UI/contracts. If a narrow builder/verification subagent helps, give it exclusive files and remain the single integrator. Do not start seven production chats before this dependency is concrete and verified.

## Phase 2 — create the seven chats

Use `list_projects`, then `create_thread` for the `tech9` project. A reliable bootstrap is a local project chat whose **first action is `create_worktree` at the recorded base**, followed by applying the verified foundation package. It must never edit the shared project checkout. This avoids requiring an unrequested foundation commit just to create seven isolated checkouts. Where the user has explicitly requested worktree-mode task creation and the tool can start at the correct recorded base, that is also suitable; do not silently start from the remote default branch.

Launch each once, record the returned real `threadId`/`hostId` (or pending `clientThreadId`) immediately, and do not duplicate a chat after an ambiguous result. Pending IDs cannot be used as real thread IDs. Use the app's creation-status/listing flow to resolve them. Each lane creates or reuses its own managed worktree and uses its returned absolute path for every command. Use branch prefix `codex/` if creating branches. No shared `node_modules`, symlinks or dist directories.

Suggested chat titles are in the ledger. Send a complete initial prompt, using the template below with actual paths, verified package hash, ports and the fresh integrator's own chat ID. This initial message explicitly authorizes each new lane to report setup/readiness, blockers, GPU requests and final results to this integrator; do not direct them to the old Gate 4 chats. Do not override the configured model or reasoning setting.

### Initial lane prompt template

> Execute `/Users/g/code/scratch/tech9/games/vector-nova/docs/expansion/<slug>/HANDOFF.md` and the shared EXPANSION_HANDOFF.md. You are the sole owner of map <number>, <title>. The user authorizes a complete overnight production goal, narrow builder fan-out and one independent brutal critic loop capped at eight rounds. No early human review stop: build/check shape, then continue full world and raceway production. Final human approval remains pending.
>
> Before any write, create/reuse a managed isolated worktree from `<verified base SHA>`; never edit the primary checkout. Apply `<absolute frozen foundation patch>` with SHA256 `<hash>` after checking the base, and read the included frozen EXPANSION_LEVEL_CONTRACT.md. Record paths/base/hash in your lane STATUS.json. Use only your allocated `src/levels/<slug>/**`, `public/assets/levels/<slug>/**`, `tools/expansion-<slug>-*.mjs` and `docs/expansion/<slug>/**`. Request required shared changes from the integrator rather than editing shared files.
>
> Your reserved dev/preview ports are <dev>/<preview>; query `?level=<slug>`, shape `&review=shape`. The integrator owns server startup/recovery and the shared GPU queue. Report your worktree and a ready production build before requesting a preview. Use hidden/headless Chromium, no visible windows or videos. You may message the launching integrator `<actual integrator threadId>`, host `<hostId>`, for necessary coordination and final results. Do not message fzero-41, fzero-42 or other level chats. No merge, commit or push; package your owned delta and preserve honest failed rounds/limitations. Create the full scoped goal without an invented token budget, and complete its authorized production/verification/handback objective without treating human approval as something you can supply.

After dispatch, use one compact `wait_threads` snapshot for the seven targets and retain each cursor. Check that each actually started its bootstrap rather than claiming launch from creation alone. In the final launch response, emit one required `::created-thread{threadId="..."}` (or pending `clientThreadId`) directive for every created chat.

## Servers and shared GPU

Keep the old servers running and leave their checkouts/ports unchanged:

| Existing lane           | Dev / preview |
| ----------------------- | ------------- |
| Primary approved game   | 5179 / 5180   |
| Nacre feedback          | 5191 / 5192   |
| Halcyon pickup feedback | 5193 / 5194   |

New allocations are 5201/5202 through 5213/5214, as listed in the ledger. Check port availability before dispatch; if a port is already occupied, assign a free pair and update both ledger and launch prompt rather than killing/repointing its owner. Start the existing npm scripts with CLI `--port` overrides in the **reported game cwd** and Node 22.13+. Do not edit package scripts for ports. Preview requires a successful production build. Verify listener cwd, HTTP response and served asset hash against that lane's dist. Keep final previews running; dev servers need run only while useful.

CPU/source work may proceed in parallel; **GPU-heavy browser captures are serialized across the host**. Before the first capture, inspect `/Users/g/code/scratch/tech9/games/vector-nova/.experiments/gate4-server-owner/state.json`. Honor its actual current owner; do not grant a capture until that owner reports closure or current read-only evidence establishes release. Do not ping the pickup chat.

Keep a durable FIFO queue/current owner in the expansion ledger and record expansion ownership in the existing shared coordinator state while a capture is active, preserving unrelated fields. A pending or timed-out tool call does not release ownership: require browser closure or verified process termination. Give each lane bounded short real-input batches, never a full real-time automated lap or concurrent seven-browser benchmark. Use the same policy for foundation checks. Headless observations cannot certify foreground frame pacing, physical devices or audio listening.

The old heartbeat `vector-nova-overnight-coordination` is paused and refers to only two old lanes; do not resume it unchanged. The requested overnight seven-lane coordination can use a new quiet thread heartbeat attached to the fresh integrator if needed. Its prompt must name the seven actual chats, ports, checkout/build ownership, FIFO GPU rule, no early human stops, cap policy and no automatic merge. Notify only on meaningful completion/failure or required user action; pause it when all seven reach final handback or need a user decision, leaving review servers running. Do not change sleep/security settings.

## Integration and final handback

Lane builders deliver owned-path deltas against the exact common foundation, a file/hash manifest and one concise current handback covering build/URL, checks, active critic table, resource peaks and open issues. Keep asset provenance separately; after merge retire completed handoffs/review history and fold lasting decisions into architecture/source docs. Preserve these in durable ignored packages, not only `/tmp`. Check the scope and hashes before accepting them. Common foundation changes are included once, not seven times. A critic does not implement fixes, approve its own work or invent human approval.

After lane handbacks, assemble a **separate review candidate checkout** from the base, foundation and the seven owned deltas. This is integration for review, not a merge to the primary branch. Verify all seven production/shape entries, distinct track/rules/replay identities, no asset/device leaks, baseline Halcyon/pickups/Orbital/Nacre, lifecycle, high/low and responsive review UI. These are combination checks, not a new art counter. Preserve the approved Nacre runtime alongside the new continuous-surface levels.

At a lane's eighth completed critic round, preserve unresolved shortcomings and package it for human judgment; do not rename another polish cycle to gain attempts. If only unavailable external evidence remains earlier, stop unchanged review churn and hand back honestly. A functional integration failure must be reported and resolved within the authorized integration scope, with changed-build evidence; do not silently retain a score from a different visual candidate.

Final delivery is seven clearly named playable URLs (and an optional combined review URL), a concise per-map outcome, outstanding issues and actual limitations. The whole world AND the road must be built: road materials, boundary silhouettes, supports/undersides, near/middle/far surroundings, sky and ordinary stretches matter as much as hero vistas. Final human approvals, commits and main-branch merges remain separate decisions.
