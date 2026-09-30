# Saffron Leviathan assets

`scene-reference.png` was generated with the built-in imagegen tool on 2026-09-29 for this level. It is the selected modeling reference, not a runtime background. No external asset packs or borrowed textures are used.

Prompt: “3D game scene concept reference for Blender modeling. Saffron Leviathan: archaeological alien desert at impossible scale, pale stratified bone fossil with a traversable huge skull mouth and open interior, mismatched broken vertebrae, living segmented burrower breaching alongside the fossil. A 32-metre thick smoked-gold glass ribbon descends into the skull, banks inside with bright exit skylights, and jumps across vertebrae. Tiny hover racer for scale. Split low horizontal baffles, layered saffron dunes, slow sandfalls through porous ribs. Dry lavender haze, pale sun, long shadows, warm readable sand-bounce interior. No text or watermark.”

`build_saffron.py` is the reproducible editable Blender source; `leviathan-kit.blend` is its saved Blender 5.1.1 scene. Run Blender in background with the script to export `public/assets/levels/saffron/leviathan-kit.glb`. Modeling and export used CPU only. The kit includes the skull shell with actual orbital/skylight holes, mandibles and teeth, layered vertebral processes, eroded rib arch, displaced dune patch, modeled sandfall ribbon and a plated burrower with jaws and protected eyes. Materials are authored PBR solids. Landscape shading, sand boundary motion and creature animation are authored in the level.

Approximation: surface porosity is represented by real large openings, mineral seams and layered anatomy rather than dense sculpted microcavities. The burrower uses deterministic world transforms and segment motion rather than a biological simulation. Sandfall surfaces and grains complement fixed geological meshes.

Module origins and polygon counts are in `asset-manifest.json`. All authored files are project-owned; no third-party attribution or license dependency was introduced.
