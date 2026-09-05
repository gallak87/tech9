# Plan — one-button character forge

`Run` in the dev panel → reference, mesh, rig, load → Kaida replaced live in the
running game, no page reload.

Status: not started. Depends on Stages 1–3 in `README.md`.

---

# The problem

A browser cannot run Python or write files. Stages 2 and 3 are Python processes
taking ~15+ minutes. The button therefore needs a local service, a job that
outlives the request, and a way to push the result into a running scene.

---

# Architecture

## Transport — Vite plugin, not a second daemon

`vite.config.js` currently exports a plain object. Convert to a plugin with a
`configureServer` hook.

Same origin (no CORS), no second port to manage, and it cannot ship to
production because it lives in the dev server config.

| Endpoint | Purpose |
|---|---|
| `POST /api/forge/run` | start a job, returns `jobId` |
| `GET  /api/forge/events?job=<id>` | SSE progress stream |
| `GET  /api/forge/status` | current job — lets the panel reconnect after a page reload |
| `POST /api/forge/cancel` | kill the child process group |

SSE over polling: one-way, plain text, native `EventSource`, no dependency.

## Job runner — detached, file-backed

Spawn **detached** (`detached: true`, `unref()`). Write
`docs/phase2/.forge/<jobId>.json` on every state change.

Not optional: the dev server was killed by system memory pressure during this
project. A job tied to the parent process dies with it. File-backed state also
means the SSE stream is a tail, so any number of tabs can watch one run.

`.forge/` goes in `.gitignore`.

## Stage contract

Each stage is an `.mjs` module:

```js
export default {
  name: 'mesh',
  inputs:  ['ref/kaida-painterly.png'],
  outputs: ['out/kaida.glb'],
  async run(ctx) { ctx.progress(0.4, 'texture pass 3/6'); }
}
```

| Stage | Runs | Duration | Output |
|---|---|---|---|
| `ref` | `ref-gen.mjs` via Ollama | ~70 s | `ref/kaida-painterly.png` |
| `mesh` | Hunyuan3D-2.1-mlx INT8, py3.10 venv | ~15 min | `out/kaida.glb` |
| `rig` | UniRig, py3.10 venv | TBD | `out/kaida-rigged.glb` |
| `load` | in-process | <1 s | `assets/kaida.glb` + bone manifest |

## Why Python at all

Ollama serves GGUF language and vision models. Hunyuan3D and UniRig are
PyTorch/MLX pipelines — no Ollama model emits a mesh, and no JS one exists.
Python is a binary the runner spawns, not a second language in the codebase;
`tools/sprite-gen.js` already shells out to `sips` the same way.

**Preferred: wrap `mesh` in a local HTTP server**, so node calls it exactly like
it calls Ollama:

```
POST localhost:11500/mesh   { image: <base64>, precision: 'int8' }  →  glb
```

Two wins. Stage 2 becomes the same shape as stage 1 from node's side, and the
model stays resident between characters instead of reloading ~6 GB per run.

Trade-off on a 16 GB box: a resident model competes with Vite and Chrome. Load
on demand, unload after an idle timeout.

**Stages skip when the output exists and the input hash matches.** Hash =
sha256(input bytes + stage config). Without this, a failure in `rig` costs a
15-minute re-mesh on every retry.

## Live swap — Vite HMR custom event

`load` writes the glb, then:

```js
server.ws.send({ type: 'custom', event: 'forge:character', data: { url, bones } })
```

Client listens via `import.meta.hot.on('forge:character', …)`, disposes the old
`SkinnedMesh`, loads the new glb, re-applies the bone map. This is the part that
makes her *appear* rather than requiring a reload.

---

# Dev panel wiring

Group `forge`. Registered from the actors lane via `ctx.dev.register` —
**`src/core/devpanel.js` is INTEGRATOR ONLY and is not edited by this work.**

| Control | Type | Notes |
|---|---|---|
| `Run` | `button` | `action` → POST `/api/forge/run` |
| `Stage` | `readout` | current stage name |
| `Progress` | `readout` | percent + elapsed |
| `Cancel` | `button` | POST `/api/forge/cancel` |

Three devpanel behaviours that bite:

- **Progress must be a `readout`, never a `toggle`.** Toggles `sync()` on click
  only, never per frame, so anything the pipeline changes on its own is
  misreported.
- **`register()` rejects a falsy `label`.** A control added purely for its side
  effect still needs one.
- **Never add a class to `#dawn-dev`.** `update()` starts
  `if (root.className) return` and silently stops all readouts.

Note the existing `devpanel-no-group-filter` stopgap: `?dev=2` hides other
lanes' groups by setting `display` on `.grp` divs from `traversal/index.js`. A
new `forge` group must be added to that list or it leaks into look mode.

---

# Build order

Each milestone is independently useful and testable. Do not build the plumbing
against a 20-minute feedback loop.

| | Milestone | Proves |
|---|---|---|
| **M1** | Stage 3 loader alone — glb dropped by hand, no button | Does a generated mesh survive the bone map, the clips, and ground IK? Highest information, zero pipeline. |
| **M2** | Plugin + job runner + SSE + panel, wired to `ref` **only** | The whole seam, on a 70-second loop. |
| **M3** | Add `mesh` stage | Hunyuan3D under a job runner that already works. |
| **M4** | Add `rig` stage + HMR hot-swap | Full button. |

M1 is the one that can invalidate everything downstream — if auto-rigged weights
collapse at the shoulder, the pipeline is not worth automating. Do it first.

---

# Risks

| Risk | Mitigation |
|---|---|
| **Memory.** Hunyuan INT8 ~6 GB + Vite + Chrome + three.js on a 16 GB box. The dev server has already been killed once by memory pressure. | Detached job survives it. Consider pausing rendering while `mesh` runs. |
| Python 3.10 venv vs system 3.14 | Pin the venv path in stage config; fail loudly if missing. |
| UniRig components released progressively | M4 last. If `rig` is unavailable, Mixamo's free auto-rigger is a manual fallback that still feeds `load`. |
| 20-minute runs | Cancel must kill the process *group*, not just the child. Resume via stage skipping. |
| Job IDs | Counter + timestamp. No `Math.random()` — `tools/lintrng.mjs` bans it, and determinism is a project value. |

---

# Files

```
vite.config.js                          modified — becomes a plugin
docs/phase2/forge/plugin.mjs            configureServer, routes, SSE, HMR push
docs/phase2/forge/runner.mjs            detached spawn, job file, stage skipping
docs/phase2/forge/stages/{ref,mesh,rig,load}.mjs
docs/phase2/.forge/                     job state — gitignored
src/actors/forge-panel.js               dev.register calls
src/actors/rig.js                       modified — GLTF branch behind a flag
```
