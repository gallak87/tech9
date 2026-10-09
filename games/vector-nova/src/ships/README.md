# Fleet

`catalog.js` contains four versioned ship definitions: Kestrel (balanced), Shrike (agile), Bastion (endurance) and Needle (speed). `await createShip({id, plumeExposure, model})` loads one GLB; an omitted/unknown id uses Kestrel. The returned `{group, update, dispose}` owns its geometry, materials and asset textures. Supplied parsed models are cloned. Borrowed renderer reflections remain renderer-owned.

`createFleetShip` wraps one chassis in a stable root, retaining level feedback attached to that root across changes. It exposes `selected` and async `select(id)`; failed requests leave the old chassis usable, superseded/disposed requests release their new resources. Core owns menu-only switching, fresh simulation state, shader warmup and camera fitting. Paddock/inspection use the same selector and locally saved choice. Replay compatibility checks ship id/version; changing ships resets lap history.

**Inspect Ships → AI racers** loads Rook, Latch and Mule through the separate `rivals.js` mesh catalog. They race on competitive circuits using Kestrel, Shrike and Bastion handling respectively, assigned by the circuit race model; they are not player-selectable. Core owns the selected inspection preview, cancels superseded requests, releases it on tab/scene exit, and preserves the player's chassis and saved choice. Sources and rebuild instructions live in [rival assets](../../assets/ships/rivals/README.md). Both player selectors use a vertical list beside stacked performance bars.

Assets use metres, local +Z forward and +Y up. Twin-engine ships export `Exhaust_L` and `Exhaust_R`; Needle exports only `Exhaust_C`. Exhaust points aft along -Z. `update({speed,boost,steer,time,energy,reducedMotion})` animates local emission, pressure response and short-range nozzle light only. Reserve is normalized to 0–1 for presentation. `group.userData.bounds` contains static local hull bounds without animated exhaust.

Source models/concepts/provenance: `assets/ships/<id>/`. Runtime models: `public/assets/ships/<id>/<id>.glb`. Rebuild the additions from the app directory with:

```sh
blender --background --threads 6 --python assets/ships/build_fleet.py
```

Add `-- --ship needle --render` for optional neutral review renders in ignored `.experiments/fleet-blender/`. The saved blends retain named editable meshes, modifiers, procedural PBR materials and a studio. Exports join by material, unwrap and bake base-color/roughness/tangent-normal/cavity-occlusion maps, embed those images in the GLB, and exclude the studio. Baked source maps are retained under each ship’s `textures/` directory. No third-party geometry, fonts or textures are used.

The main menu’s **Inspect Ships** displays the runtime models with drag rotation, an initially enabled auto-rotate toggle, and driving/stationary, boost and heat-shimmer controls. Dragging pauses auto-rotation; the menu viewer previews driving at 400 km/h while leaving simulation state unchanged. Heat can be toggled against the same studio background for visual comparison. Reduced motion pauses decorative rotation and refraction; the main inspector also respects Low graphics. A lazily allocated, owned inspection pipeline runs the same depth-aware heat pass used in racing. The main game's **Inspect Ships** screen supplies the shared four-ship picker. With a private server running, `VN_URL=http://127.0.0.1:5237 node tools/fleet-verify.mjs` verifies real input, boost, replay, persistence, asset/storage failure and responsive selection across the installed circuits. `src/ships/fleet.test.js` verifies actual speed/turn/brake/endurance tradeoffs and exported geometry/anchors. Browsers stay hidden; captures belong in ignored `.experiments/`.

## Approved Kestrel baseline

Kestrel retains its approved silhouette, bounds, attachment points and handling; its ceramic, graphite and titanium finish uses the same baked PBR workflow as the fleet. Its source/exporter/provenance are in `assets/ships/kestrel/`. The human approved its integration on 2026-09-29; completed review history is in Git (`1dfff691`). The existing `tools/kestrel-verify.mjs` and propulsion ownership tests remain available. The user approved the expanded fleet and requested integration on 2026-10-01.

The renderer borrows each plume’s `userData.exhaustHeat` field for a depth-aware refraction pass on High. High-speed cruise sustains the full heat wake even where the blue flame is faint; boost adds 12% width, 18% length and stronger refraction. Authored hull bounds protect the craft, and the pass rejects foreground depth at original and displaced sample positions. Low and reduced motion disable distortion; reduced motion also freezes decorative emission flow. Pressure follows simulation time, so pausing holds the effect and resetting or seeking restores the requested boost state. Inspection uses an owned neutral studio environment and restores borrowed race reflections after each draw.
