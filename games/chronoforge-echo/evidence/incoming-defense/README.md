# Incoming defense regression — 2026-09-17

The reported bug was reproduced on the deployed GitHub Pages game in an isolated Chrome context. Starting New Expedition, reaching the first Rust Scrapper via normal movement, and attacking once left Crew open during the enemy reply, with zero visible timing tracks (`deployed-before.png`). The earlier presentation-polish check exercised the manually selected Defend command; it did not cover incoming enemy attacks.

The repaired production build was then played from a fresh game with `node tests/incoming-defense.browser.mjs` against the local static preview. No fixtures, save injection, timeline stepping, or game-state mutations were used. The test observes the rendered timing window and supplies actual keyboard/mouse input. `report.json` records keyboard critical guard, mouse critical guard after pause/resume, and returning to the same selection after both successful and unattempted guards. The screenshots show the actual first encounter, player attack, incoming guard, and restored selection.

The first local harness attempt read the text before the next render after keypress. Waiting for the rendered response corrected that assertion; it did not require another game change. The live Pages deployment still needs this follow-up commit.
