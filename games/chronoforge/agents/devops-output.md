# DevOps — Chronoforge

## Local dev server

Pure static site, no build step.

```bash
cd games/chronoforge
python3 -m http.server 8765 --directory src
# or
cd games/chronoforge/src && npx --yes serve -l 8765 .
```

Open: http://localhost:8765/

## Localhost verification log

### Phase 0 — passed
- `GET /index.html` → 200
- `GET /game.js` → 200
- `node --check` syntax OK

### Phase 2 — passed
- All 5 modules served: `index.html, game.js, world.js, sprites.js, menu.js, scenes.js` → 200 each
- `GET /assets/<missing>.png` → 404 handled by procedural placeholder system
- `node --check` passes on all 5 modules
- Sprite manifest valid JSON, 151 sprites declared

## GitHub Pages deploy

**Target URL:** https://gallak87.github.io/tech9/chronoforge/

**Pipeline:** GitHub Actions workflow at `.github/workflows/deploy.yml` builds a combined `_site/` directory from every active game's `src/` and deploys to Pages on push to `main`.

**Changes made this phase:**
1. Added `games/chronoforge/src/**` to the workflow's `paths:` trigger so Pages rebuilds when we push chronoforge code.
2. Added `_site/chronoforge/` to the mkdir list and `cp -r games/chronoforge/src/. _site/chronoforge/` to the build step.
3. Added Chronoforge to the README's games table with the live URL.

**Deploy trigger (manual):**
```bash
git add games/chronoforge .github/workflows/deploy.yml README.md
git commit -m "chronoforge: phase 2 — overworld, menu shell, first deploy"
git push origin main
```
GitHub Actions picks up the push and publishes to Pages in ~1-2 minutes. Check progress at https://github.com/gallak87/tech9/actions.

**No GitHub Pages setup required** — already enabled for this repo from prior games.

## Redeploy cadence

Per phase, on QA pass:
- Phase 3 (battle system) → push → auto-deploys
- Phase 4 (base management) → push → auto-deploys
- Phase 5 (progression) → push → auto-deploys
- Phase 6 (release) → tag `v1.0.0` + push → final deploy

## Sprite assets

Sprites are placeholder-only until `/run-art chronoforge` runs. Since assets live under `games/chronoforge/src/assets/` (when generated), they will deploy with the same push trigger — no separate asset pipeline needed.

Make sure any generated PNGs are committed before push, since GH Pages only serves repo contents, not local files.

## Hand-off to QA

- Local URL: http://localhost:8765/
- Live URL (post-push): https://gallak87.github.io/tech9/chronoforge/
- Phase 2 expected behavior: see `agents/qa-output.md`
