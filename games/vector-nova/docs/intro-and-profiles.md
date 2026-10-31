# Title and career slots

Normal startup shows the moving graphite/red backdrop, a fading, rotating Kestrel and a centered wordmark with a centered **Start** button. The title stays until Start is activated by click/tap, Enter/Space or controller A; it never advances automatically. The five-second Kestrel reveal is visual timing, not a navigation timer. Reduced motion keeps the ship, background and wordmark still.

## Entry navigation

**Careers, Settings and Tunes** become available after Start, before choosing a career. No tabs are shown on the title itself. The three career buttons are compact vertical rows at every viewport size. Empty rows create a fresh career; occupied rows show saved rewards, wins, cup progress and a Continue action. The active career keeps a red left accent, with the same treatment on hover/focus. Page tabs retain their red bottom underline; Tunes expands the existing floating player over the current page, without changing the selected page. There is no Replay intro control.

Choosing a career briefly fades into the existing Race menu. Its **Career** tab manages that selected career, with **Switch career**, export, import and previous-backup actions at the top. Switching returns to the picker with current progress visible. Settings and soundtrack controls remain global.

The title and menu use the same backdrop canvas. One music player lives outside the replaceable page host and is visible from startup, so playback can be paused before Start and audio survives page and career changes. Tunes expands that player over the current screen; Escape/controller B collapses it and returns focus to its opener. Each application launch starts **Blue Hour**, rather than restoring the previous song. Song choice is never persisted; any existing saved `song` property is removed. Volume, repeat, shuffle and collapsed preferences remain shared. Browsers that block autoplay retry on the first interaction; explicit Pause is respected.

## Storage contract

[src/progression/careers.js](../src/progression/careers.js) owns a strict three-slot registry, `vector-nova.careers.v1`, and stable localStorage-compatible adapters. Each slot's data is prefixed under that registry's namespace; adapter `key()` and `length` expose only that slot's logical keys. Every adapter has `isolated: true` to keep Time Trial fallback memory separate.

Each career owns:

- Profile progress, rewards, ship enhancements and equipment/loadouts.
- Active cup and earned trophies.
- Time Trial records and ghosts.
- Save-import backup.
- Chosen ship and circuit.

Graphics, controller preferences and music preferences are shared. Creating a career writes its fresh profile and registry atomically; failed writes roll back without activating a partial career. Unreadable storage is reported as unavailable rather than shown as an empty career.

The format is fresh: unscoped prototype saves are not read or migrated. Profile validation accepts only the current career version. Save imports require the complete current profile/cup/trophy/record payload, and cup saves require their actual run identity. Import/export affects only the selected career; another slot's ghosts and backups are never enumerated or replaced.

## Ownership and switching

[entry.js](../src/frontend/entry.js) chooses the slot before creating the frontend. [createFrontend](../src/frontend/index.js) receives that exact storage adapter for all stores, record readers, runtime trial persistence and ship/circuit selection.

Switching awaits frontend disposal: pending loads and inspectors are aborted, generation tokens invalidate old callbacks, retained worlds stop, and cache cleanup completes before another frontend starts. Launch-specific URL parameters are cleared so the previous career's route or developer setup cannot override the next career. The shared music player and backdrop survive this handoff.

`?intro=0` explicitly opens the active career directly when one exists, or the picker otherwise. Ordinary level links still show the manual Start screen before career selection. `?intro=1` shows the title. Developer, inspection, art, test and capture entries stay immediate; without an active career they use isolated transient storage. `dev=1` copies its supplied career into memory, while `dev=2` remains synthetic. Desktop editions use normal startup and ignore browser query overrides.

## Verification and trailer

Use the [entry verifier](../tools/entry-verify.mjs) for real creation/switching/import/reload, isolated progress/records/loadouts, global entry controls, controller safety and responsive touch layouts. [careers.test.js](../src/progression/careers.test.js) covers storage and ghost-cache isolation, filtered enumeration, atomic creation and failure handling. [music-startup-verify.mjs](../tools/music-startup-verify.mjs) covers Blue Hour startup, preference cleanup, actual playback and autoplay rejection/retry.

The movie still uses five seconds of the real title, then **0.7 seconds of black**, then Glasswake. The black interval is an editorial beat, not part of the game's career transition. Re-record after this UI and the remaining gameplay fixes are reviewed; keep RC1 frozen. Follow the [working script](../marketing/script.md) and [recording TODOs](../marketing/TODO.md).
