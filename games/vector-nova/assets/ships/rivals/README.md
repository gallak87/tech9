# Rival production racers

Three original opponent chassis available through **Inspect Ships → AI racers**. These are inspection previews only, separate from the playable catalog, handling, AI and spawning. Their appearance is deliberately more utilitarian than the premium player fleet: muted paint, replaceable panels, visible machinery and restrained lighting.

| Chassis | Silhouette                                                          | Propulsion                       | Source and export                                    |
| ------- | ------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Rook    | Low clipped wedge with a blunt shovel nose                          | Two recessed rectangular outlets | [Blender](rook/rook.blend), [GLB](rook/rook.glb)     |
| Latch   | Narrow tub, straight canards and exposed engine pods on cross spars | Two round turbines               | [Blender](latch/latch.blend), [GLB](latch/latch.glb) |
| Mule    | Rounded continuous tub and wraparound shoulder shells               | One wide letterbox outlet        | [Blender](mule/mule.blend), [GLB](mule/mule.glb)     |

Original design sheets and exact built-in imagegen prompts: [Rook concept](rook/concept-01.png) / [prompt](rook/concept-prompt.txt), [Latch concept](latch/concept-01.png) / [prompt](latch/concept-prompt.txt), [Mule concept](mule/concept-01.png) / [prompt](mule/concept-prompt.txt). Each directory also contains provenance, measured export bounds/budgets, and the original baked PBR maps. No third-party models, fonts or textures are used.

The `.blend` files retain named editable components, procedural materials, and a neutral studio. The `.glb` files consolidate by material, embed their color/roughness/normal maps, and exclude the studio. The generator reuses the player fleet's construction and bake helpers without rebuilding or altering the approved player models. It copies the exports to `public/assets/ships/rivals/<id>/<id>.glb` for inspection in development and production builds; previews load only when selected in the inspector.

## Build and inspect

From `games/vector-nova`:

```sh
blender --background --threads 6 --python-exit-code 1 --python assets/ships/rivals/build_rivals.py
node tools/rival-assets-verify.mjs
```

Add `-- --ship latch --render` to build one ship and produce optional stills under ignored `.experiments/rival-blender/`. Open the game, choose **Inspect Ships**, then **AI racers** to view Rook, Latch and Mule. Returning to **Your ships** restores the current playable selection. With a private server running, `VN_URL=http://127.0.0.1:5237 node tools/rival-inspection-verify.mjs` checks lazy loading, switching, failure/retry, cancellation, player isolation and responsive layouts in a hidden browser.

## Future integration contract

Metres, local +Z forward / +Y up, exhaust aft along -Z. All hulls fit the established 4.5 m wide × 7 m long envelope. `Exhaust_L` / `Exhaust_R` are present on Rook and Latch; Mule has `Exhaust_C`. Nozzle empties include aperture dimensions for later exhaust fitting. See each `asset-manifest.json` for measured bounds and anchors. Plume animation, handling profiles, asset sharing across opponents, AI and grid placement remain future integration work.
