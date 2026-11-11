# Saffron Ossuary cortical web

Retained as an editor reference. The live course now uses the connected
[cranio-thoracic landscape](cranio-thoracic/README.md).

`build_cortical_web.py` authors one original fused, closed branching cortical
web for the existing skull encounter. It follows the original Saffron fossil
concept and the project's `cranial_webs.py` modeling language without modifying
the canonical kit. Three broad tapering plates, unequal forks, seated fanned
roots and actual depth replace an empty far-mouth vista; the original skull
encloses two unequal upper cells and the broad road opening below remains clear.

Run `blender --background --factory-startup --python
assets/levels/eliminator-saffron/build_cortical_web.py` from the game directory.
The saved Blend retains the original editable control meshes and fusion
modifiers alongside the exported result. The source reference is packed for
editing, never exported as a runtime image.

The runtime identity root `cortical_web` uses the original skull's native
coordinates in metres: +X lateral, +Y up, +Z forward. The existing passage
fitter places it at fraction 0.245 and scale 1.2. All central geometry stays
above native Y45. `cortical_socket_A/B/C` are surveyed real canonical pale-cortex
surface contacts; their fanned roots penetrate three metres into those surfaces.

The geometry carries the canonical `Saffron_pale_fossil`, `Saffron_chalk_edges`
and `Saffron_marrow_ochre` roles plus a real geometry-derived broad cavity
vertex-colour bake. There are no embedded runtime textures. The existing local
Saffron mineral finish may be applied by the environment owner.

`cortical-web-manifest.json` retains the exact original image prompt, reference,
source/Blend/runtime/material-source hashes, actual bounds, topology, bake and
socket metadata. The source, concept and modeling techniques are project-owned;
no third-party asset dependency is added. In-game clearance, native-view review
and the central asset registry belong to the course integration owner.
