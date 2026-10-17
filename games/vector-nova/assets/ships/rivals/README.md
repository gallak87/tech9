# Rival production racers

Nine original AI chassis race on competitive circuits and are available through **Inspect Ships → AI racers**. They remain separate from the player-selectable fleet. Their appearance is deliberately more utilitarian than the premium player fleet: distinct silhouettes, muted team paint, replaceable panels, visible machinery and restrained lighting. The six additions use clean coated surfaces without added wear.

| Chassis | Silhouette                                                          | Propulsion                       | Source and export                                                                            |
| ------- | ------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Rook    | Low clipped wedge with a blunt shovel nose                          | Two recessed rectangular outlets | [Blender](rook/rook.blend), [GLB](../../../public/assets/ships/rivals/rook/rook.glb)         |
| Latch   | Narrow tub, straight canards and exposed engine pods on cross spars | Two round turbines               | [Blender](latch/latch.blend), [GLB](../../../public/assets/ships/rivals/latch/latch.glb)     |
| Mule    | Rounded continuous tub and wraparound shoulder shells               | One wide letterbox outlet        | [Blender](mule/mule.blend), [GLB](../../../public/assets/ships/rivals/mule/mule.glb)         |
| Pike    | Long spearhead and swept aft stabilisers                            | One round turbine                | [Blender](pike/pike.blend), [GLB](../../../public/assets/ships/rivals/pike/pike.glb)         |
| Tern    | Suspended cockpit between separated longitudinal booms              | Two rectangular outlets          | [Blender](tern/tern.blend), [GLB](../../../public/assets/ships/rivals/tern/tern.glb)         |
| Manta   | Broad continuous swept flying wing                                  | Two rectangular outlets          | [Blender](manta/manta.blend), [GLB](../../../public/assets/ships/rivals/manta/manta.glb)     |
| Vise    | Hammerhead bow and separate aft engine carriers                     | Two round turbines               | [Blender](vise/vise.blend), [GLB](../../../public/assets/ships/rivals/vise/vise.glb)         |
| Kite    | Compact diamond monocoque and canted aft vanes                      | One rectangular outlet           | [Blender](kite/kite.blend), [GLB](../../../public/assets/ships/rivals/kite/kite.glb)         |
| Gannet  | Raised fuselage with descending gull wings and low outriggers       | Two rectangular outlets          | [Blender](gannet/gannet.blend), [GLB](../../../public/assets/ships/rivals/gannet/gannet.glb) |

Original design sheets and exact built-in imagegen prompts: [Rook concept](rook/concept-01.png) / [prompt](rook/concept-prompt.txt), [Latch concept](latch/concept-01.png) / [prompt](latch/concept-prompt.txt), [Mule concept](mule/concept-01.png) / [prompt](mule/concept-prompt.txt). The six additions are original authored geometry with their design briefs recorded directly in each `provenance.json`; they do not use generated concept images. Each directory also contains provenance, measured export bounds/budgets, and the original baked PBR maps. No third-party models, fonts or textures are used.

The `.blend` files retain named editable components, procedural materials, and a neutral studio. The `.glb` files consolidate by material, embed their color/roughness/normal maps (plus short-range cavity occlusion on the additions), and exclude the studio. The generator reuses the player fleet's construction and bake helpers without rebuilding or altering the approved player models. It writes the canonical exports directly to `public/assets/ships/rivals/<id>/<id>.glb` for racing and inspection in development and production builds. Competitive circuit boot loads all nine racers; inspection loads the selected chassis as a separately owned instance.

## Build and inspect

From `games/vector-nova`:

```sh
blender --background --threads 6 --python-exit-code 1 --python assets/ships/rivals/build_rivals.py
node tools/rival-assets-verify.mjs
```

Use `-- --ship additions` to rebuild only the six new chassis, or `-- --ship pike --preview` for a fast unbaked scalar-material export under `.experiments/rival-material-preview/` without changing the production assets. Add `-- --ship latch --render` to build one ship and produce optional stills under ignored `.experiments/rival-blender/`. Open the game, choose **Inspect Ships**, then **AI racers** to view all nine models. Returning to **Your ships** restores the current playable selection. Use the maintained `npm run verify` frontend harness for inspection/session flows. The historical `tools/rival-inspection-verify.mjs` harness requires migration; see [tools documentation](../../../tools/README.md).

## Runtime contract

Metres, local +Z forward / +Y up, exhaust aft along -Z. All hulls fit the established 4.5 m wide × 7 m long envelope. `Exhaust_C` is present on Mule, Pike and Kite; the other six chassis have `Exhaust_L` / `Exhaust_R`. Nozzle empties retain aperture dimensions for local propulsion presentation. See each `asset-manifest.json` for measured bounds and anchors. The asset-free roster in `src/race/roster.js` assigns handling profiles separately from this visual catalog. Each racer owns independent physics, reserve, device eligibility and lap state on the ten-racer grid; the presentation uses these actual rival GLBs. The static exports retain their nozzle anchors for additional plume presentation.
