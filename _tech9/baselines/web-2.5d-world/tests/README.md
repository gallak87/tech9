# Coastal starting-package checks

Run `npm test`, `npm run lint`, `npm run build`, then `npm run verify` in this package. Canonical capability tests run with the framework checks; package tests validate authored composition and browser integration.

The browser harness launches one strict-port Vite child and one Chromium, closes both in `finally`, and keeps reports/captures under `.artifacts/verification/`. `COAST_PORT` and `CHROMIUM_PATH` override the defaults. Serialize GPU runs with other games. Rendering evidence records Chromium/GPU, viewport, pixel budget, actual frame timing and test limits. Desktop and emulated touch/rotation coverage do not establish physical mobile performance.

Normal gameplay checks use keyboard, mouse, touch and DOM buttons. Development-only hooks inspect real state and set up rare occlusion/disposal cases. Production subpath checks verify assets and absence of test globals. No Echo game execution is required.
