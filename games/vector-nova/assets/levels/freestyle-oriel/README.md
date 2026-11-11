# Sunvault civic works

Original Blender construction kit for Freestyle Oriel's founded arrival courts and road supports. The [Oriel reference](../oriel/reference/oriel-original.png) and its [exact prompt](../oriel/reference/original-prompt.txt) establish the warm mineral civic architecture; this kit supplies new course-local load-bearing forms.

Rebuild from the game root with `blender --background --python assets/levels/freestyle-oriel/build_civic_works.py`. The retained blend has editable source components and separate runtime batches consolidated by the three material roles. The generated manifest records actual exported bounds, triangles, sockets and hashes.

All exported roots are identity transforms in metres, glTF Y-up. `anchor_pier` runs from Y0 to1000; scale only its Y axis to the actual founded height. `arrival_terrace` is200×180m with its civic court atY54. Its arcades are real full-depth openings around a recessed connected core. `load_cradle` is74×36m, entirely belowY−3.4, with a closed bearing cap and two open transverse compression arches. It adds no racing/contact triangles.

The scalar materials are `WarmLimestone`, `coolrecess` and `agedbronze`; the environment owner may bind the canonical Oriel mineral finish. No maps, third-party meshes or baked lighting are embedded. Do not replace approved driving surfaces or copy the treatment across the course before reviewing the representative arrival.
