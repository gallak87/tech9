# Nacre Tempest — road finish

Use the [road workflow](README.md). Target `nacre`; preserve the ocean and flight presentation.

## Starting point

The [production road](../../../src/levels/nacre/track/production.js) builds real beveled ceramic plates, glazed areas and submerged pressure membranes. The local [finish shader](../../../src/levels/nacre/track/surface-finish.js) adds metric fitted rims, distance-filtered fine grain beneath physical clearcoat/iridescence, filtered growth tint and denser pressure-insert edges. Ceramic/glazing borrow the static district probe; the small procedural normal map belongs to the gills. Source comments record a prior failure: correlated broad normal/roughness patterns produced repeated angular sheen at chase distance.

## Investigate

Check whether the pearl surface, fitted edges and distinct glaze/membrane response read convincingly under the existing storm light and underwater absorption. Find the actual limiting view before adding detail. The goal is substantial ceramic and pressure construction, with coherent highlights and depth, rather than uniformly noisier or shinier panels. Any new relief must demonstrate that it avoids the earlier repeated-sheen problem.

## Keep and check

Compare a dry exposed connector, a glazed section, a submerged membrane and a water crossing, plus both receiving decks and the ascent back through the waterline. Save matching fly-camera positions for these transitions and chase views above and below water; a single showcase angle is insufficient. Inspect triangle diagonals, highlight continuity, transparency sorting and detail in motion. Keep the [water crossings](../../../src/levels/nacre/environment/water-crossings.test.js), gap boundaries, road contact, underwater visibility and [flight runtime](../../../src/levels/nacre/track/runtime.js) intact. A surface change must not hide the upcoming route or change water/landing behavior.
