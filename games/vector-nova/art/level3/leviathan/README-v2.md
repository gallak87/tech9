# Larger leviathan source — v2

This is the user-directed creature art revision for the breach above the first jump. The v1 concept and model are preserved alongside it.

The native model is now **280 m long**. Runtime deformation should use its native coordinates without the temporary 1.555 length or 1.4 thickness multipliers. GLTF uses +X from nose to tail, +Y dorsal and +Z starboard. The model's actual complete bounds are approximately 282.076 × 28.266 × 30.762 m, including the tiny muzzle seam and trailing fin tip; its maximum radial extent is 17.166 m. A 24 m radius is the conservative art envelope.

The revision replaces the paired geometric head strips with one rounded bony crown, fuller cheek and neck mass, a soft lower lip and raised breathing-gill folds. Curved overlapping nacre scutes leave channels of living hide between rows. The lower fins have scalloped edges and skin-colored structural ribs. Living cyan markings use dimmer interrupted photophore chains. The final revision adds real GLTF `COLOR_0` vertex data to hide, shields and fins: restrained head mottling, darker shield growth edges and a muted belly-to-flank transition. The exported material roughness is 0.38 for hide, 0.49 for pearl and 0.48 for fins; these changes are visible in both Blender and the game material data, with no procedural texture dependency.

The GLB contains **35,772 triangles**, five material draws, no image textures and no decoder dependency; it is 917,044 bytes. `nacre-leviathan-v2.blend` retains the five editable mesh groups and the weighted 31-station armature. `build-model-v2.py` rebuilds only this version in a separate background Blender process.

The integrator owns runtime path, timing, first-jump placement, water attenuation and numerical collision-clearance verification. Contextual authoring renders use that exported path, actual track geometry and chase-camera values. No gameplay or browser testing is part of this revision.

The final GLB SHA-256 is `7144cf836dc045fc5e174af655397fd77b25bfc3d9fc11a639b5986a1a627844`. The neutral straight mesh is the editing rest pose; runtime arc-length transport supplies the curved breach and crossing.
