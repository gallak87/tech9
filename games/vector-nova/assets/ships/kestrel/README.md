# Kestrel / Concept 01

This original editable Blender model uses the approved lean jet-like Kestrel direction. `concept-01.png` is the approved original generated design reference; it is not used as runtime scenery or a model texture. The model is original authored geometry, built and rendered in Blender 5.1.1.

## Files

- `kestrel.blend`: editable named component meshes, modifiers, material definitions, neutral studio and camera. The studio is excluded from game export.
- `build_kestrel.py`: deterministic source generator, export consolidation and optional neutral review renders.
- `textures/`: original baked base-color, roughness, tangent-normal and cavity-occlusion source maps, embedded and channel-packed by glTF export.
- `finish.py`: entry point for the shared `../clean_finish.py` coated ceramic, resin composite and machined alloy graphs, using the `../surface_finish.py` four-channel baker.
- `asset-manifest.json`: measured final exported bounds, triangle/material counts, file size and propulsion anchors.
- `provenance.json`: design source, request and image-generation provenance.
- `../../../public/assets/ships/kestrel/kestrel.glb`: runtime asset, one mesh per material, no external textures, fonts or linked files.

Rebuild from the app directory:

```sh
blender --background --threads 6 --python assets/ships/kestrel/build_kestrel.py -- --toktx /path/to/toktx
```

Use Khronos KTX-Software 4.4.2. The builder compresses the runtime maps and records both lossless and compressed hashes. Omitting `--toktx` exports a lossless PNG GLB for authoring only. Add `--render` after `--` for optional Blender stills; visual acceptance uses the exported asset in Three.js. Temporary images/logs belong in ignored `.experiments/`. The source `.blend` retains individually editable components; only the GLB export copies are consolidated. The exporter uses Blender's stock glTF 2.0 exporter.

For fast geometry and material-response comparisons before baking:

```sh
blender --background --threads 6 --python assets/ships/kestrel/build_kestrel.py -- --preview
```

This writes `.experiments/kestrel-material-preview/kestrel.glb` with scalar materials. It skips texture baking and leaves the runtime GLB and editable source `.blend` untouched. Review that export in Three.js; use the full rebuild above for final maps and delivery.

## Runtime contract

Metres, local +Z forward and +Y up; the root runtime owns world pose and adhesion. The lowest induction hardware is near Y=0. Two identity-rotation empties, `Exhaust_L` and `Exhaust_R`, place the rear propulsion origins. Their local aft direction is -Z. Read `asset-manifest.json` for measured positions and hull bounds. `Kestrel_Power` is the active cyan aperture material; `Kestrel_Standby` is the restrained induction accent. Runtime effects are separate from the static model and attach to these anchors.

The craft uses thin formed ceramic skins over separate composite carriers, refined panel contours and bevels, through-cut intake pockets with folded louvers, flush captive screws, surface-projected livery and a low smoked canopy with bonded frames. Continuous graphite lattice spars retain open bays. Compact octagonal exhaust cavities carry overlapping titanium petals and machined retaining lips. Swept canted fins and the original station envelope preserve its identity.

The clean finish separates coated off-white ceramic, resin composite and machined metal without painted wear or dirt. Embedded maps retain the existing 2048px ceramic / 512px secondary resolutions; short-range AO supports fitted joints. Clearcoat reuses the existing baked normal map without adding an image. Setup and inspection share a procedural studio reflection environment filtered with a 256px PMREM; track lighting remains level-owned. The approved palette remains pearl, graphite, titanium, restrained vermilion and cyan propulsion. The builder enforces the existing geometry/submission and envelope limits; measured counts live in `asset-manifest.json`. Exhaust anchors and gameplay tuning are unchanged.
