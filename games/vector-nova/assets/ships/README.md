# Player ship source assets

Kestrel, Shrike, Bastion and Needle retain their approved silhouettes, authored component geometry and named exhaust anchors. Runtime meshes are exported from editable Blender sources, with original procedural PBR surfaces. No downloaded model or texture assets are used; generated concept images remain references only. Per-ship provenance records retain the original concept and approval history.

Rebuild from `games/vector-nova`:

```sh
blender --background --threads 6 --python assets/ships/kestrel/build_kestrel.py
blender --background --threads 6 --python assets/ships/build_fleet.py
```

The fleet generator accepts `-- --ship bastion` (or `shrike` / `needle`) for an individual ship. Add `--render` after `--` for Blender review stills in ignored `.experiments/`. Sources are saved before export consolidation, preserving components, modifiers and editable procedural materials.

`surface_finish.py` supplies restrained ceramic grain, satin graphite, directional brushed metal and localized titanium heat tint. Color, roughness, tangent normals and short-range cavity occlusion are baked at 1024 px for main ceramic and 512 px for the three mechanical families. All sixteen source maps are retained per ship; the stock glTF exporter packs roughness/occlusion into shared textures, so the GLB embeds twelve images. Occlusion uses a limited 18 cm radius and a 0.66–1 range; broad lighting remains dynamic.

Ceramic uses softer bevels than machined retaining lips. Bastion has individual aft shoulder plates and recessed transverse cleats that reveal the existing graphite skeleton while retaining its slim catamaran envelope. The three fleet additions have formed canopy coamings and gaskets; Kestrel has a strengthened structural seat and gasket. All nozzles keep real recessed throats and their original propulsion origins. Cold mounting cuffs and heat-tinted aft petals form two axial layers around a recessed dark pressure sleeve; two broad spring keepers bridge the overlap, with a bright machined retaining lip. Satin blue-grey service ceramic distinguishes nacelle saddles and selected panel families from the main pearl shell. Colored livery is painted rather than metallic, while slightly lighter satin graphite preserves mechanical form in shadow. `propulsion_chamber.py` adds a single recessed central emitter and three supporting baffles to each nozzle. The small active face shares the existing Power material, so throttle and boost control it together with the surrounding aperture. Ceramic cavity roughness and narrow service-cowling gaskets reinforce sheltered joints without adding dirt. The dark canopies use tinted low-metallicity dielectric surfaces with a clear coat; Kestrel’s intake uses seven wide blades and readable projected service joints. Exact exported dimensions, triangle counts, material groups and anchors are recorded in each asset manifest.
