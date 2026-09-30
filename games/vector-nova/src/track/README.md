# Route and geometry helpers

All circuits share the renderer-independent route contract: `sample(distance)` wraps physical metres and returns position, tangent, right, up, quaternion, curvature and bank. Road, ship, collision and camera consume that frame. Units, handedness, metadata and ownership are defined in the [level API](../../docs/EXPANSION_LEVEL_CONTRACT.md).

Optional shared helpers live here: `frames.js` transports frames and offsets frame-local points; `geometry.js` sweeps caller-owned profiles and builds beams, boxes and road-conforming seals; `lighting.js` selects continuously faded practical lights. `../environment/placement.js` provides horizontal placement frames and sampled route clearance.

Each circuit owns its route, profiles, materials, textures, support layout and scenery rules in `src/levels/<slug>/track/`, `environment/` and `backdrop/`. Halcyon’s city textures and fixture layout are local, as are Orbital’s lattice and Nacre’s ocean/flight systems. Shared helpers are optional; they supply no world preset or universal road profile.

Run `npm test` for numerical regressions, `npm run lint` for formatting/source checks and `npm run build` for the selected-level bundles. Authored driving, camera/scenery clearance and visual checks remain necessary.
