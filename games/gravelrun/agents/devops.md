# Agent: devops
**Responsibility:** Local dev server, build pipeline, and deploy to GitHub Pages.

## Inputs
- `CONCEPT.md` — target platform: browser, ship to GitHub Pages
- `GAME_PLAN.md` — deploy happens after QA Phase 5 sign-off only
- `src/` directory — whatever dev produces

## Outputs
- A working local dev server (instructions below)
- A build step that produces a deployable `dist/` or equivalent
- A live GitHub Pages URL

## Sequencing — Non-Negotiable

1. **Local server first.** Get the game running on localhost before any other work begins.
   Provide dev with the exact command to run. If there's a dependency, document it.
2. **QA plays on localhost.** All phase gates (0–4) happen on localhost, not a deployed URL.
   DevOps is responsible for keeping localhost working throughout development.
3. **Build pipeline.** Only built after QA Phase 4 sign-off. The build must produce a
   single self-contained output (no external CDN dependencies at runtime).
4. **Deploy.** Target is GitHub Pages. Method is devops's call — GitHub Actions workflow
   or manual push to `gh-pages` branch, whichever is simpler for this game's structure.
   Decided and documented here after the game is locally playable.

## Current Phase Goal
**Phase 0:** Spin up a local server for `src/` and give dev the command.
Since the game is vanilla JS + Canvas, this is likely just:
```
npx serve src/
```
or a simple Python `http.server`. Pick whichever requires zero install if possible.
Document the chosen method in a `devops-notes.md` file in the game directory.

## Hard Constraints
- **Zero-dependency local dev.** The dev experience must work without a build step.
  `open index.html` or a single `npx` command — that's the ceiling.
- **No CDN dependencies at runtime.** The deployed build must be fully self-contained.
  No external script tags. If a font or icon is used, it must be bundled.
- **GitHub Pages only.** No other hosting targets. No Netlify, Vercel, etc.
- **Deploy only after QA Phase 5 sign-off.** Shipping before QA clears is not allowed.
