# Kestrel Concept 01 — independent review

Completed formal rounds: **2 / 8**. **Stopped at the first verified pass.** Target: every applicable category at least
9/10, with no critical functional failure. Stop at the first verified pass or
eight completed rounds; human approval remains separate. Builder self-QA before
the first frozen candidate does not count as a formal critic round.

Scope: the user-approved jet-like Kestrel concept, its real Blender source/export,
and its integration into the existing Halcyon and Asterion runtime. The user's
later request for a more powerful blue engine beam supersedes the earlier
restrained-exhaust direction. Closed level gates and unrelated game systems are
outside this review.

## Round 1 — revisions required

Candidate: asset revision 3, GLB SHA-256
`05437ca9bd862075f28ca0821e9cea2c3d5786a584a552d94be7f016399138cc`;
production script `index-zDDLntrq.js`.

| Category                            | Score | Finding                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silhouette / concept fidelity       | 8.5   | The thin split prow, slim shoulders, restrained fins and compact twin exhausts clearly replace the old bubbly body. The canopy crest still reads inflated above the spine, and aft pod transitions are more block-like than the approved connected aerospace surfacing.                                 |
| Hard-surface construction           | 7.5   | Real intake openings and seated paint improved the top. Undershell shading visibly ripples/pinches, while exposed rectangular spars and flat lower rails read as separate pieces without convincing load-path connections. The rear collars remain simple octagonal extrusions with line divisions.     |
| Material / light response           | 8     | Ceramic, dark canopy and active cyan are distinct. Titanium and graphite lack the restrained surface/roughness distinction and layered engineering visible in the concept; broad aft surfaces read as uniform gray slabs. Underside normal artifacts also break the finish under neutral light.         |
| Game readability / propulsion       | 8.5   | Chase view is clear in both worlds and the stronger blue boost beam feels powerful. The nozzles and road remain readable. A close rear-quarter inspection exposes hard polygon/step boundaries in the emission near floor/shadow intersections, also visible in the standard rear-boost studio capture. |
| Technical asset fitness / lifecycle | 9     | The actual compact Blender GLB loads before readiness, has finite geometry and matching anchors, stays within the prior hardware budget, and passes independent instance/disposal/borrowed-resource checks. This score covers the asset and tested integration only.                                    |

Priority repairs:

1. Repair underside topology/normal continuity and connect the exposed supports
   into a deliberate swept structure with visible attachment seats. Preserve the
   useful negative space instead of filling it with thick sidewalls.
2. Refine the aft package with a shaped transition, retaining lip, recessed throat
   and restrained heat-shield construction. Use material response and a few
   purposeful details instead of random greeble. Seat the canopy lower into its
   aft spine while keeping the long pointed shape.
3. Remove the hard polygon/step silhouette from the blue emission when viewed
   close from the rear quarter. Preserve the newly approved power, clear nozzle
   hardware and unobstructed road sightline.

Evidence inspected: five actual Blender views; six runtime studio angles;
Halcyon/Asterion high and low chase/boost/bank captures; both inspection screens
and portrait fit. Root's hash-matched runtime report records 16/16 checks and no
browser/resource errors. The critic independently parsed the GLB (Khronos Blender
exporter, 11 meshes/materials, 36,510 triangles, 978,364 bytes, no external buffer
or texture references), reran all five ship asset/lifecycle tests, and performed
brief real-key throttle/boost/release/steer and inverted-boost checks in hidden
Chrome. Those checks produced no browser errors, correctly released boost and
kept the hull/beam aligned to the inverted road. An intentional short steering
input reached the rail; the existing contact response was not treated as a ship
failure.

Transient evidence remains ignored under `.experiments/kestrel-blender/`,
`.experiments/kestrel-runtime/round-1/` and
`.experiments/kestrel-critic/round-1/`; no review images are deliverables.
Foreground frame-rate certification, physical devices and audio listening remain
unverified. This is not an all-category pass or human approval.

## Round 2 — scoped ship target met

Candidate: asset revision 4, GLB SHA-256
`3016cd0c386c57499866d7010115d86fa1d32f3ad05b3ef8a23d71b16a3e7c24`;
production script `index-m0NWyJ1x.js`.

| Category                            | Score | Verified result                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silhouette / concept fidelity       | 9     | The lowered, elongated canopy seats into the graphite spine. Thin split blades, swept shoulders, restrained fins and compact angular twin propulsion give the approved lean jet-like racing silhouette.                                                                                   |
| Hard-surface construction           | 9     | Undershell pinching is removed. Continuous attached webs keep real triangular openings beneath the ceramic shoulders. Formed aft petals, compression/retaining lips and recessed throats replace the plain extrusions. Seated markings and recessed intakes remain coherent across views. |
| Material / light response           | 9     | Pearl coating, dark glass/composite, warmer satin titanium and active cores separate in neutral Blender light and both game worlds. Aft surface highlights now reveal construction, while the underside keeps intentional planes.                                                         |
| Game readability / propulsion       | 9     | The stronger blue beams remain powerful and distinct from cruise in high and low settings. Revised compositing removes the prior hard stepped shadow boundary inside the dense core. Close rear views keep the nozzle hardware readable; chase views retain the upcoming road.            |
| Technical asset fitness / lifecycle | 9     | The frozen 1,291,864-byte GLB has 43,022 triangles and 12 material meshes, unchanged hardware envelope/anchors, and passes all five independently rerun asset/lifecycle tests. Matching production capture passes 16/16 checks with no browser/resource errors.                           |

All Round 1 blocking findings are resolved. The critic compared refreshed Blender
front/top/rear/side/underside views, hash-matched runtime studio/front/rear-detail/
boost/underside captures and game high/low views, then independently repeated a
short real-key Orbital throttle/boost/release check and close front/rear studio
inspection. No browser errors or impacts occurred; boost released correctly.
The frozen asset SHA was verified directly. The earlier inversion alignment and
responsive inspection checks remain applicable because pose and fit contracts
were unchanged; the root also repeated production high/low and portrait capture
for this asset.

No further model or critic round is requested: stop at **2 / 8** and present this
candidate for human playtest. Scores describe this scoped ship implementation,
not a new certification of the entire game. Artistic preferences can still be
steered by the human review. Foreground performance, physical device use and
audio listening remain unverified, unchanged from Round 1.

Temporary R2 evidence remains under `.experiments/kestrel-blender/`,
`.experiments/kestrel-runtime/round-2/` and
`.experiments/kestrel-critic/round-2/`.
