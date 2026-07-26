# tech9 — Godot Roadmap

Follow-ups specific to the Godot tier. Split out from `ROADMAP.md` because this is a distinct
workstream with its own pickup point.

**Reference implementation: `games/duneglide/`.** Everything below has a working example there
— read its `ROADMAP.md` and `LESSONS.md` before starting any item. void-fracture is a second,
earlier example (on-rails, simpler).

**Current state:** `rendering_tier: godot` works end to end at the scaffolder level. Schema,
Director, scaffolder, three roles, stack template and `capabilities/godot-mcp.md` all landed.
Verified by scaffolding a throwaway Godot game, launching it, confirming the MCP autoload and
Forward+ through the bridge, screenshotting it, and deleting it.

---

## 1. Promote `mcp_interaction_server.gd` out of duneglide

**Why it matters:** `tools/scaffold.js` copies the bridge from
`games/duneglide/mcp_interaction_server.gd` as a donor. That makes a framework capability
depend on a game directory. If duneglide is moved, renamed or deleted, every new Godot scaffold
loses the bridge — and the bridge is a hard dependency, not a nice-to-have.

Currently it warns rather than failing silently, so this degrades loudly, but it should not be
a game's job to host it.

- Move the canonical copy to `tools/godot/mcp_interaction_server.gd`
- Point `tools/scaffold.js` at it (search for `GODOT_ROLES` / the donor path)
- Leave the game copies alone — they are per-project runtime files and should stay checked in
- Note the port is parameterised (`--mcp-port=N` / `GODOT_MCP_PORT` / 9090 default) so two
  games can run side by side; keep that when moving it

Low risk, ~15 minutes. Do it before the second Godot game exists.

---

## 2. Run `/generate` on a real Godot game

**The path has never been exercised by actual agents.** The smoke test proved the scaffolder
emits a launchable project; it proved nothing about whether an agent given
`agents/godot_dev.md` can build a game with it.

Expect the first real run to surface: prompt-template gaps, phase plans that assume a web dev
server, agents that skip the bridge verification step, and QA not knowing how to test a 3D
build. Treat the first run as a framework test with a game as the by-product.

Good candidates: rebuild duneglide from scratch to compare against the hand-built reference
(a genuine A/B on the framework), or a fresh 3D concept.

Phase 0 must prove the bridge before any content phase — launch, screenshot, read draw calls.
The Director is instructed to plan it this way; verify it actually does.

---

## 3. `mcp:check` should emit `--json`

`tools/probe.js` supports `--json` and `/generate` parses it. `npm run mcp:check`
(`tools/setup-godot-mcp.js --check`) only prints prose, so the capability probe in
`/generate` has to be read by eye.

Add `--json` to `tools/setup-godot-mcp.js` emitting at least
`{ "godot_mcp": { "available": bool, "godot_path": str, "server_dir": str, "reason": str } }`,
then have `tools/scaffold.js` fold it into the same `capabilities` object it already builds
from `probe.js`. That makes the Director's "is the godot tier available" gate mechanical
rather than judgement.

---

## 4. Dev tool contract has no Godot half

`tools/dev-tool-contract.md` is written for web games — `window.__DEV_TOOLS__`, mounted during
art generation, stripped at ship. The `godot_tools` role points at it as a required input, so
it currently reads a contract that does not describe its own platform.

Needs a Godot section covering what duneglide actually landed on:

- Overlay on a dedicated key, `PROCESS_MODE_ALWAYS` so it survives pause
- Knobs bind only while the overlay is open, so they never steal keys from gameplay input
- Overlay is a **view** — knobs drive the owning script's exported vars, defaults stay in the
  scripts
- Cheap vs expensive knobs: shader uniforms are free, anything baked into vertex positions
  costs a mesh rebuild and must never be driven per frame
- Freeze + orbit inspection camera, and marking it temporary with a deletion condition
- Parity/invariant harness for anything computed on both CPU and GPU

---

## 5. No manifest → codegen pipeline for Godot

`meta/LESSONS.md`'s first lesson is the manifest → codegen → module pattern
(`*-manifest.json` → `tools/*-gen.js` → module) that keeps AI iterating in the design domain
rather than hand-editing imperative geometry. The Three.js games use it. **Neither Godot game
does** — duneglide's geometry is hand-written GDScript builders.

Worth deciding whether the pattern should extend to Godot (a `geo-manifest.json` →
`ArrayMesh` builder generator) or whether GDScript builders are close enough to the design
domain already. duneglide's `BlockChunkMesh.gd` is a reasonable test case: it is parameterised
enough that a manifest might add little.

Not obviously worth doing — flagging it so the decision is deliberate rather than an omission.

---

## 6. Ship story is unresolved

Godot exports to HTML5, but web export of a Forward+ 3D game is a real task with its own
constraints, not a free step at the end. Until that is solved:

- Godot games cannot appear in the README's playable Games table
- "Playable" means the Godot binary running the project locally
- `release` / `devops` roles have nothing to do on a Godot game

Decide whether Godot games ship to the web at all, or whether they are desktop-only artifacts
of this studio. That answer changes what those two roles should do — currently they would be
active with no meaningful output.

---

## 7. Lesson graduation needs a second Godot game

`meta/LESSONS.md`'s rule is that a lesson graduates into framework defaults once it proves
durable across 2+ games. The Godot/3D section is currently sourced from duneglide alone, so
strictly it is all still provisional.

The higher-confidence ones — TAA ban, `custom_aabb` on displaced geometry, shared clipmap
snap, verify-with-numbers-before-pictures — were already patched into the stack template and
capability doc rather than left in LESSONS. Re-check them against the second Godot game and
demote anything that turns out to be duneglide-specific.

---

## Related, tracked elsewhere

- **Engine / assets / gameplay separation** — `ROADMAP.md` item 4. The big one. duneglide's
  terrain, glide controller, chase camera and dev overlay are all game-agnostic already and
  are the natural extraction candidates.
