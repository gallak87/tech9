# Fresh integrator — launch seven level chats

This is an execution handoff for a fresh integrator **when the user dispatches it**. Editing or reviewing these documents does not itself launch the wave. Use the live [launch ledger](expansion/LAUNCH_STATE.json) at `/Users/g/code/scratch/tech9/games/vector-nova/docs/expansion/LAUNCH_STATE.json`; isolated copies are snapshots. Keep current readiness, assignments, ports and GPU ownership there only.

## Assignment and authority

Launch the seven approved worlds in separate isolated chats and coordinate them through playable handback. The [common brief](EXPANSION_HANDOFF.md) owns production, asset workflow, lighting, verification, the single eight-round/9-out-of-10 critic policy and final human review. No early human shape-review stop applies to this wave. Each [lane brief](EXPANSION_HANDOFF.md#lanes) owns its defining interactions and art direction.

The named jumps, grip/drag zones, hazards/heat, tidal forces and large world events are authorized. Shared pickups/boost additions are future placement notes only; rough or hard unsupported gameplay is acceptable. Race/AI/ship/inventory/economy expansion remains separate. Preserve the approved circuits and Halcyon’s opt-in devices. Do not message or assign work to the old Gate 4 chats, or import changing code from their checkouts.

Local checkpoint commits on isolated branches are authorized. Keep primary code unchanged and build the combined candidate in a separate review checkout; no primary merge or push before the user approves it. The live coordination ledger is the integrator’s shared-state exception. Keep the user’s configured models/settings and discover the current project ID with `list_projects` before task creation.

## Start from the completed foundation

Primary repository: `/Users/g/code/scratch/tech9`, branch `g/scene-test`; game: `games/vector-nova`. Use Node 22.13+; the known Node 22 runtime is `/Users/g/.nvm/versions/node/v22.15.0/bin`.

1. Read `AGENTS.md`, the small status, live launch ledger, common brief and [actual level API](EXPANSION_LEVEL_CONTRACT.md). Inspect only the architecture/source relevant to an unresolved need. The ledger’s selected commit includes the reviewed loader/lifecycle/metadata, optional geometry helpers, level-owned folders and shared checks. Do not redo that cleanup or resurrect old preparation patches.
2. Verify the selected commit exists and the included code/docs match the ledger. Preserve dirty files in all checkouts. Use a managed isolated worktree for shared implementation; use the returned path for every command. Install its own dependencies and build. Reuse recorded verification for unchanged code; rerun affected tests/browser checks when changes, failures or a different source revision justify them. The disposable fixture exercise is already complete and only needs repeating after relevant discovery/lifecycle changes.
3. Agree the smallest shared runtime interfaces required by the approved mechanics. `createRuntime` permits versioned local adapters, but no universal flight/hazard kit exists; the API documents current Nacre and jump/checkpoint limits. Implement reusable flight/landing, zone-response or event hooks once where actually needed. Lanes own their authored route, zones, timing and presentation. Do not have seven agents clone Nacre or independently patch shared physics.
4. Record the common foundation SHA and any shared-extension dependency once in the ledger. Lanes may build independent route/assets while shared support is being implemented; dependent driving checks wait for its verified interface. No speculative all-purpose framework or silent removal of a promised interaction. A lane requests an extension with its concrete behavior, expected state/events and failing or missing case.
5. Test shared changes against affected approved circuits, including the Halcyon opt-in feature when relevant. Use CPU checks, lint/build and coordinated short hidden browser checks; retain the fixture only in ignored scratch if needed. Update the API to actual exports and keep an ordered shared-extension commit/delta manifest. Distribute each extension once, record each lane’s applied revision and recheck affected behavior; never overwrite lane-owned edits. No normal-speed automated full laps.

Do not freeze a new base just to churn documentation. Before first dispatch, use the ledger’s selected foundation. After dispatch, keep that base stable and distribute necessary shared extensions explicitly. Broader mesh/instance extraction is deferred until demonstrated reuse requires it.

## Dispatch and bootstrap

Call `list_projects`, then create one chat for each ledger lane with `create_thread`. A local project chat can bootstrap its **own managed worktree at the exact selected foundation SHA** before any file write. Where user-authorized worktree-mode creation can start at that SHA, that is also suitable. Never silently start from a remote default branch or let a lane edit the primary checkout. Use `codex/` for new branch names; each checkout owns its dependencies and build output.

Resolve free port pairs before dispatch, preserving existing listeners. Record each returned `threadId`/`hostId` or pending `clientThreadId` immediately; never duplicate a chat after an ambiguous result. Pending IDs must be resolved before messaging/waiting tools that require real thread IDs. The ledger provides titles; initial prompts supply the actual foundation SHA, allocated ports and this fresh integrator’s actual thread ID.

### Initial lane prompt template

> You are the sole owner of map <number>, <title>. Before any file write, create/reuse a managed isolated worktree at `<selected foundation SHA>` and verify HEAD matches. Execute `games/vector-nova/docs/expansion/<slug>/HANDOFF.md`, the common EXPANSION_HANDOFF.md and EXPANSION_LEVEL_CONTRACT.md **inside that returned worktree**. Use the live primary launch ledger for coordination, not your frozen copy. Never edit the primary checkout or apply an old preparation patch.
>
> The user authorizes the complete scoped production goal, narrow builder fan-out and one independent critic loop capped at eight rounds, with no early human stop. Follow the brief’s exact interactions, large-asset imagegen-to-Blender workflow and lighting direction. Shared pickup/boost expansion is placement notes only; preserve the experience and report hard unsupported passages. Final human approval remains pending.
>
> Own only `src/levels/<slug>/**`, `assets/levels/<slug>/**`, `public/assets/levels/<slug>/**`, `tools/expansion-<slug>-*.mjs` and `docs/expansion/<slug>/**`. Request shared extensions from this integrator and continue independent owned work while waiting. Make local checkpoint commits; no push or primary merge. Create the full scoped goal without inventing a token budget.
>
> Reserved dev/preview ports: <dev>/<preview>; route `?level=<slug>`, shape `&review=shape`. Report your worktree and ready production build before requesting a preview. The integrator starts/recover servers and grants the exclusive GPU slot; browsers stay hidden, with no videos or real-time full laps. You may message the launching integrator `<actual threadId>`, host `<hostId>`, for setup, shared dependencies, blockers, GPU requests and final results. Do not message old Gate 4 or other level chats. Hand back the package required by the common brief.

After creation, use a compact `wait_threads` snapshot for all seven targets and retain cursors. Confirm each actually bootstrapped. Emit one required created-thread directive per created chat in the launch response. Continue substantive coordination via compact waits; do not repeatedly read transcripts or narrate unchanged polls.

## Servers and GPU coordination

The ledger lists reserved and protected ports. Inspect actual listeners; leave another owner’s servers/checkouts unchanged, and do not restart absent historical servers merely because they once existed. Start the existing npm scripts in the **reported game cwd** with CLI port overrides and Node 22.13+. Preview requires a successful build. Verify listener cwd, HTTP response and served asset hashes against that lane’s dist. Keep final review previews running; development servers need run only while useful.

All GPU-heavy validation is serialized across the host, including browser captures, Blender renders and GPU baking. CPU modeling/generation may proceed independently. Before granting a slot, inspect the coordinator path recorded in the ledger. Honor an existing owner until it reports closure or read-only process evidence confirms release. Mirror the expansion owner into that coordinator while active, preserving unrelated fields, and maintain a FIFO queue in the live ledger. The critic must request a slot too; a ready server, pending call or timeout is not permission or release. Require browser/render process closure before passing the slot. Use bounded batches and leave listening/foreground/device checks honestly unverified.

Do not resume the old two-lane heartbeat. If overnight coordination needs a new thread heartbeat, attach it to this fresh integrator with the actual seven chats, checkout/port ownership, GPU queue and cap policy. Stay quiet on unchanged status, notify only meaningful completion/failure or a user decision, and pause it when the wave reaches handback. Do not change sleep/security settings.

## Combined review and handback

Verify each lane’s owned-path delta and manifest, including new binary assets, against the common foundation plus its recorded shared extensions. Keep packages in a durable ignored location, not only `/tmp`. Assemble one isolated review candidate with shared changes included once and the seven owned deltas. Check all new production/shape entries, distinct identities, effects/asset isolation, combined picker/review UI and affected Halcyon/pickups/Orbital/Nacre behavior. These are integration checks, not another art counter.

For a real integration defect, fix it within the shared/owned boundary and verify the changed build. Do not carry forward unsupported scores, erase failed rounds or invent a ninth polish cycle. Preserve shortcomings at the cap for human judgment. Keep actual future-support coordinates for the later pickup/boost round; remove completed review history only after merge, preserving lasting decisions and asset provenance.

Deliver seven named playable URLs, optionally a combined candidate URL, concise outcomes and unresolved limitations. Final human approvals and primary-branch merges remain the user’s decisions.
