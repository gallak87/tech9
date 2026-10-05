# Map 9 — Helion Flare sky panorama

Selected source: [reference-guided panorama](helion-sky-v2.png) and [exact generation prompt](sky-prompt-v2.txt).

Generated with the built-in imagegen tool using the project's [original scene drawing](reference/thermal-observatory-scene.png) as the image reference for palette, atmosphere, lighting and celestial detail. The original drawing is preserved unchanged. No external artwork or third-party assets were supplied.

Earlier source: [first panorama](helion-sky-v1.png) and [its exact prompt](sky-prompt.txt), generated without reference images.

The PNGs contain bounded image color, not captured HDR radiance. They supply distant atmosphere/space; terrain, architecture, lighting, events and gameplay are authored separately. Preserve native source images when exporting runtime textures.

Runtime export: `public/assets/levels/helion/helion-sky-v2.png`, an exact copy of the selected native PNG. The camera-following spherical shader uses continuous analytic longitude derivatives, a small overlap blend and averaged pole colors, with subdued radiance. A separate modeled sphere supplies the structured stellar photosphere; the star limb and both animated prominence assemblies remain authored 3D effects. The level owns and disposes the sRGB texture.
