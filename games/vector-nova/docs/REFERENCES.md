# Bounded survey / provenance

Gameplay/art references were techniques only; no game implementation, assets or framework code copied. Gate 2 explicitly adapts Echo’s ESLint/Prettier/lint-staged/Husky configuration at user request, into locally owned tooling. Reference licensing not established, so independent implementation instead of copying. No runtime dependencies outside this application.

- `games/vulpine/src/render/geobuild.js`, `src/ships/ship-materials.js`, `src/ships/arwing.js`: lofted stations, differentiated material response, panels/canopy/rear engineering. New compact racing silhouette, no aircraft/runtime transplant.
- `games/chronoforge-echo/src/ui-session.js`, `mobile-lifecycle.js`, `touch-input.js`, `viewport.js`: input ownership, release-on-hide, pointer lifecycle and viewport handling. Own racing input and semantic menus. Reference never launched/modified.
- `_tech9/baselines/web-3d-world/src/core/SceneApp.js`: renderer lifecycle/settings/resource disposal; own small runtime, no SceneApp/registries/tooling.
- `_tech9/modules/weather/src/materials.js`: material response; full weather deferred.
- `_tech9/modules/landscape/src/AtmospherePass.js`: depth/fog; standard distance fog and layered skyline for staging. No forest content or heightfield queries; oriented racing frames replace them.

Third-party: Three.js MIT, Vite MIT, Playwright Apache-2.0. Retain installed package licences and release notices. API sources: https://threejs.org/docs/pages/WebGLRenderer.html and https://threejs.org/manual/pages/color-management.html.

Gate 2 graphics APIs checked against installed Three.js source and official https://threejs.org/docs/pages/GTAOPass.html and https://threejs.org/docs/pages/EffectComposer.html. GTAO source remains a Three.js dependency under its retained MIT notice. No reference imagery is bundled.
