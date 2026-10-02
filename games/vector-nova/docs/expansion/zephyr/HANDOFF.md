# Map 8 — Zephyr Basilica: level brief

## Assignment and authority

**Goal:** Finish a floating-cathedral circuit through windows, naves and waterfall jumps, with a falling tower/island event and convincing dark-interior/bright-exterior light.

Own `zephyr` through the [common execution and completion rules](../README.md). Use `?level=zephyr` for production and `&review=shape` for route review.

## Existing work

Existing worktree: `/Users/g/.codex/worktrees/fzero-zephyr1/tech9`. Existing branch: `codex/fzero-zephyr1`.

Read the current primary's game instructions, this brief and the [startup/merge rules](../README.md#worktree-and-completion-ownership) before continuing. The [production loop](../README.md#production-and-critique-loop) owns the fresh eight-round desktop critic allowance and final mobile pass.

### Sources and retained behavior

Sources are in `games/vector-nova/assets/levels/zephyr/` inside the existing worktree. Preserve `zephyr-scene-reference.png`, `README.md`, `zephyr-asset-library.blend`, `build_assets.py` and `validate_assets.py`, their runtime exports and any newer authored versions.

Preserve the cathedral/island kit, curtain-water persistence through flight, compact HUD behavior and asset-load failure cleanup. Verify the rose-window/nave/chapel traversal and waterfall-to-jump visibility with actual inputs. Retain useful checks; remove obsolete GPU-grant/queue dependencies when updating them.

### Selected generated sky

Use the [selected reference-guided sky](../../../assets/levels/zephyr/zephyr-sky-v2.png), [exact generation prompt](../../../assets/levels/zephyr/sky-prompt-v2.txt) and [sky provenance](../../../assets/levels/zephyr/SKY_PROVENANCE.md) brought in from the primary worktree. Match the [original scene drawing](../../../assets/levels/zephyr/zephyr-scene-reference.png): luminous ivory/peach/lavender cloud banks, soft gold backlight, violet shadow volume and deep open cloud shelves around the floating architecture. Carry this light into weathered stone, bronze supports, dark naves and layered waterfalls while preserving landing visibility.

Follow the [sky integration checks](../README.md#generated-sky-panoramas), preserve the source image and export a runtime texture under `public/assets/levels/zephyr/`. Confirm seam/horizon, exposure, loading/disposal and high/low/reduced motion on the actual production build. Nearby scenery and gameplay remain authored 3D content.

## Defining interactions and spectacle

- **Cathedral traversal:** race through a shattered rose window, wall-ride around the nave and launch across a missing floor into the next floating chapel.

- **Waterfall crossings:** punch through water curtains immediately before selected jumps. Water streams off the camera and ship; lighting and visible exit markers help you commit to the landing.

- **Falling cathedral:** A cathedral island slowly tilts or sheds a massive tower into the clouds, pulling its waterfall into a long trailing arc. Keep the racing surface predictable during the event.

Take the route through cathedral interiors rather than merely around islands. Spread rose-window/nave/chapel traversal through the archipelago, integrate actual curtain crossings and selected jumps into Falls Between, and retain the cloud spiral as another distinct passage. Stage the falling tower and trailing waterfall across approach and departure views.

## World and driving direction

Pastel atmospheric bands, vast weathered stone islands and silver waterfalls surround dark woven bridges carried by bronze keels. The floating world has a coherent gravity-defying construction language and deep open vistas; wind and waterfall spray are visual atmosphere, not new forces.

Start near 4.9 km with a constant 32 m usable width and roughly 300 m of climb/descent. Wide banked arcs feed offset bridge transitions that need steering rather than automatic alignment, with a long spiral ascent as the central memory. Keep vertical and lateral transitions smooth and place short calm shelves before the most demanding turns. Mix supported bridges with explicitly authored cathedral/waterfall jumps and readable landing shelves.

| District idea         | Route and composition starting point                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Narthex Mooring**   | A gentle climbing S leaves a sheltered stone landing. The first dark woven bridge points toward a distant cathedral island and bronze keel silhouette.                                                                       |
| **Sailcourt Arc**     | A broad banked arc threads tall sail-shaped edge structures. Open cloud depth and a pair of small hanging islands establish exposure without filling the sky with repeated rocks.                                            |
| **Falls Between**     | Offset bridges and selected jumps pass beneath, beside and through enormous waterfalls. Stone catch basins and distant disappearing spray make the falls feel rooted in the floating architecture.                           |
| **Choir Archipelago** | The road pierces a shattered rose window, rides the nave wall and jumps a missing floor toward another chapel. Each island offers a distinct arch, stair or broken terrace silhouette, with readable gaps for upcoming road. |
| **Cloudspire Ascent** | A smooth climbing spiral passes a tall central stone needle and exits a cloud opening. Lateral support arms attach to the keel without crossing the road or camera path.                                                     |
| **Halo Terrace**      | A high banked sweep opens onto layered pastel gas bands above the cloud deck. A monumental broken halo of stone frames a brief sightline over the earlier bridges.                                                           |
| **Bronzewake Return** | A stepped descending curve reaches the starting island. Warm bronze understructure, small gardens of mineral reeds and the original mooring provide familiar closing detail.                                                 |

## Raceway construction and whole-world finish

- Running surface: broad woven graphite plates with coarse readable structural weave and smooth central induction bands. Bronze seam ferrules and selected pale fabric-like tension inserts create large-scale material variation; avoid asphalt grain disguised as weave.
- Boundaries: tall sail-shaped side structures rise from a compact continuous curb, with alternating solid ribs and open stretched panels. Their outward sweep and spacing preserve the next corner and chase-camera envelope.
- Underside/supports: deep bronze keels, tension ties and articulated stone-mounted saddles communicate how bridges span the islands. Floating islands expose shaped undersides with strata, roots of architecture and consistent suspension motifs.
- District variation: graphite-heavy sheltered bridges, bronze-rich ascent structure and pale tension panels on Halo Terrace. Use whole panel blocks and support changes rather than colored light strips alone.

- Hero landmarks: the cathedral island, Cloudspire needle and broken stone halo. Waterfalls supply a second scale system, with visible sources, paths and distant terminations.
- Ordinary stretches: terraced small islands, eroded openings, suspended stone shards, reed gardens and layered cloud shelves. Compose near bridge hardware, middle islands and distant atmospheric bands all around the route, including its inward-facing views.
- Lighting: Cathedral interiors should be substantially darker than the pastel exterior, with rose-window light, broken-roof shafts and restrained local fill exposing stone depth, road and ship. Build convincing light transitions through windows and waterfall curtains; backlit water, spray and wet surfaces must not erase the landing. The cloud ascent and return should have different atmospheric depth without becoming opaque fog.

**Reject these shortcuts:** Reject pastel fog replacing geometry, identical floating rocks, asphalt on an unrelated bridge, sails filling the camera, water curtains that erase the next landing, or unauthorized wind physics. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Finish targets and atmosphere

Make the rose-window entry, dark nave wall ride, missing-floor chapel leap, waterfall crossings and Cloudspire climb memorable from the racing camera. Vary height, enclosure and light through those authored features; preserve visible landing shelves. Stage the tilting island or falling tower and its trailing waterfall so its enormous scale and motion register from the course.

Finish weathered stone with readable masonry, erosion and carved depth; give bronze keels/joints convincing material response and graphite weave an appropriate scale. Waterfalls need a visible source, mass, layered breakup, spray and depth into the clouds. Dark naves need purposeful window shafts and restrained local fill; bright cloud/water views must retain road and craft shape.

Use the [weather/atmosphere references](../README.md#atmosphere-and-screen-effects) for wetness, localized impacts, shelter and coordinated lighting. Author waterfall spray and mist near actual curtains, soft cloud wisps around exposed islands and a convincing clearing transition inside chapels. The receiving/cover logic must respect stacked bridges and open architectural portals. Wind remains visual atmosphere.

Implement camera/visor droplets and short draining streaks when crossing a real waterfall, plus wet ship/deck response appropriate to exposure. Let droplets disperse and surfaces dry after shelter; avoid a permanent uniform wet overlay. Keep rose-window exits, landing shelves, HUD and touch controls clear. Reduced motion simplifies droplet travel/mist while preserving the crossing cue. The critic must test wet-to-dry and dark-to-bright transitions during the actual jumps and notice the falling architecture.

## Presets and resource discipline

High may add soft local waterfall mist and slow sail flex beyond the collision envelope. Low keeps the large falls, island openings, bridge structure and cloud depth while reducing mist and minor hanging fragments. Reduced motion freezes sail flex and moving cloud texture; no camera sway or procedural wind force. Avoid full-screen opaque cloud transitions.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The traversable cathedral/nave/rose window, adjacent chapels, large waterfall masses and falling tower/island assembly are major scene-to-Blender subjects. Use a small authored kit for secondary islands and bridge hardware; hero water must have convincing volume, layered breakup and scale.

Apply the [production/critic loop](../README.md#production-and-critique-loop), [critic standard](../README.md#critic-standard) and [verification rules](../README.md#verification-and-resource-discipline). Give the critic the selected drawing and this brief's finish/atmosphere targets; the checks below add level-specific acceptance.

## Acceptance on the actual production build

1. Drive through the rose window, nave wall ride and chapel jump using actual input; verify architectural/camera clearance and a genuine flight/landing transition.
2. Cross waterfalls into selected jumps with existing manual boost; inspect wet camera/ship effects, exit cues, imperfect approaches and recovery.
3. Inspect the tilting island or falling tower and trailing waterfall while racing; verify the supported racing surface stays predictable and event reset/pause/replay works.
4. Check dark interiors, bright windows and backlit water in high/low/reduced motion; verify landing/recovery cues and report difficult passages.
