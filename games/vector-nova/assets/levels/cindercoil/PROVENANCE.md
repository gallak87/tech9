# Cindercoil scene, geometry and surfaces

The selected [scene drawing](reference/cindercoil-scene-v1.png) was generated with built-in `image_gen.imagegen` on 2026-09-29. Its [exact prompt](reference/prompt.txt) is preserved. The [selected ash sky](SKY_PROVENANCE.md) uses that original drawing as its reference. No external source artwork, textures or meshes were supplied.

The Blender generators translate the drawing's layered fault, thick lava channels, cooling crust, hollow tower and broken ceramic launch supports into original geometry. They use seeded CPU modeling/export with Blender 5.1.1, without rendering. Each version retains its editable `.blend`, runtime `.glb` and `asset-manifest*.json`; run the corresponding generator with Blender in background mode.

| Version  | Generator                                        | Main changes                                                     |
| -------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Original | [build_cindercoil.py](build_cindercoil.py)       | Caldera, channels, crust, tower and launch kit                   |
| v2       | [build_cindercoil_v2.py](build_cindercoil_v2.py) | Slumped cooling-flow aprons and fractured edge bevels            |
| v3       | [build_cindercoil_v3.py](build_cindercoil_v3.py) | Coherent channel surfaces and smaller embedded crust             |
| v4       | [build_cindercoil_v4.py](build_cindercoil_v4.py) | Fractured ridges, hollow cooled tube roofs and ash pockets       |
| v5       | [build_cindercoil_v5.py](build_cindercoil_v5.py) | Basalt diffuse response to cool ash lighting                     |
| v6       | [build_cindercoil_v6.py](build_cindercoil_v6.py) | Rooted intake beds and distinct central/side cascade proportions |

The current kit is `public/assets/levels/cindercoil/cindercoil-hero-kit-v6.glb`. Original and intermediate sources/exports remain preserved. The original authored construction is a lightweight approximation of the concept rather than a photogrammetric reconstruction or fluid simulation. The track owns the driving surface, real flight gap and collision rules; scenery remains outside its tested road/camera envelope.

[basalt-albedo-v1.png](basalt-albedo-v1.png) is an original diffuse surface tile generated with built-in imagegen on 2026-09-30 without references or external art. Its [exact prompt](basalt-prompt-v1.txt) and native pixels are preserved; the runtime copy is unchanged. World-space triplanar sampling and shader-derived relief cover authored terrain/rock. This surface detail does not replace nearby modeled scenery.

The game-owned bounded ash, source plumes, embers, local heat veil and peripheral canvas are in `src/levels/cindercoil/atmosphere.js` and `overlay.js`. Exposure/receiving logic is informed by the repository weather module and forest adapter; no weather source or external assets were copied. Wall opening, cascade pulse, separating/falling crust and vent state follow deterministic simulation time. Reduced motion removes drift, shimmer and decorative motion while retaining event state and contact feedback. Shape review requests no production kit/sky/surface texture. Sources are unserved; raw verification evidence stays ignored.
