# Asterion Orbital — road finish

Use the [road workflow](README.md). Target `orbital`; no route or construction redesign.

## Starting point

The [production builder](../../../src/levels/orbital/track/production.js) binds the [coated-alloy PBR finish](../../../src/levels/orbital/track/deck-finish.js) to solid induction cassettes, with original editable [map sources](../../../assets/levels/orbital/deck/build.py). The [material module](../../../src/levels/orbital/track/materials.js) adds broad cyan, magenta and blue coatings. [Lattice construction](../../../src/levels/orbital/track/lattice.js) supplies real apertures and separate solid spans.

## Investigate

Establish whether the limiting factor is cassette mapping, material response, relief or illumination. The finish uses separate albedo, normal and packed material maps; evaluate their scale and light response before adding detail. Aim for believable coated alloy, sealed joins and crisp formed edges under orbital light, with a clear distinction between solid decks and open lattice. Preserve the smooth manufactured identity and the broad colored sections.

## Keep and check

Compare an ordinary solid connector, a colored section, an oblique lattice span and a bank transition in chase and free camera. Watch for specular aliasing, emissive color flattening, and material detail crossing real openings. Preserve U-frame construction, guidance and the road-neon distance mapping if UVs change. Check the relevant production/lattice tests when modifying their geometry or attributes; retain CPU construction without a DOM and asset-free shape review.
