# Chronforge Echo architecture

A standalone Vite application using JavaScript modules and PixiJS to present a 1920×1080 artwork surface over a fixed 960×540 logical view. HTML supplies accessible text and controls. All simulation deltas are seconds and positions are logical world units. Source resolution does not change gameplay scale.

## State and simulation

`progression.js` owns state creation and progression mutations; `content.js` owns hero, enemy, item, skill and building catalogs. Effective stats are computed rather than cached into saves. `narrative.js` owns story conditions, dialogue, objectives and event rewards. Unique ledgers prevent repeat quest, pickup and first-clear rewards.

`main.js` integrates input, the clamped simulation clock, world travel, combat and UI. Menus, dialogue, vendors, construction and cinematic playback pause simulation. Audio uses its own clock. Followers sample the traversed path and compress safely near doors rather than chasing through solids.

`world.js` owns scene geometry, interaction locations, terrain and shared requirements. Actor positions are foot anchors. Visual extents, grounded collision footprints and interaction ranges are separate. Roads, door approaches and passages through arches must remain reachable. Click navigation and keyboard movement use the same collision predicate; the path search includes the exact requested endpoint when its final segment is clear.

## Combat

`combat.js` owns the ATB clock, readiness queue, action timeline, seeded outcome RNG and battle result. Costs, HP and timing resolve once at contact. Rendering derives poses and effects from the same timeline and cannot advance gauges or award rewards. The integrator consumes the battle result once.

`battle-ui.js` renders folding commands from `battleView`; canvas rendering owns the arena, actors and effects. Mouse and keyboard submit the same intents. Enter/Space/Right confirm; Left/Backspace cancel; Tab selects a ready hero. Escape belongs to the global pause menu, which stops `updateBattle`.

Timing accepts one fresh keydown per action; the execute press cannot double as a timing attempt. Damaging enemy actions can offer an incoming guard window, while charge-only telegraphs do not. Timed incoming guard applies only to that attack and uses the stronger defense rather than multiplying guard reductions. Enemy recovery restores the previous command selection when it remains valid.

## Rendering and assets

`assets.js` validates required source dimensions and measured frame bounds before readiness. Missing required art produces a visible load failure. Art sources are loaded locally; runtime has no image-generation dependency. `rendering.js` owns backing scale, filtered contexts and logical pattern sizing.

Ground chunks cover 384×384 world units using 768×768 backing pixels; the 40-chunk cache occupies at most 90 MiB. Source atlases are accounted for separately. Extraction and mask canvases retain source resolution. `drawForeground` redraws props in front of actors and dims foliage where it covers the party. Art rendering has no gameplay mutations.

Regional town metadata selects exteriors and restoration kits by actual Town Center level. Interior layout and collision geometry remain stable across art levels. `construction.js` applies and checkpoints an upgrade before `upgrade-tour.js` plays it. `upgrade-cinematic.js` provides timing, framing and detached render snapshots. Completion, skip and reset release canvas buffers; skipping never repeats payment or undoes the upgrade.

## Persistence and development tools

`persistence.js` validates versioned state and manages three manual slots plus an automatic checkpoint. Browser storage uses the Echo namespace, separate from the original game. Import validates before replacing a slot. Load/restart clears held input and transient travel/presentation state without changing other saved records.

Ending progress distinguishes the final boss victory, pending dialogue, ending panel and completed homecoming. The saved dialogue index/panel resumes after load. Completion and future eligibility are granted only by the final return action. Dismissing ordinary dialogue must not fire its completion callback or overwrite ending progress.

Dev tools require both a development build and a loopback host. Art previews, world overview and menu map reveal are presentation state. World jumps use a detached expedition; saves continue to store the original expedition until the preview ends. Closing the dev panel is independent of returning from a temporary world trip.

Test hooks require a Vite development build and `?test=1`. Production excludes presets and dev controls. `window.__ECHO_READY__` signals that required content is loaded; `__ECHO__.snapshot()` reads actual state and renderer metrics.

## Checks and artifacts

`npm test` runs pure Node regression tests. `npm run build` and `npm run verify:build` check production packaging, required art and deployment paths. Browser scripts exercise input and integration when explicitly run against the appropriate server.

Review scripts share a checkout-specific OS temporary directory via `scripts/review-output.mjs`. Campaign replay writes fresh snapshots there for dependent checks. `npm run clean:review` removes the output. Screenshots, reports, saves used as review fixtures, generated inventories and retired art are not repository records.

Performance targets are 60 fps, p95 frame interval at most 20 ms and transition preparation under 250 ms. Record the actual environment when measuring; targets are not claims of measured performance.
