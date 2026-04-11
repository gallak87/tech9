# GRAVELRUN — DevOps Notes

## Local Dev

```bash
cd games/gravelrun
npx serve src
```

Opens on http://localhost:3000 (or whatever port `serve` picks — it'll print it).
Zero install required beyond npx (ships with Node).

## Build

Not decided yet — waiting for QA Phase 4 sign-off. Likely options:
- Inline all JS into index.html for a single-file deploy (simplest for a canvas game)
- `esbuild` bundle if modules get complex

Will update after the game is playable.

## Deploy

Target: GitHub Pages on this repo, `games/gravelrun/` subfolder or a dedicated branch.
Method TBD — will pick between GitHub Actions workflow and manual `gh-pages` branch push
after the game is playable locally. No CDN dependencies will be introduced.
