# Terrain texture provenance

Locally bundled 1K JPEG PBR maps, downloaded 2026-09-24 from Poly Haven's public asset API. All are **CC0 1.0**: https://polyhaven.com/license

- `forest-floor-{color,normal,roughness}.jpg`: [Forest Floor](https://polyhaven.com/a/forest_floor), original files `forest_floor_diff_1k.jpg`, `forest_floor_nor_gl_1k.jpg`, `forest_floor_rough_1k.jpg`.
- `path-{color,normal,roughness}.jpg`: [Brown Mud Leaves 01](https://polyhaven.com/a/brown_mud_leaves_01), original files `brown_mud_leaves_01_diff_1k.jpg`, `brown_mud_leaves_01_nor_gl_1k.jpg`, `brown_mud_leaves_01_rough_1k.jpg`.

The map shader blends the original scans in world space. Grass/fern/leaf geometry is original runtime-authored mesh content; it has no external texture dependencies.
