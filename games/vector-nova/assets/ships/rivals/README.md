# Rival production racers

Three original AI chassis race on competitive circuits and are available through **Inspect Ships → AI racers**. They remain separate from the player-selectable fleet. Their appearance is deliberately more utilitarian than the premium player fleet: muted paint, replaceable panels, visible machinery and restrained lighting.

| Chassis | Silhouette                                                          | Propulsion                       | Source and export                                                                        |
| ------- | ------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Rook    | Low clipped wedge with a blunt shovel nose                          | Two recessed rectangular outlets | [Blender](rook/rook.blend), [GLB](../../../public/assets/ships/rivals/rook/rook.glb)     |
| Latch   | Narrow tub, straight canards and exposed engine pods on cross spars | Two round turbines               | [Blender](latch/latch.blend), [GLB](../../../public/assets/ships/rivals/latch/latch.glb) |
| Mule    | Rounded continuous tub and wraparound shoulder shells               | One wide letterbox outlet        | [Blender](mule/mule.blend), [GLB](../../../public/assets/ships/rivals/mule/mule.glb)     |

Original design sheets and exact built-in imagegen prompts: [Rook concept](rook/concept-01.png) / [prompt](rook/concept-prompt.txt), [Latch concept](latch/concept-01.png) / [prompt](latch/concept-prompt.txt), [Mule concept](mule/concept-01.png) / [prompt](mule/concept-prompt.txt). Each directory also contains provenance, measured export bounds/budgets, and the original baked PBR maps. No third-party models, fonts or textures are used.

The `.blend` files retain named editable components, procedural materials, and a neutral studio. The `.glb` files consolidate by material, embed their color/roughness/normal maps, and exclude the studio. The generator reuses the player fleet's construction and bake helpers without rebuilding or altering the approved player models. It writes the canonical exports directly to `public/assets/ships/rivals/<id>/<id>.glb` for racing and inspection in development and production builds. Competitive circuit boot loads all three racers; inspection loads the selected chassis as a separately owned instance.

## Build and inspect

From `games/vector-nova`:

```sh
blender --background --threads 6 --python-exit-code 1 --python assets/ships/rivals/build_rivals.py
node tools/rival-assets-verify.mjs
```

Add `-- --ship latch --render` to build one ship and produce optional stills under ignored `.experiments/rival-blender/`. Open the game, choose **Inspect Ships**, then **AI racers** to view Rook, Latch and Mule. Returning to **Your ships** restores the current playable selection. With a private server running, `VN_URL=http://127.0.0.1:5237 node tools/rival-inspection-verify.mjs` checks lazy loading, switching, failure/retry, cancellation, player isolation and responsive layouts in a hidden browser.

## Runtime contract

Metres, local +Z forward / +Y up, exhaust aft along -Z. All hulls fit the established 4.5 m wide × 7 m long envelope. `Exhaust_L` / `Exhaust_R` are present on Rook and Latch; Mule has `Exhaust_C`. Nozzle empties retain aperture dimensions for local propulsion presentation. See each `asset-manifest.json` for measured bounds and anchors. The shared race model assigns Rook the Kestrel profile, Latch the Shrike profile and Mule the Bastion profile. Each racer owns independent physics, reserve, device eligibility and lap state on the 2×2 grid; the presentation uses these actual rival GLBs. The static exports retain their nozzle anchors for additional plume presentation.
