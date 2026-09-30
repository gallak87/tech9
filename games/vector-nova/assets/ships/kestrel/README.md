# Kestrel / Concept 01

This editable Blender model replaces the earlier broad, rounded procedural craft with the user's approved lean jet-like Kestrel direction. `concept-01.png` is the approved original generated design reference; it is not used as runtime scenery or a model texture. The model is original authored geometry, built and rendered in Blender 5.1.1.

## Files

- `kestrel.blend`: editable named component meshes, modifiers, material definitions, neutral studio and camera. The studio is excluded from game export.
- `build_kestrel.py`: deterministic source generator, export consolidation and optional neutral review renders.
- `asset-manifest.json`: measured final exported bounds, triangle/material counts, file size and propulsion anchors.
- `provenance.json`: design source, request and image-generation provenance.
- `../../../public/assets/ships/kestrel/kestrel.glb`: runtime asset, one mesh per material, no external textures, fonts or linked files.

Rebuild from the app directory:

```sh
blender --background --threads 6 --python assets/ships/kestrel/build_kestrel.py
```

Add `-- --render` for neutral front, top, rear, side and underside stills. Those images and raw logs belong in ignored `.experiments/kestrel-blender/`; they are not tracked deliverables. The source `.blend` retains individually editable components; only the GLB export copies are consolidated. The exporter uses Blender's stock glTF 2.0 exporter.

## Runtime contract

Metres, local +Z forward and +Y up; the root runtime owns world pose and adhesion. The lowest induction hardware is near Y=0. Two identity-rotation empties, `Exhaust_L` and `Exhaust_R`, place the rear propulsion origins. Their local aft direction is -Z. Read `asset-manifest.json` for measured positions and hull bounds. `Kestrel_Power` is the active cyan aperture material; `Kestrel_Standby` is the restrained induction accent. Runtime effects are separate from the static model and attach to these anchors.

The craft uses ceramic shells with real intake openings, surface-projected livery, a low smoked canopy, continuous graphite lattice spars with true open bays, compact octagonal exhaust cavities with separate formed titanium heat shields and machined retaining lips, and swept canted fins. Static export meshes share twelve named PBR materials. The approved race palette remains pearl, graphite, titanium, restrained vermilion and cyan active propulsion. The user-approved concept supersedes the prior bulky silhouette and no-wing wording for this Kestrel replacement only.
