# Track models and geometry

All circuits share a renderer-independent route: `sample(distance)` wraps physical metres and returns position, tangent, right, up, quaternion, curvature and bank. Road, ship, collision and camera use that same frame. Units, handedness, metadata and level-loading APIs are documented in the [level contract](../../docs/EXPANSION_LEVEL_CONTRACT.md).

## Shared building blocks

- `frames.js`: continuous parallel transport through vertical tangents, inversions and the closed seam.
- `geometry.js`: cross-section sweeps, beams, boxes and road-conforming seals; it also still contains Halcyon-specific texture/sign helpers.
- `surface.test.js` / `lighting.js`: surface regressions and continuously faded practical lights.

These are existing implementation helpers, not yet a frozen universal authoring kit. Geometry-helper extraction is a separate roadmap item. Each circuit still owns its route, profiles, materials, structural layout and clearance requirements.

## Existing sources

| Circuit  | Route and construction                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Halcyon  | Root `model.js`, `index.js`, `supports.js`: compact city circuit with distributed vertical events and engineered city supports. |
| Asterion | `level2/`: orbital route, production deck, lattice spans and structural clearance.                                              |
| Nacre    | `level3/`: ocean route, open jump intervals, receiving roads and specialized flight adapter.                                    |

The small adapters in `src/levels/` select these approved builders. New levels own `src/levels/<slug>/` and should use the documented shared entry point rather than add another branch in core.

Keep authored distances, dimensions and scenario locations in the model instead of repeating them in documentation tables. Preserve editable generators and asset provenance. Numerical tests cover frames, route continuity, surfaces and clearances; short production checks and human driving review establish the visual and gameplay result.
