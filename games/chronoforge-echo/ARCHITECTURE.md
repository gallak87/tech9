# Chronforge Echo architecture

A standalone Vite application using JavaScript modules and PixiJS to present a 1920×1080 artwork surface over a fixed 960×540 logical view. HTML supplies accessible text and controls. All simulation deltas are seconds and positions are logical world units. Source resolution does not change gameplay scale.

## State and simulation

`progression.js` owns state creation and progression mutations; `content.js` owns hero, enemy, item, skill and building catalogs. Effective stats are computed rather than cached into saves. `narrative.js` owns story conditions, dialogue, objectives and event rewards. Unique ledgers prevent repeat quest, pickup and first-clear rewards.

`equipment.js` owns weapon compatibility and the four-tier upgrade paths: Kaida uses swords, Vex staves, and Rune gauntlets. Armor and accessories remain shared. Equip mutations enforce the same compatibility used by Inventory and shop comparisons. Inventory's optional hero filter is separate from Party/shop selection; without a hero filter, weapons target their eligible recruited owner and shared items require a recipient.

Each town has two retail services: smiths sell weapons and armor; provisions sell accessories and consumables. `REGIONAL_SHOP_TIERS` in `content.js` assigns Haventide, Emberline, Orbital Reach, and Last Crown to equipment tiers 1–4 respectively. `serviceStock()` selects that exact local equipment tier and carries lower-tier consumables forward, while respecting the current civilization tier. Each card owns its quantity and inline Buy/Sell confirmation; payment rechecks vendor, state, region, stock, quantity, price and balance. Both shops buy sellable items from the pack. Weapon comparisons use the eligible hero automatically; armor and accessory sections have their own comparison controls. Archivists provide research only. Artificer counters are inactive, with their existing stations, identities, and layouts retained for a future role.

Successful purchases and sales call the existing game checkpoint after updating both inventory and ore; canceled or rejected trades do not save. Dev world previews retain their existing isolated save source. Sell All quotes the entire unequipped stack of one item, including stacks above the 99-item purchase limit, and uses the same confirmation checks. `sellPrice()` supplies both the displayed quote and payment: equipment returns 45/50/55/60 percent of base price at tiers 1–4, rounded down per item; consumables remain at 45 percent. Equipped copies and unique keepsakes cannot be sold.

`ui-notifications.js` owns transient dialog results independently of scrolling content. Successes expire without rerendering; errors persist until dismissed, replaced or their panel is left. Repeated results replace the current toast. Service, building and tier feedback suppresses duplicate reward notices; training includes level-ups in its result. Inventory retains its reserved status area, and combat keeps its own feedback system. Service prices and disabled building actions use `restCost()` and `buildingEligibility()` from progression, so presentation and payment agree. Save confirmations remain explicit; rebinding replaces the existing key label in place.

`main.js` integrates input, the clamped simulation clock, combat and UI. `world-traversal.js` owns click routing, movement, followers, camera positioning and travel timing; the integrator fires visit events and saves once arrival completes. Both use the same live Game state. Menus, dialogue, vendors, construction, world view and cinematic playback pause simulation. Audio uses its own clock. Followers sample the traversed path and compress safely near doors rather than chasing through solids.

`world.js` owns scene geometry, interaction locations, terrain and shared requirements. Actor positions are foot anchors. Visual extents, grounded collision footprints and interaction ranges are separate. Roads, door approaches and passages through arches must remain reachable. Click navigation and keyboard movement use the same collision predicate; the path search includes the exact requested endpoint when its final segment is clear.

`encounter-contact.js` owns the ground oval, contact padding and swept movement check. `enemy-labels.js` draws those ovals, while `enemy-levels.js` selects the strongest visible fighter for the sprite, single-line badge and danger relative to Kaida. Unmet prerequisites, cleared encounters and post-battle protection prevent contact; sentries use the same contact rules as other enemies. Only cleared repeatable encounters appear in the manual interaction list. Changes to contact or patrol movement must keep the indicator and trigger aligned.

## Combat

`combat.js` owns the ATB clock, readiness queue, action timeline, seeded outcome RNG and battle result. Costs, HP and timing resolve once at contact. Rendering derives poses and effects from the same timeline and cannot advance gauges or award rewards. The integrator consumes the battle result once.

`battle-ui.js` renders folding commands from `battleView`; canvas rendering owns the arena, actors and effects. Mouse and keyboard submit the same intents. Enter/Space/Right confirm; Left/Backspace cancel; Tab selects a ready hero. Escape belongs to the global pause menu, which stops `updateBattle`.

Timing accepts one fresh keydown per action; the execute press cannot double as a timing attempt. Damaging enemy actions can offer an incoming guard window, while charge-only telegraphs do not. Timed incoming guard applies only to that attack and uses the stronger defense rather than multiplying guard reductions. Enemy recovery restores the previous command selection when it remains valid.

## Rendering and assets

`assets.js` validates required source dimensions and measured frame bounds before readiness. Missing required art produces a visible load failure. Art sources are loaded locally; runtime has no image-generation dependency. `rendering.js` owns backing scale, filtered contexts and logical pattern sizing.

Ground chunks cover 384×384 world units using 768×768 backing pixels; the 40-chunk cache occupies at most 90 MiB. Source atlases are accounted for separately. Extraction and mask canvases retain source resolution. `drawForeground` redraws props in front of actors and dims foliage where it covers the party. Art rendering has no gameplay mutations.

Regional town metadata selects exteriors and restoration kits by actual Town Center level. Interior layout and collision geometry remain stable across art levels. `construction.js` applies and checkpoints an upgrade before `upgrade-tour.js` plays it. `upgrade-cinematic.js` provides timing, framing and detached render snapshots. Completion, skip and reset release canvas buffers; skipping never repeats payment or undoes the upgrade.

`world-view.js` is a shared production overview, opened by the field button, R or dev tools. It composes the current scene with the normal renderer into a bounded in-memory canvas, pauses simulation, and releases buffers on close/reset. `world-view-fog.js` reads the existing survey and feathers fog inward from explored boundaries; the dev button can request a full reveal. Camera, fog and save state remain unchanged.

## Persistence and development tools

`persistence.js` validates versioned state and manages three manual slots plus an automatic checkpoint. Browser storage uses the Echo namespace, separate from the original game. `save-transfer.js` owns file dialogs, confirmation setup and cancellation of pending imports; `UI.resetSession()` clears presentation state. Import validates before replacing a slot. Load/restart clears held input and transient travel/presentation state without changing other saved records.

The temporary `legacy-weapon-migration.js` bridge upgrades saves without `equipmentRevision: 1`. Stable item IDs and pack quantities remain intact; incompatible equipped weapons become the wearer's canonical weapon of the same tier. Suspended battles refresh derived hero stats and revised Rune technique data while preserving action timing, paid costs and encounter progress. Load writes the upgraded record back to its slot with its original timestamp; imports and exports use the same conversion. Current-revision saves reject incompatible equipped weapons. Remove the bridge and its legacy-load writeback after the compatibility window; retain equipment validation.

Ending progress distinguishes the final boss victory, pending dialogue, ending panel and completed homecoming. The saved dialogue index/panel resumes after load. Completion and future eligibility are granted only by the final return action. Dismissing ordinary dialogue must not fire its completion callback or overwrite ending progress.

Dev tools require both a development build and a loopback host. Art previews and menu map reveal are presentation state. World jumps use a detached expedition; saves continue to store the original expedition until the preview ends. Closing the dev panel is independent of returning from a temporary world trip.

Test hooks require a Vite development build and `?test=1`. Production excludes presets and dev controls. `window.__ECHO_READY__` signals that required content is loaded; `__ECHO__.snapshot()` reads actual state and renderer metrics.

## Checks and artifacts

Follow [AGENTS.md](AGENTS.md): do not run the game, start its servers, or execute browser checks without an explicit user request. Do not run linting or formatting during development; the pre-commit hook handles staged files automatically.

`npm test` runs pure Node regression tests. `npm run build` and `npm run verify:build` check production packaging, required art and deployment paths. Browser scripts exercise input and integration only when the user explicitly requests them.

Disposable experiments, scripts and artifacts live only in the Git-ignored `.experiments/` directory. Review tools write to `.experiments/output/` via `scripts/review-output.mjs`; `npm run clean:review` removes that output. Required source, assets, build tooling and regression tests stay outside this folder. Optional campaign checks regenerate their shared snapshots before use. Deleting all of `.experiments/` is safe; never make production or required tests depend on its contents.

Performance targets are 60 fps, p95 frame interval at most 20 ms and transition preparation under 250 ms. Record the actual environment when measuring; targets are not claims of measured performance.
