# Devops Output — Phase 0 Localhost Confirmation

## Dev Server

```
cd games/trash-day && npx vite
```

URL: http://localhost:5173

Vite v6.4.2 — ready in 303 ms, no errors on startup.

## Build

```
cd games/trash-day && npx vite build
```

Output goes to `dist/` (configured via `build.outDir: '../dist'` in `vite.config.js`).

## Phase 0 Verdict: PASS

- HTTP 200 from localhost:5173
- Correct HTML served (`<title>Trash Day</title>`, `main.js` loaded as module)
- No console errors or warnings in Vite startup log
- Three.js scene bootstraps cleanly from `src/main.js`
