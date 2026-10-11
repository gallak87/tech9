# Umbra Fold — road finish

Use the [road workflow](README.md). Target `umbra`; coordinate shared assets with the [wide companion](umbra-wide.md).

## Starting point

The [production road](../../../src/levels/umbra/track/production.js) already has beveled graphite cassettes, continuous deck normals, panel coordinates and explicit tangents for formed metal. [Finish shaders](../../../src/levels/umbra/environment/materials.js) combine procedural relief/roughness with the [authored surface atlas](../../../src/levels/umbra/environment/surfaces.js). Physical fixtures provide pooled local light; the finish helper also serves observatory assets.

## Investigate

Determine what limits the existing work before layering more detail onto it. Look for strong material separation between graphite, cold metal and repairs, with legible cassette depth in both practical light and the warm accretion environment. Test scale, broad finish response and directional highlights. Additional grime or procedural complexity is justified only by a visible benefit in the racing view.

## Keep and check

Compare a normal connector, a lamp-lit repair, the descending/inverted fold and a pale receiving deck. Protect normal/tangent continuity, guidance contrast and the view of the earlier grid. Preserve tidal zones, curved jump envelopes, physical fixtures and collision geometry. Avoid accidentally changing all masonry through the shared finish helper. A change to `umbra-surfaces-v1.png` affects the wide variant too; verify both slugs and refresh all affected menu stills.
