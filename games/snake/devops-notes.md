# Snake — DevOps Notes

## Stack

Vanilla JS + HTML canvas. No build step, no dependencies, no bundler.

Why: The game is a single canvas with a game loop. A bundler adds zero value here — it's just friction. No `npm install`, no toolchain to break, no `node_modules` to commit or gitignore past. Dev opens `index.html` and it works.

If HMR during dev becomes annoying, drop in Vite later — it's a one-line change to `package.json` and the workflow. The source stays identical.

## Running locally

Open `games/snake/src/index.html` directly in a browser. Because `main.js` uses `type="module"`, you need a local server (browsers block module imports from `file://`).

Quickest options:

```sh
# Python (no install needed)
cd games/snake/src
python3 -m http.server 8080
# → http://localhost:8080

# Node (if you have npx)
npx serve games/snake/src
```

Then open the URL. That's it.

## How deploy works

GitHub Actions workflow: `.github/workflows/deploy-snake.yml`

Triggers on push to `main` when anything under `games/snake/src/` changes (or the workflow file itself). Also has `workflow_dispatch` so you can trigger it manually from the Actions tab.

Steps:
1. Checkout repo
2. Upload `games/snake/src/` as the Pages artifact (no build needed)
3. Deploy to GitHub Pages via the official `actions/deploy-pages` action

The workflow uses OIDC (`id-token: write`) — no PAT required.

## Enabling GitHub Pages (one-time setup)

1. Go to `https://github.com/gallak87/tech9/settings/pages`
2. Under **Source**, select **GitHub Actions**
3. Save. That's it — the next push to main will deploy.

## Live URL

```
https://gallak87.github.io/tech9/
```

> Note: because the workflow uploads only `games/snake/src/` as the artifact, that directory becomes the Pages root. The game will be at the root of the Pages site, not at a subpath. To serve multiple games under one Pages deployment, the workflow should be updated to build a combined `dist/` directory that mirrors the full `games/` structure. That's a one-workflow refactor when there's a second game to ship.
