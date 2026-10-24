# Map 6 — Cindercoil sky panorama

Selected source: [reference-guided panorama](cindercoil-sky-v2.png) and [exact generation prompt](sky-prompt-v2.txt).

Generated with the built-in imagegen tool using the project's [original scene drawing](reference/cindercoil-scene-v1.png) as the image reference for palette, atmosphere, lighting and celestial detail. The original drawing is preserved unchanged. No external artwork or third-party assets were supplied.

The [earlier generation prompt](sky-prompt.txt), generated without reference images, is retained as a format reference. Its superseded panorama is available in Git history; the selected v2 source and original scene reference remain here.

The PNGs contain bounded image color, not captured HDR radiance. They supply distant atmosphere/space; terrain, architecture, lighting, events and gameplay are authored separately. Preserve native source images when exporting runtime textures.

Runtime export: `public/assets/levels/cindercoil/cindercoil-sky-v2.png`, copied unchanged from the selected 1774×887 native PNG. The local backdrop maps it spherically with a blended longitude overlap and analytic UV derivatives; the source remains intact. The last few degrees at each pole blend the source-row mean to soften panorama pinching. Shape review uses a neutral sky.
