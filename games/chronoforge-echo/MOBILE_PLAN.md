# Mobile play plan

Status: implemented, 2026-09-22. Automated browser spot checks pass; physical-phone acceptance remains with the player.

## Implemented and checked

- Joystick movement, proportional speed, independent pointer ownership, double-tap/button Run, optional ground taps, handedness and control sizing. Device preferences live outside expedition saves.
- Adaptive portrait/landscape world view, optional wider portrait camera, mobile backing-resolution budgets, and a separate one-card battle layout with visible crew readiness and fresh Strike/Guard input.
- Touch menus, shops, restoration, conversations, saves and map pan/zoom; explicit Return/Leave controls. Background pause requires Resume. Renderer loss offers checkpoint recovery through reload.
- First phone boot offers Full atlas or Mobile on demand (pilot). Desktop retains full loading; resizing or enabling touch never changes loading policy. Mobile prepares regional bundles, bounds concurrent work, prefetches one nearby route, retains sources through failures, and evicts unused resources. Retry/Return and session cancellation are implemented.
- Departure snapshots remain authoritative until arrival events and their checkpoint finish. Cold loads prepare saved regions and suspended battles before swapping the expedition.
- Validation: 358 pure Node tests; headless Chromium touch checks at 320px/390px phone widths, landscape and tablet dimensions; all seven menu tabs, battle selection/target/Execute/Strike, all eight regions plus town/cave crossings, failure Return/Retry, a cold saved final-boss load, and simulated background pause/resume. Desktop full loading and production boot/Inventory pass at both `/` and `/tech9/chronoforge-echo/`; all 189 required deployment files resolve.
- In the local Chromium probe, initial mobile preparation loaded 96 of 177 sources. Tracked retained source/derived pixels were about 266 MiB, versus about 797 MiB for desktop full loading. These are accounting estimates, not total browser/GPU/process memory or phone measurements. Cached local doors took about 0.60–0.86 seconds wall time; cold regional crossings took about 1.04–1.71 seconds, including preparation and the unchanged 0.55-second fade. The 320 MiB cache target is soft while current and pending destinations are pinned.

The remaining review is real iPhone/Safari and Android/Chrome feel, browser bars/safe areas, actual file picker/download behavior, and sustained memory/frame pacing/heat. Mobile loading stays optional. Further runtime-image downsizing, native packaging and a forced lower frame rate were not justified by this desktop-emulation pass. The detailed design below records the implemented direction and tuning criteria.

## Direction

Build joystick-first play for phones and tablets in both portrait and landscape, using the existing GitHub Pages game. Start with controls and readability, then pilot mobile-only asset loading against actual map transitions. Keep desktop's current full upfront loading, controls, camera and transition behavior.

Use one movement stick on the left and contextual buttons on the right. Echo currently has no independent aiming action, so a second stick would consume space without a clear purpose. Keep tap-to-walk available as an option. Support double-tapping the movement stick to toggle running, with a visible Run/Walk button and state indicator as an alternative.

Portrait should have its own usable world viewport and menu layout. Compare a normal camera with a modest zoom-out; choose the version where roads, characters and encounters remain easy to read. Shrinking the existing landscape screen into a narrow strip is insufficient.

## What already exists

These observations come from the current source, not a phone playtest:

- `main.js` maps canvas pointer presses into the fixed 960×540 logical view. Movement destinations, nearby interactions and battle clicks already work through this path.
- `world-traversal.js` shares movement collision, followers and travel rules. Walk/run speeds are currently 330/490 world units per second; running uses Shift.
- `battle-ui.js` has clickable commands, targets and timing actions that submit shared combat intents. The combat model already rejects repeated timing attempts.
- `style.css` fits the entire game into a 16:9 box. Many controls and fonts scale with container width, so fitting the box alone makes phone text and controls too small.
- Camera limits, world drawing and input conversions assume a 960×540 view in several modules. Rendering uses a 2× backing surface.
- `assets.js` eagerly loads and prepares the complete manifest before startup. The current 177 PNG sources total about 374 MB; their dimensions imply about 1.04 GiB of RGBA pixels. This is a source-pixel estimate, not measured device memory. Rendering buffers and derived caches add to the working set.
- World travel currently takes 0.55 seconds, swaps scenes halfway through the fade, and checkpoints departure and completed arrival.
- Backgrounding already opens the pause menu in normal play. Save snapshots can retain battles; audio unlocks following user input. These need interruption and resume testing on devices.

## 1. Controls first

### Exploration

| Control             | Proposed behavior                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Left movement stick | Visible anchored thumb pad; drag in any direction, release to stop. A dead zone prevents drift.                                     |
| Run/Walk            | Double-tap the stick area to toggle; a labeled button performs the same action and shows the current state.                         |
| Interact            | Large right-side contextual button showing the nearby action, such as Talk, Enter or Inspect. Disabled when no valid action exists. |
| Menu / Back         | Always reachable without a keyboard; closes the top panel or opens the expedition menu according to context.                        |
| Map / World view    | Reachable touch buttons with the existing discovery and travel rules.                                                               |
| Ground tap          | Optional tap-to-walk; touching the stick cancels an existing walking route. Control presses never become ground taps.               |

- Introduce a small shared movement-input interface with a direction vector and run state. Keyboard, touch and click routing feed the existing traversal controller; do not maintain a second movement simulation or synthesize global keyboard events.
- Clamp vector magnitude so diagonal movement is never faster. Prototype proportional movement outside a roughly 15% dead zone for accurate doorway approaches, keeping full-deflection walk/run speeds consistent with desktop.
- Use separate pointer ownership for the stick and action buttons so a second thumb can interact while the first moves. Releasing either finger must not release or steal the other control.
- A direct movement input cancels the click route. Use explicit arbitration if a keyboard is connected; do not sum keyboard and touch vectors into extra speed.
- Clear movement on release, pointer cancellation, lost capture, pause, dialogue, combat entry, travel, orientation changes and session reset. Resuming requires a fresh movement gesture.
- Treat Run as a speed preference, never automatic movement. Preserve it across a normal doorway; reset to Walk on a new or loaded session. Always show its state, including after interruptions.
- Recognize a completed short first tap followed by a second touch-down in the stick's activation area. Exclude a first gesture that was a drag, long hold or canceled touch. Start with a roughly 300 ms interval and small movement tolerance, then tune on a phone. Toggle once on that second touch-down; it may then become a movement drag so the player can double-tap and run without lifting again.
- Keep the visible Run button usable even if double-tap proves awkward. Offer gesture disabling and control size/handedness settings after the initial feel check.

Use pointer capture and handle cancellation explicitly. Apply custom gesture handling to control pads and the game surface; retain normal vertical scrolling in menus. Browser scrolling can cancel pointer input, so this boundary must be deliberate. [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).

### Combat and conversations

- Replace the exploration pad with large combat controls while in battle. Crew, action and target choices remain normal tap controls; Back, Execute, Strike and Guard stay reachable.
- Use one active command card for mobile, following the existing Crew → Action → Target → Timing stages. Keep a compact party strip with HP and ATB readiness visible; expand technique/item choices only when selected. Show the current hero and chosen action in a short breadcrumb instead of retaining four accordion headers.
- Choosing an action can advance directly to the relevant choices. Back revisits an earlier choice without committing it; the final target card has an explicit Execute button. Avoid an extra generic Next press for every selection, and never spend resources simply by opening or changing cards.
- Give timing its own stable Strike/Guard surface. An incoming guard prompt temporarily takes priority; retain and restore any pending command selection if still valid under the existing combat rules. Keep health/readiness visible without requiring another card to inspect it.
- Keep attack/guard timing on a fresh touch-down. Deduplicate the subsequent click event, and prevent the Execute touch from also becoming a timing attempt when the UI changes beneath it.
- Keep existing ATB pause, resource spending, timing-assistance and confirmation rules. Mobile input submits the same intents as desktop.
- Rotate or resize without resetting a pending command or restarting its timing window. Keep the one-card flow in both mobile orientations; change the dock placement and available width rather than the combat sequence.
- Make dialogue Continue, choices and dismissal separate buttons. Dismissal must not select a choice or finish an ending callback.
- Do not use the joystick to navigate scrollable menus in the first pass. Direct touch and scrolling are clearer there.

## 2. Portrait and landscape layouts

### Screen arrangement

| Mode            | Exploration                                                                                                        | Battle                                                                         | Menus                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Phone portrait  | Compact HUD, tall world view, left stick/right actions in a lower thumb zone. Position the player above that zone. | Arena above a full-width command area; show one active command step at a time. | Full-height panels, compact crew selector, mostly single-column item/service cards and scrollable navigation. |
| Phone landscape | Wider world view, compact HUD, controls at the lower corners.                                                      | Arena with a compact command dock and large timing control.                    | One or two card columns according to available width; avoid covering content with controls.                   |
| Tablet          | Use the same touch controls with more space and adjustable reach.                                                  | Adapt the command area to width.                                               | Add columns only when text and tap targets remain comfortable.                                                |
| Desktop         | Existing presentation and keyboard/mouse controls.                                                                 | Existing presentation.                                                         | Existing layout.                                                                                              |

Start with a visible lower control zone in portrait, roughly 120–150 CSS pixels high before safe-area padding, with the player and nearby encounters above it. In landscape, place controls at the lower corners so a full-width bar does not consume the limited height. Validate both on real phones; keep the usable world rectangle explicit, since transparency alone cannot prevent thumbs from hiding content.

Keep comfortable control sizes across orientations instead of shrinking everything in portrait: begin with a 110–130 CSS-pixel joystick activation zone, 48–56 CSS-pixel primary button targets and readable body text around 16 CSS pixels. The visible knob and icons can be smaller than their non-overlapping hit areas. These are prototype targets, not measurements already achieved. Enlarge the small unequip, quantity and close controls along with the obvious main buttons; retain generous spacing between destructive and ordinary actions.

Show only controls relevant to the current mode. Exploration controls disappear in battle and menus; battle uses the compact party strip plus one command card, with the arena above in portrait and a compact dock in landscape. Keep the timing button in a predictable location through command changes. Offer size/reach adjustments after the initial pilot rather than scaling targets down to make content fit.

Account for browser bars, notches and the home indicator with dynamic viewport sizing and safe-area padding. Rotation must preserve location, current menu, battle and pending confirmation while clearing active touches. [CSS environment variables](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env).

### Portrait camera

- Separate world coordinates, visible world bounds, screen layout and render resolution. The world and collision geometry remain stable while the visible rectangle adapts to orientation.
- A taller view naturally shows more north/south and less east/west. A small zoom-out can add context, but zooming out also makes characters smaller; it cannot by itself fix a narrow layout or undersized text.
- Compare a readable default scale with approximately 10–15% smaller world art in portrait. Treat this range as an experiment, not a committed setting. Keep HUD and menu text independent of world zoom.
- Add modest directional look-ahead if needed to see upcoming road bends. Ease it and respect reduced-motion settings; avoid large camera swings whenever the stick crosses center.
- Share the same viewport transform between world drawing, foreground occlusion, enemy labels, interaction prompts and screen-to-world input. Test inverse coordinate mapping after rotation and zoom.
- Audit the fixed-size assumptions in `main.js`, `rendering.js`, `world-traversal.js`, `art.js`, encounter labels, world view and upgrade cinematics. A camera-only patch must not leave hit targets or culling in old coordinates.
- Preserve current survey/fog rules; a larger portrait view should not silently mark extra map areas discovered. Clamp the camera at map edges and handle interiors smaller than the viewport without exposing blank space.
- Use a separate portrait battle composition. Its formations, tall bosses, enemy meters and target hit regions cannot rely on the exploration zoom setting.

## 3. Complete the touch UI

- Inventory: compact crew selection, readable comparisons, large Equip/Use/Unequip actions and stable scrolling after changes. Keep Exotic identity and reforge strength behavior.
- Shops: quantities, Buy/Sell/Sell All and inline confirmations remain reachable without horizontal clipping or accidental taps through panels.
- Restoration and advancement: requirements, costs, rewards, confirmation and Skip reveal fit both orientations.
- Skills, research, quests and settings: no keyboard-only action or essential hover-only explanation; preserve selected item and scroll position during updates.
- Map: one-finger pan, explicit zoom buttons and optional pinch zoom. Distinguish a drag from a region selection; a second finger must not trigger travel.
- Dialogue and battle: finger-friendly choices, clear target names, stable timing controls, and accessible Back/Menu actions.
- Title and Save: new/load/import/export usable by touch; test the mobile file chooser and download behavior. Desktop and phone saves remain separate unless the player transfers a save; this plan adds no cloud sync.
- Hide desktop key legends when touch is the active input mode, while retaining keyboard operation on hybrid devices.

## 4. Protect desktop behavior

Keep layout, input and asset-loading profiles separate. A narrow desktop window, touch-capable laptop or mouse attached to a tablet must not accidentally switch the loader policy.

- Desktop continues to load all current assets upfront and uses the existing camera, rendering defaults and 0.55-second travel behavior.
- Touch controls have an Auto/On/Off preference. Detect the likely primary input from touch/pointer capabilities and allow correction.
- Mobile loading is a separate opt-in pilot for handheld use. Enabling touch controls alone does not enable it, and resizing the window never changes it mid-session.
- Expose the loader choice before asset loading begins; apply changes on a deliberate reload. If device classification is ambiguous, retain full loading rather than silently changing desktop performance.
- A development-only override may exercise mobile behavior on a desktop for tests. It must not alter the normal desktop default.
- Keep input/presentation preferences separate from progression. Save imports preserve quests, item ownership and battle state without importing an actively held joystick or forcing a loader profile.

## 5. Mobile-only asset loading pilot

Begin this after the first controls/layout review, unless full loading prevents the target phone from booting. In that case, bring forward the minimum mobile loading prototype needed to review controls on that phone; desktop still uses the existing policy.

### Bundle and lifetime model

1. Keep `ASSET_MANIFEST` authoritative. Add explicit dependency groups for common UI/party art, regions, their towns/caves, encounters and special presentations. Shared sheets can belong to multiple groups and load once.
2. Pin a bounded common set needed for normal menus, current crew and safe resume. Resolve additional dependencies before opening a view that requires them; required art must not appear as missing placeholders during play.
3. At new game/load, prepare the actual destination scene and saved battle/ending dependencies. Loading an old save in a later region must not assume the Haventide startup set is sufficient.
4. Keep the active scene pinned. Prefetch a likely nearby exit or selected travel destination within a measured memory budget. Avoid downloading every adjacent region at every junction.
5. Retain the previous scene for quick backtracking when the budget permits. Evict least-recently-used unpinned groups, with reference counts for shared source and derived art.
6. Bound concurrent downloading/decoding/preparation. The existing flood-fill background extraction creates temporary buffers; peak transition memory matters as much as steady-state memory.
7. Add explicit release paths for retained art maps, ground chunks, patterns, canvases and GPU resources where used. Removing a manifest entry or cache key alone may leave other references alive.
8. Consider mobile-sized runtime art and build-time transparency extraction only after profiling the pilot. Lossless file recompression reduces transfer size but does not change the decoded pixel count. Keep desktop source quality and canonical references intact.

Before choosing cache limits, measure common assets, a representative region, and overlap while preparing the next region. Track source/derived canvas bytes and cache counts in development; do not assume a universally available browser memory API or claim a memory saving from downloaded byte counts alone.

### Travel behavior and review

Warm transitions should retain the current fade and feel immediate. Test the actual preparation of decoded, keyed and installed art; a downloaded image alone is not a ready destination.

- Prefetch while approaching a usable exit, choosing fast travel, or opening a likely destination prompt. Give active play priority over speculative loading.
- On confirmed travel, clear input and checkpoint departure through the existing path. Keep the source scene's required resources until destination preparation succeeds.
- If destination art is ready, use the existing 0.55-second fade. If it is late, hold at the opaque midpoint and show a brief loading indicator once the delay is noticeable; never expose an incomplete scene or an active encounter behind it.
- Commit destination position/scene only when preparation succeeds, then run arrival events and checkpoint exactly once. Rendering or retrying must not duplicate visit rewards, time advancement or resource spending.
- On failure, offer Retry and Return. Keep a valid source position and save; recover without leaving a half-swapped scene. Session/load changes invalidate outstanding preparation so late promises cannot install stale state.
- During a held transition, pause gameplay and protect the arrival. Clear touch ownership so releasing a finger after travel cannot cause a new interaction.
- If the previous scene has been evicted, show the same honest loading state on return. Preserve snappy warmed routes without promising every first visit will hide all network delay.

Compare full loading and mobile loading on the same device, route and network. Record cold startup, uncached first crossing, prefetched crossing, immediate return, return after eviction and fast travel. Record time until control returns, frame hitches, peak retained resources, failures and visual artifacts.

For a successfully prefetched crossing, the acceptance target is the existing 0.55-second fade without an extra loading hold or missing-art frame. Compare desktop startup and warmed crossings against their pre-change baseline. Choose numeric memory and frame-time budgets from the first device measurements; a completed download is not sufficient evidence of smooth traversal.

The mobile loading pilot should remain selectable until the user reviews these transitions. Expand it across all regions after that review; desktop does not adopt it as part of this plan.

## 6. Interruption, saves and rendering quality

- On hidden/page lifecycle transitions, clear pointers and movement, pause simulation, suspend audio appropriately and checkpoint through the existing snapshot path, including battles. On resume, show a deliberate Resume action and unlock audio from a gesture as needed. [Page visibility](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).
- Keep existing frequent gameplay checkpoints: a background notification is an extra opportunity to save, not a guarantee before a browser process is terminated.
- On a loader hold, save a coherent source or completed destination state. Resume must not replay arrival rewards or restore an unfinished asset promise.
- Consider a mobile rendering-quality option with a bounded backing resolution and smaller ground cache. Keep camera zoom independent: showing less detail per pixel should not change world distances or controls.
- Measure sustained traversal and battles for frame pacing and heat. A lower-power option may target 30 fps while retaining elapsed-time simulation and the existing timing rules; test timing fairness before adopting it.
- Handle renderer/context failure with a recoverable reload path using a valid save. Do not promise automatic recovery until tested.

## Delivery order and review points

| Phase                     | Work                                                                                                                                          | Ready for review when                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Touch controls        | Shared movement input, one stick, multitouch action buttons, Run toggle/double-tap, input cancellation; a basic portrait control arrangement. | Haventide exploration, doorway entry, interaction and one battle work entirely by touch. Portrait is usable for the pilot even before all menus are polished. |
| 2 — Portrait presentation | Adaptive world viewport, camera comparison, touch battle layout, safe areas and rotation.                                                     | Both orientations remain readable; enemies, doors, labels and touch targets align. Choose the portrait scale from actual play.                                |
| 3 — Menu coverage         | Inventory, shops, restoration, skills, quests, map, settings, dialogue and saves.                                                             | The existing campaign has no required keyboard-only action; a representative service/reward/save loop works in both orientations.                             |
| 4 — Loading pilot         | Mobile-only grouped loading, prefetch, bounded cache, safe transition hold/retry; desktop eager loading preserved.                            | Compare an outdoor route, town doorway, cave and return trip against full loading before deciding to enable it by default on mobile.                          |
| 5 — Coverage and quality  | All region dependencies, later-game saves, bosses/ending, interruption recovery and measured rendering options.                               | Device review passes the matrix below, cleanup is complete and desktop behavior remains accepted.                                                             |

The user authorized completing all implementation phases together on 2026-09-22. They are ready for the phone review described above; tune the controls/camera and loader defaults from that review.

## Validation

Use pure Node tests for input-vector normalization, dead zones, independent pointer ownership, run gestures, cancellation, viewport transforms, shared battle intents, loader dependencies, resource reference counts and atomic arrival/retry behavior. Extend meaningful existing tests for saves, traversal and combat rather than mirroring each new helper.

Run game/browser checks only when explicitly requested, following `AGENTS.md`. The user authorized the implementation spot checks recorded above; untested physical-device cases in the matrix remain for player review. `npm run verify:mobile` exercises both touch/layout/travel and recovery against an explicitly started dev server (override its origin with `ECHO_BASE_URL`).

| Area           | Cases                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Devices/layout | At least one iPhone/Safari and Android/Chrome; small and large portrait widths, landscape, tablet and desktop regression. Include browser bars and safe areas.                       |
| Input          | Two thumbs, stick release outside pad, cancellation, double-tap vs drag, accidental third touch, keyboard connected, menu open while moving, rotation mid-touch.                     |
| World          | Long roads, narrow doors, town staff, cave entry/exit, scenery occlusion, patrol contact, map edges and a resumed old save.                                                          |
| Combat         | All three heroes, four enemies, tall bosses, scrollable techniques, Execute followed by a fresh timing touch, incoming guard, pause and resume.                                      |
| UI/progression | Buy/sell, equip/use confirmation, Exotic reward/reforge, construction reveal/skip, dialogue choices, quest scrolling, save import/export.                                            |
| Loading        | New game, late-region save, suspended battle/ending, cold/warm/evicted travel, rapid backtracking, failed image/retry, session change while loading, offline with incomplete caches. |
| Reliability    | Lock screen, switch apps, audio resume, interrupted travel, repeated region visits, cache stability and a sustained play session.                                                    |
| Desktop        | Keyboard/mouse, click routing, battle timing, existing layout/scale, full asset readiness, and transition cadence.                                                                   |

Use production builds to verify root and GitHub Pages subpath asset resolution. Keep probe scripts, captures, reports and candidate runtime conversions in `.experiments/`; remove them and disposable build output after review. Track only live code/assets, required tests/tooling and this plan.

## Implementation ownership

| Concern               | Existing modules / likely addition                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch input           | `touch-input.js`, `touch-controls.js`, `mobile-preferences.js` and stylesheets; integration through `main.js`, `world-traversal.js`, `ui.js`, `battle-ui.js` and session reset. |
| Viewport              | `viewport.js`; integration through `rendering.js`, world camera/drawing, interaction labels, battle layout, world view and upgrade views.                                       |
| Responsive UI         | `style.css`, `field-ui.css`, `expedition.css`, `inventory.css`, `battle.css`, `community.css` and their markup owners.                                                          |
| Loading               | Existing `assets.js` and manifest, `asset-groups.js`, `asset-cache.js` and `game-asset-loading.js`, explicit cleanup in `art.js`, travel/session coordination.                  |
| Persistence/lifecycle | `game-session.js`, `mobile-lifecycle.js`, `persistence.js`, `save-transfer.js`, `audio.js`; presentation preferences kept separate from progression.                            |

The existing manifest and game state remain authoritative; mobile modules adapt their input, presentation and resource lifetime.

## Decisions to make through the pilots

- Portrait lower-zone height and landscape corner placement, stick size/reach, double-tap tolerance and optional handedness layout.
- Single-card battle height, party-strip readability, long technique/item lists and incoming-guard transitions, without adding extra confirmation steps.
- Portrait camera scale and how much directional look-ahead feels comfortable.
- Common-asset budget, previous-region retention and when mobile loading is ready to become the handheld default.
- Whether smaller runtime art or a lower-power rendering option is needed on the tested phones.

Native app packaging, offline installation, cloud saves, new combat mechanics and a second joystick are outside the initial mobile pass. Story rewrites and further Exotic reforge ranks retain their separate roadmap decisions.
