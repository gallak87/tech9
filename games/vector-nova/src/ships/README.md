# Fleet

`catalog.js` contains four versioned ship definitions: Kestrel (balanced), Shrike (agile), Bastion (endurance) and Needle (speed). `await createShip({id, plumeExposure, model})` loads one GLB; an omitted/unknown id uses Kestrel. The returned `{group, update, dispose}` owns its geometry, materials and asset textures. Supplied parsed models are cloned. Borrowed renderer reflections remain renderer-owned.

`createFleetShip` wraps one chassis in a stable root, retaining level feedback attached to that root across changes. It exposes `selected` and async `select(id)`; failed requests leave the old chassis usable, superseded/disposed requests release their new resources. Core owns menu-only switching, fresh simulation state, shader warmup and camera fitting. Paddock/inspection use the same selector and locally saved choice. Replay compatibility checks ship id/version; changing ships resets lap history.

**Inspect Ships → AI racers** loads Rook, Latch and Mule through the separate `rivals.js` mesh catalog. They race on competitive circuits using Kestrel, Shrike and Bastion handling respectively, assigned by the circuit race model; they are not player-selectable. Core owns the selected inspection preview, cancels superseded requests, releases it on tab/scene exit, and preserves the player's chassis and saved choice. Sources and rebuild instructions live in [rival assets](../../assets/ships/rivals/README.md). Both player selectors use a vertical list beside stacked performance bars.

Assets use metres, local +Z forward and +Y up. Twin-engine ships export `Exhaust_L` and `Exhaust_R`; Needle exports only `Exhaust_C`. Exhaust points aft along -Z. `update({speed,boost,steer,time,energy,reducedMotion})` animates local emission, pressure response and short-range nozzle light only. Reserve is normalized to 0–1 for presentation. `group.userData.bounds` contains static local hull bounds without animated exhaust.

Source models/concepts/provenance: `assets/ships/<id>/`. Runtime models: `public/assets/ships/<id>/<id>.glb`. Rebuild the additions from the app directory with:

```sh
blender --background --threads 6 --python assets/ships/build_fleet.py
```

Add `-- --ship needle --render` for optional neutral review renders in ignored `.experiments/fleet-blender/`. The saved blends retain named editable meshes, modifiers, procedural PBR materials and a studio. Exports join by material, unwrap and bake base-color/roughness/tangent-normal/cavity-occlusion maps, embed those images in the GLB, and exclude the studio. Main ceramic armor uses 2048×2048 maps; graphite and metal retain 512×512 maps. The shared `surface_finish.py` authors metre-space tooling, sparse contact scuffs, close-joint dirt and aft-only heat tint; it bakes with padded UV islands. Chosen finish targets and exact generation prompts are recorded in each ship’s provenance. Baked source maps are retained under each ship’s `textures/` directory. No third-party geometry, fonts or textures are used.

The direct `?inspect=1&ship=kestrel&level=halcyon` inspector (or I during a session) displays the runtime models with drag rotation, an initially enabled auto-rotate toggle, and driving/stationary, boost and heat-shimmer controls. Dragging pauses auto-rotation; the menu viewer previews driving at 400 km/h while leaving simulation state unchanged. Heat can be toggled against the same studio background for visual comparison. Reduced motion pauses decorative rotation and refraction; the main inspector also respects Low graphics. A lazily allocated, owned inspection pipeline runs the same depth-aware heat pass used in racing. The standalone inspector supplies the shared four-ship picker; in-session inspection locks the chassis to preserve the active run. `VN_URL=<server-url> npm run verify` checks the current selection/inspection/session flow without saving artifacts. The historical fleet/rival browser harnesses require migration; see tools/README.md. `src/ships/fleet.test.js` verifies actual speed/turn/brake/endurance tradeoffs and exported geometry/anchors. Browsers stay hidden; temporary captures belong in ignored `.experiments/` and are removed after use.

## Approved Kestrel baseline

Kestrel retains its approved silhouette, bounds, attachment points and handling; its ceramic, graphite and titanium finish uses the same baked PBR workflow as the fleet. Its source/exporter/provenance are in `assets/ships/kestrel/`. The human approved its integration on 2026-09-29; completed review history is in Git (`1dfff691`). The existing `tools/kestrel-verify.mjs` and propulsion ownership tests remain available. The user approved the expanded fleet and requested integration on 2026-10-01.

The renderer borrows each plume’s `userData.exhaustHeat` field for a depth-aware refraction pass on High. High-speed cruise sustains the full heat wake even where the blue flame is faint; boost adds 12% width, 18% length and stronger refraction. Authored hull bounds protect the craft, and the pass rejects foreground depth at original and displaced sample positions. Low and reduced motion disable distortion; reduced motion also freezes decorative emission flow. Pressure follows simulation time, so pausing holds the effect and resetting or seeking restores the requested boost state. Inspection uses an owned neutral studio environment and restores borrowed race reflections after each draw.

## GPU-compressed ship maps

Player GLBs use `KHR_texture_basisu` with mipmapped UASTC textures. The original
baked PNGs remain the editable lossless source. After a Blender rebuild, convert
the PNG GLB in place with Khronos KTX-Software **4.4.2**:

```sh
python3 assets/ships/compress_textures.py public/assets/ships/kestrel/kestrel.glb public/assets/ships/kestrel/kestrel.glb --toktx /path/to/toktx
```

Repeat for the other chassis. The converter preserves geometry and material
factors, uses UASTC quality 3 with Zstd level 18, makes full mip chains, writes
upper-left texture orientation, and records sRGB only for color/emissive maps.
Tangent normals stay RGB; do not use the encoder's X/alpha normal swizzle.
Already-compressed input is rejected: rebuild the PNG GLB to change settings.

`texture-loader.js` owns one two-worker KTX2 loader. A live preview/race renderer supplies GPU capabilities when available. Otherwise a temporary unattached 1px renderer detects support and immediately releases its context, so compressed preloading finishes with the Ship accordion closed. PNG loads need neither the probe nor decoder. Cache disposal/page exit abort requests and releases workers. Failed or
30-second-stalled decoding rejects the model rather than caching missing maps,
so selection/preload can retry. The matching Three.js 0.186.1 Basis decoder is
served through `assetURL` under `assets/ships/decoder/` (Apache-2.0).
`getMetrics()` reports actual transcoded mip payload bytes and format counts;
its total GPU figure remains an estimate excluding driver overhead.

With the dev server running, `VN_URL=http://127.0.0.1:5179 node tools/ship-textures-verify.mjs`
checks renderer-independent cold preload, real GPU uploads, preview/cache disposal and decoder
failure/timeout/retry. Add `--png-fixture /path/to/lossless.glb` to check ordinary
PNG loading before any renderer exists. Visual fidelity still requires matching
studio and chase captures; these checks do not establish art quality.
