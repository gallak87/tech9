# Glasswake scene assets

## Origin and editable sources

The [selected scene reference](scene-reference.png) and [exact prompt](scene-prompt.txt) were generated with built-in imagegen for this level without external artwork. The drawing establishes cobalt comet ravines, fractured pale ice, clear supported crystal spans, real fracture jumps, a luminous calving cavern and violet-green aurora. Reference pixels do not load as nearby scenery.

The current [glasswake-environment-v5.blend](glasswake-environment-v5.blend) contains editable metre-scale prototype meshes. [finish-environment-v5.py](finish-environment-v5.py) exports `public/assets/levels/glasswake/glasswake-environment-v5.glb`: 65,092 source triangles and 2,953,172 bytes, with no embedded textures. [asset-manifest-v5.json](asset-manifest-v5.json) records the export. CPU geometry/export uses Blender 5.1.1; no GPU render or bake is required.

The rebuild chain requires the original [generate-environment.py](generate-environment.py) scene, [refine-environment.py](refine-environment.py), [author-environment-v3.py](author-environment-v3.py), [finish-environment-v4.py](finish-environment-v4.py), and their input Blender files. Retain these generator dependencies when pruning old runtime exports. No downloaded models or third-party licensing dependencies are involved.

## Image assets

- [aurora-sky-v1.png](aurora-sky-v1.png): original 1774×887 panorama; [exact prompt](sky-prompt.txt) and [sky provenance](SKY_PROVENANCE.md). Its unchanged runtime copy supplies distant atmosphere and reflections. The owned equirectangular backdrop handles the longitude wrap and disposes the texture; reduced motion freezes drift.
- [ice-surface-v1.png](ice-surface-v1.png): original 1254×1254 imagegen glacier tile without reference input; [exact prompt](ice-surface-prompt.txt). The unchanged runtime copy supplies triplanar colour, approximated roughness/relief, frost crust and a restrained transparent-deck veil. These are authored material approximations rather than scanned PBR measurements.

## Runtime construction and presentation

The kit supplies stratified cliffs, eroded vaults/curtains, fractured crevice walls, an ice-encased inclusion, crystal arches, landing shelves, dock hardware and layered calving pieces. Runtime consolidates opaque template primitives while preserving geometric faults, normals and vertex material attributes; emissive, ceramic and metal parts remain separate. Clear road panes retain visible ribs/canyon beneath local clouds, veins and trapped-air detail. Their existing ice tile also supplies shallow metre-scaled relief and fine grain, with rougher inclusions and stronger grazing reflection; frost and scenery retain their separate finishes. No additional road texture is allocated.

Support placement probes closed geological triangles during readiness, embeds shoes in verified contact and excludes moving skins and detached fragments. Local cavern illumination, aperture light and Thawlight Return tint derive from saved scene lighting and restore borrowed values on reset/disposal. Scenery and moving events retain route/flight/camera clearance checks.

The opening Mouth roof is partitioned into sixteen fragments of the existing v5 geometry, with source-native cut faces, fracture seams and bounded powder. A fixed-step once-per-session ledger preserves the fallen state through laps/recovery and restores it for a fresh session. The later calving shelf separates at the second fracture takeoff; displayed world pose advances the reveal through flight without changing physics/checkpoints. Staggered falling slabs/chips expose the lit cavern while remaining clear of the course.

## Atmosphere and audio

The repository weather module and forest adapter informed precipitation, gust clocks and shelter concepts; no framework or external asset was copied. Glasswake owns bounded world snow, cavern exposure, blizzard fog, peripheral frost/flakes and melt beads. HUD snow uses cached code-authored canvas sprites; clipping keeps telemetry, minimap and touch input clear. Snow does not alter handling. Simulation time drives pause/reset/replay, and reduced motion freezes decorative travel while preserving factual cues.

Ice cracks and snow rushes are original deterministic stereo synthesis in `src/levels/glasswake/audio.js`, using the existing audio context; no recording or licensed sound asset is included.
