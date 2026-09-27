# Pinewatch Hunt — game-specific assets

The woodland buck, antlers, recurve bow, nocked arrow, glove/sleeve, directional coat texture, fur microtexture and wood grain are original procedural assets authored for this game in `src/game/models.js`. Their editable source is the JavaScript geometry and deterministic texture generator in that file. No remote assets, downloaded animal models, stock audio or third-party character textures are used by these models.

The geometry, generated textures and their source are provided under the same license as this repository. They introduce no additional third-party licensing requirements. Existing forest assets retain the separate provenance and licenses recorded in `public/assets/ASSETS.md` and `public/assets/textures/SOURCES.md`.

Model convention: metres, +Y up, deer feet at the ground plane with forward along +X. Deer animation is contained in a child rig and never overwrites its owning world transform. The bow is attached to the first-person camera, whose forward direction is -Z. Both factories own and dispose their geometries, materials and generated textures.

The game-owned trail sign and split-hoof decals are original Canvas/Three.js shapes in `src/game/encounter.js`. No external source assets are needed to rebuild them.
