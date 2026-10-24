# Map 8 — Zephyr Basilica sky panorama

Selected source: [reference-guided panorama](zephyr-sky-v2.png) and [exact generation prompt](sky-prompt-v2.txt).

Generated with the built-in imagegen tool using the project's [original scene drawing](zephyr-scene-reference.png) as the image reference for palette, atmosphere, lighting and celestial detail. The original drawing is preserved unchanged. No external artwork or third-party assets were supplied.

The [earlier generation prompt](sky-prompt.txt), generated without reference images, is retained as a format reference. Its superseded panorama is available in Git history; the selected v2 source and original scene reference remain here.

The PNGs contain bounded image color, not captured HDR radiance. They supply distant atmosphere/space; terrain, architecture, lighting, events and gameplay are authored separately. Preserve native source images when exporting runtime textures.

Runtime selection: v2, compared with the original scene drawing and the earlier procedural worktree backdrop. Its warm cloud edges and violet shadow depth better match the cathedral palette. The native image is served unchanged at `public/assets/levels/zephyr/zephyr-sky-v2.png`. The level shader uses a four-percent longitude overlap, continuous texture gradients at the seam and blended pole averages; the source remains preserved. Scene key/fill lighting is authored separately because the PNG is not HDR data.
