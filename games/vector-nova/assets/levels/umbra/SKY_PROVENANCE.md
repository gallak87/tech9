# Map 10 — Umbra Fold sky panorama

Selected source: [reference-guided panorama](umbra-sky-v2.png) and [exact generation prompt](sky-prompt-v2.txt).

Generated with the built-in imagegen tool using the project's [original scene drawing](umbra-scene-reference.png) as the image reference for palette, atmosphere, lighting and celestial detail. The original drawing is preserved unchanged. No external artwork or third-party assets were supplied.

Earlier source: [first panorama](umbra-sky-v1.png) and [its exact prompt](sky-prompt.txt), generated without reference images.

The PNGs contain bounded image color, not captured HDR radiance. They supply distant atmosphere/space; terrain, architecture, lighting, events and gameplay are authored separately. Preserve native source images when exporting runtime textures.

Runtime export: `public/assets/levels/umbra/umbra-sky-v2.png` is an unchanged copy of the native 1774 × 887 selected source (SHA-256 `8fac2322a75fb24eb4fe57b6f3ea1ac3a9064c8d02b72bd729d0649c4f119fd4`). It loads as sRGB with repeating longitude, continuous projection derivatives, a small wrap overlap and averaged pole colors. Restrained shader exposure suppresses the panorama’s soft stellar blobs; separately authored point stars retain fine depth. The backdrop owns and disposes its texture once.
