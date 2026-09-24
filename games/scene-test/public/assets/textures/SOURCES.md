# Terrain texture provenance

Locally bundled 1K JPEG PBR maps, downloaded 2026-09-24 from Poly Haven's public asset API. All are **CC0 1.0**: https://polyhaven.com/license

- `forest-floor-{color,normal,roughness}.jpg`: [Leafy Grass](https://polyhaven.com/a/leafy_grass), original files `leafy_grass_diff_1k.jpg`, `leafy_grass_nor_gl_1k.jpg`, `leafy_grass_rough_1k.jpg`.
- `path-{color,normal,roughness}.jpg`: [Brown Mud](https://polyhaven.com/a/brown_mud), original files `brown_mud_diff_1k.jpg`, `brown_mud_nor_gl_1k.jpg`, `brown_mud_rough_1k.jpg`.

The map shader blends the original scans in world space. Photographed grass and fern models are embedded in `forest-kit.glb`; their CC0 source and Blender conversion are documented in `../ASSETS.md`.
