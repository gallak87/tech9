# Nacre leviathan

The game loads one original 280 m creature from `public/assets/levels/nacre/leviathan/nacre-leviathan-v2.glb`. [nacre-leviathan-v2.blend](nacre-leviathan-v2.blend) retains five editable mesh groups and a weighted 31-station armature; [build-model-v2.py](build-model-v2.py) rebuilds it in an isolated background Blender process. [concept-v1.json](concept-v1.json) records the original generated concept and exact prompt. No external model, texture or decoder is required.

Metres; GLTF +X points nose-to-tail, +Y dorsal and +Z starboard. Full bounds are approximately 282.076 × 28.266 × 30.762 m, including muzzle/fin tips. Maximum radial extent is 17.166 m; use 24 m as the conservative art envelope. Runtime uses native coordinates without additional length/thickness scaling.

The GLB contains 35,772 triangles, five material draws, no image textures and 917,044 bytes. Original vertex colours supply hide mottling, nacre growth edges and belly variation. The [model manifest](model-manifest-v2.json) records its geometry contract. SHA-256: `7144cf836dc045fc5e174af655397fd77b25bfc3d9fc11a639b5986a1a627844`.

`src/levels/nacre/environment/leviathan/` owns two presentation-only appearances: a curved first-jump breach and a left-to-right underwater crossing. One loaded body follows arc-length paths; speed-aware timing, pause/reset, reduced motion and disposal never mutate vehicle or race state. The straight mesh is its editing rest pose. Older v1 source/export files are not loaded by the game.
