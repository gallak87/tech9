# Route and geometry helpers

All circuits share the renderer-independent route contract: `sample(distance)` wraps physical metres and returns position, tangent, right, up, quaternion, curvature and bank. Road, ship, collision and camera consume that frame. Units, handedness, metadata and ownership are defined in the [level API](../../docs/EXPANSION_LEVEL_CONTRACT.md).

Optional shared helpers live here: `frames.js` transports frames and offsets frame-local points; `geometry.js` sweeps caller-owned profiles and builds beams, boxes and road-conforming seals; `lighting.js` selects continuously faded practical lights. `../environment/placement.js` provides horizontal placement frames and sampled route clearance.

Each circuit owns its route, profiles, materials, textures, support layout and scenery rules in `src/levels/<slug>/track/`, `environment/` and `backdrop/`. Halcyon’s city textures and fixture layout are local, as are Orbital’s lattice and Nacre’s ocean/flight systems. Shared helpers are optional; they supply no world preset or universal road profile.

Run `npm test` for numerical regressions, `npm run lint` for formatting/source checks and `npm run build` for the selected-level bundles. Authored driving, camera/scenery clearance and visual checks remain necessary.

## Optional authoring helpers

- `createReferenceFrames(tangents, step, closed = true)` takes unit Three.js tangents and metre spacing. Closed input includes the duplicated final seam tangent; open routes pass `false`. The helper transports through vertical directions and distributes closure twist. Degenerate or antiparallel neighbours fail with a request to refine sampling. It does not alter caller vectors or prescribe a bank/roll schedule.
- `framePoint(frame, right, up, forward = 0)` offsets a point along the supplied road axes without mutating them.
- `sweepGeometry(track, profile, { start = 0, end = track.length, step = 6, uvScale = 16 })` sweeps caller-supplied `[right, up]` points with hard edges between faces. It accepts open/closed profiles and unwrapped ranges, includes both range endpoints and copies scratch sampler results. Ranges, positive steps/UV scale and profile faces are validated; requests above one million vertices fail before allocation. Callers own and dispose the returned geometry.
- `boxProfile` and `beamTransform` are dimension/transform helpers, not road templates. `roadSealGeometry` clips details to the rendered triangles of a full-lap, two-point sweep surface. Supply that top strip, not a multi-face deck; spacing/breadth/offset remain caller choices.

The [placement helper](../environment/placement.js) exposes `createRouteClearance(track, options)` with historical defaults `spacing: 8`, `sidePadding: 11`, `localVertical: [-14, 22]`, `longitudinalHalfLength: 10`, `supportPadding: 2`. It projects road-local boxes into conservative world AABBs and includes optional `supportFootprints`. `clears(x, z, width, depth, top, yaw = 0, bottom = track.groundY)` tests an upright object footprint with its real vertical interval. `top: Infinity` and `bottom: -Infinity` explicitly reserve an unbounded vertical parcel; NaN/missing bounds fail. A missing `groundY` is valid: supply `bottom` for every query. Levels choose envelopes and sampling appropriate to their actual road, ship, camera and terrain. Defaults preserve approved circuits; they are not universal safety dimensions. Sampled overlap cannot prove clearance between samples, and coarse AABBs may reject valid placements. Keep detailed authored checks, especially at sharp curves, crossings and flight gaps.

`groundFrame(track, distance)` is an optional world-up placement frame for upright infrastructure, with a finite fallback at vertical route tangents. Road-owned geometry continues to use the actual sampled road frame. `transformedPartBounds(entries, parentMatrix)` in [bounds.js](../environment/bounds.js) transforms actual geometry bounds for entries with `{ geometry, matrix }`; it owns no resource and chooses no materials. Orbital uses it for complete assembly clearance. Nacre's extra airborne corridor remains local.

Use [the reusable checks](../../tools/level-checks/README.md) for CPU route/module contracts and short hidden runtime verification.
