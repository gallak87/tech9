# Minimal three web package

A standalone Vite package with local dependencies, a responsive renderer surface and a small real-input movement sample. No authored world or required modules.

With Node `^22.13.0 || >=24.0.0`, run `npm ci`, then `npm run dev` (port 4410). `npm run build` produces `dist/`; `npm run preview` serves it on 4411. Fork commands set the new package's ports.

Use WASD/arrows or drag the scene with a pointer; Reset/R centers the sample. Focus loss clears held input. The package owns its renderer, frame loop and listeners; `dispose()` releases them on page exit and Vite replacement. Replace this demonstration in `src/main.js` with the game's composition. Keep the explicit `tech9.runtime`, `tech9.renderer` and `tech9.modules` contract in `package.json` when adopting module copies.

This is a web scaffold, not native-engine support. It has no game rules, audio, saves or asset pipeline. The framework's generation checks build and exercise all three minimal web renderers.
