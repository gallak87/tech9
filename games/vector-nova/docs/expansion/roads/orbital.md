# Asterion Orbital — road finish

Use the [road workflow](README.md). Target `orbital`; no route or construction redesign.

## Starting point

The [production builder](../../../src/levels/orbital/track/production.js) uses the [procedural surface map](../../../src/levels/orbital/track/materials.js) for both color and bump on solid induction cassettes. The same material module adds broad cyan, magenta and blue coatings. [Lattice construction](../../../src/levels/orbital/track/lattice.js) supplies real apertures and separate solid spans.

## Investigate

Establish whether the limiting factor is cassette mapping, material response, relief or illumination. The current painted cassette pattern and color-derived bump are useful places to inspect; they do not mandate a texture replacement. Aim for believable coated alloy, sealed joins and crisp formed edges under orbital light, with a clear distinction between solid decks and open lattice. Preserve the smooth manufactured identity and the broad colored sections.

## Keep and check

Compare an ordinary solid connector, a colored section, an oblique lattice span and a bank transition in chase and free camera. Watch for specular aliasing, emissive color flattening, and material detail crossing real openings. Preserve U-frame construction, guidance and the road-neon distance mapping if UVs change. Check the relevant production/lattice tests when modifying their geometry or attributes; retain CPU construction without a DOM and asset-free shape review.
