# Level module API

The shared app discovers circuits under `src/levels/<slug>/`. This document defines the shipped metadata, factories, ownership and runtime options. Session adapters also follow the [session runtime contract](GATE4_RUNTIME_CONTRACT.md).

## Discovery and metadata

Each level supplies two files:

- `metadata.js`: default-export an asset-free object with `id` matching the folder, `name`, numeric `order`, boolean `shape`/`review`, and `ui` copy. Metadata feeds the paddock picker, briefing and review controls.
- `index.js`: default-export `createLevel({ shape, features })`, returning the descriptor below. Only the selected implementation is imported. No shared catalog/core edit is required.

Required `ui` strings: `edition`, `subtitle`, `eyebrow`, `intro`, `detail`, `start`, `tag`, `tagDetail`; `heading` is two text strings. Optional `ui.shape` overrides copy for shape review. Optional layout flags are `compact`, `stackedReview`, `lowNotice`, `compactLandscape` and `portraitCompactHud`. Use real text, not HTML. The approved level metadata files are small working examples.

Every level includes shared environment inspection without a metadata flag: F or the Fly Camera button enters, drag looks, WASD and Q/E move at a fixed 200 m/s, and F/Escape/Return restores the previous view. Session time, vehicle and replay recording are frozen. The controller owns its listeners; no level-specific camera fork is needed.

Complete working examples are the [Halcyon descriptor](../src/levels/halcyon/index.js), [Orbital production/shape descriptor](../src/levels/orbital/index.js) and [Nacre custom-runtime descriptor](../src/levels/nacre/index.js). Reuse their factory/ownership pattern, while authoring your own route, assets and presentation.

Unknown slugs, orphaned modules, invalid metadata and missing required factories produce a recoverable error screen. Query text never becomes an arbitrary import path. The default route remains Halcyon; production uses `?level=<slug>` and shape adds `&review=shape` when supported.

## Descriptor and owned components

Required descriptor fields:

| Field                          | Result                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `version`                      | Stable replay/app version string; change when compatibility changes.                                    |
| `createTrack()`                | Track model, or a promise for it.                                                                       |
| `createRoad(context)`          | Owned road component; select neutral shape or production geometry using the factory's `shape` argument. |
| `createEnvironment(context)`   | Owned world component, including scenery and local effects.                                             |
| `createBackdrop({ settings })` | Owned backdrop; see rendering below.                                                                    |

Road/environment context is `{ track, view, host, settings }`. Each component returns `{ group, dispose, ready?, update?, reset?, setReflection? }`. `group` is a Three.js Object3D. Core attaches/removes it; the component releases its own resources. Factories may be async; `ready` may await further owned assets. Boot awaits all of these and shader warmup before marking the app ready. A rejected load unwinds acquired owners.

Each component's `update(frame)` runs once per displayed frame. The frame contains `{ state, ship, camera, settings, time, dt, mode, reviewing, reset }`; `state` is interpolated, `time` is simulation time, and `dt` is zero outside racing. Treat inputs as read-only. `reset` is true on initialization, scenario/replay changes, recovery and fresh sessions; use it to clear presentation history. Inspection/pause must not advance racing effects. `setReflection(texture)` borrows a renderer-owned texture: never dispose it.

Optional descriptor fields: `createRuntime(context)` replaces only the session adapter; otherwise ordinary magnetic motion is used. `createOverlay(context)` returns `{ dispose, update?, afterRender?, reset?, getPresentation? }`. `ship`, `audio` and `effects` pass existing constructor options; `railContactSparks` chooses rail-local spark placement and `practiceSectionsUntimed` labels section practice. These are extension points for declared level-specific rules. Versioned adapters support true jumps, surface response, hazards/heat and environmental forces while preserving defaults for other circuits. Only Halcyon’s adapter loads its exact pickup feature.

## Rendering and camera options

Backdrop result: `{ group, sunDirection, dispose, ready?, update?, setOverview?, assets?, ownedTextures? }`. It owns its sky textures; `assets` may expose borrowed resources to the environment. `ownedTextures` supports resource accounting. Optional light values are `sunColor`, `sunIntensity`, `ambientSky`, `ambientGround`, `ambientIntensity`, `fillColor`, `fillIntensity`, `environmentIntensity` and `far`.

Backdrop `update` receives the same frame during play. Reflection initialization also calls it with camera/settings/time/mode/reset, before vehicle presentation is available; handle that stationary case. No update occurs inside the regular draw call. Nacre's old multi-hook environment is adapted to a single update in its descriptor.

Descriptor `renderer` supports `world` (diagnostic name), `background`, optional `fog: { color, density }`, `bloomStrength`, `bloomThreshold`, `fillHeight`, `reflectionFar` and `contact` options. The selected factory owns sky/world identity; no Halcyon panorama is silently applied to new levels. High/low and reduced-motion settings remain shared.

Descriptor `camera` optionally sets `preserveFlightView`, `portraitAspect` and `maxPortraitScale`. Default chase behavior is unchanged; Nacre explicitly opts into its approved flight/portrait composition. Camera code does not infer behavior from track names.

A descriptor may opt into `camera.safeFrame: { left, right, bottom, top }`, an ordered rectangle in normalized device coordinates within `[-1, 1]`. Core supplies cached ship bounds and the actual displayed ship pose. During grounded chase only, the camera minimally corrects pitch/yaw when those bounds leave the rectangle; its eye position, field of view, road clearance, physics and ordinary look-ahead remain unchanged. The existing rotation damping restores ordinary aim as space permits. Free flight carries the incoming composition, including a corrected grounded view, and landing retains the existing gradual handoff. Inspection/vista and levels omitting `safeFrame` keep their existing behavior. Verify full hull framing and angular continuity through authored tight bends, impacts and flight/landing transitions; this guard does not solve scenery occlusion or an eye inside the ship.

## Track and review contract

Use metres, seconds and radians. Supply unique `id`, `name`, positive finite `length`/`width`, ordered `checkpoints`, contiguous named `sections`, `scenarios`, and `sample(distance)`. Track construction must work without a renderer for CPU verification. Checkpoints use `distance` or `s`; when both are supplied they agree, and an optional `index` matches the array order. Scenarios overlay fresh vehicle defaults, so omitted fields are valid; supplied distance/lateral/speed/heading values must be finite. Sampling wraps physical distance and returns finite `{ position, tangent, right, up, quaternion, curvature, bank }`, optionally unwrapped `roll`. Geometric +X (`right`) appears driver-left when facing +Z; preserve the existing input convention.

Production/shape share one track and its frames. A sampled route may include intervals without rendered road; flight/landing validity and scenery clearance need the level’s own tests. The common route check does not require grounded motion. Sections use `{ id, name, start, end, showcase? }`; a matching `<id>-showcase` scenario enables a parked section start. Runtime scenarios may add `{ label, state }` entries. `review: true` enables fitted 3D/top/profile views. Keep scenery/clearance rules local to the level. Optional [shared geometry helpers](../src/track/README.md) transport frames, sweep caller-owned profiles and test caller-selected clearance envelopes; they prescribe no world, material, terrain or route style.

The [reusable checks](../tools/level-checks/README.md) cover track/module contracts and short hidden runtime behavior, including failure cleanup, selected-asset isolation, controls, pause/reset, review UI and repeated disposal. Authored geometry, scenery clearance and driving still need targeted verification.

Own implementation files under `src/levels/<slug>/track/`, `environment/` and `backdrop/` as useful; those names are organization conventions, not additional required factories. Shared directories contain mechanics used across levels. Existing public asset URLs stay stable across source moves.

## Shared local mechanics

`src/physics/flight.js` exports `DEFAULT_FLIGHT_RULES` and `createFlightModel(overrides)`. A model returns `{ rules, sweptLanding, sweptRail, createRuntime }`; its swept-contact functions accept `(track, jump, beforePose, afterPose[, velocity])`, with velocity required by `sweptLanding`. Poses contain world `position` and `quaternion`. Only the authored receiving interval can catch a forward, upright descending hull. There is no invisible road across gaps or target-seeking flight assistance.

```js
const model = createFlightModel({ gravity: 26 });
const runtime = model.createRuntime(context, {
  id: 'my-level-flight',
  version: 1,
  rulesId: `my-rules-v1:${JSON.stringify({ track: track.geometryVersion, rules: model.rules, jumps: track.jumps, zones })}`,
  groundOptions: ({ state }) => ({ surface: sampleSurface(state) }),
  shouldLaunch: ({ jump, state }) => inOptionalLaunchLane(jump, state),
  airAcceleration: ({ position, time }) => sampleWorldForce(position, time),
});
```

The context requires `track`, optionally `settings`; preserve steering assistance 0.3. The options require replay identity `id`, integer `version`, and `rulesId`. Include authored layout/rules revisions in `rulesId`, and bump identity when callback behavior changes. Optional `scenarios` uses the session contract; otherwise track scenarios receive plain labels. `edgeSource` optionally labels edge-catch impact events. No shared HUD, notice positions, scenario speeds, world colors or heat tuning are imposed on new levels. Nacre retains its own version-5 identity, scenarios, notices and rules through an adapter over this model.

`track.jumps` may be empty. Each jump supplies `{ id, takeoff, landingStart, landingEnd, recovery, halfWidth }` in route metres. Jumps are ordered, non-overlapping and contained within a lap; the landing and recovery cannot wrap the finish. `halfWidth` describes the receiving road and must accommodate the craft. Exactly one checkpoint, at `landingStart`, is allowed between takeoff and the furthest of `landingEnd`/`recovery`. Invalid definitions fail at runtime construction. Route geometry and landing clearance still need level-owned numerical and real-input checks.

Mandatory gaps always launch. An authored optional branch adds `optional: true`, requires `shouldLaunch({ jump, state, input, from })`, and must retain a supported main road for the false case. The predicate samples the vehicle immediately before the tick crossing its lip; author clear lateral boundaries and matching geometry. A true predicate uses normal flight/landing; a false predicate uses ordinary checkpoint traversal. Optional does not bypass transfer validation once an airborne transfer occurs. Mandatory gaps retain the original strict transfer rule.

The flight adapter holds unwrapped route distance at takeoff, then emits `jump-launch`, `jump-miss` and validated `jump-transfer` events. Missed-jump recovery takes simulation time and preserves the valid timed lap; manual recovery remains invalidating through core. Snapshot/restore carries flight, world pose, settling and recovery state; reset clears them. Its `pose()` includes `grounded` during landing settlement. Presentation settings never change simulation.

`groundOptions({ state, input, dt, track })` is a **pure** sample passed to shared `stepVehicle`. It may be evaluated more than once when a tick splits at takeoff: do not increment timers, consume resources or emit events in this callback. The optional `surface` object contains:

| Property              | Meaning / default                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `grip`                | Lateral response multiplier, default 1, bounded 0.05–4. Lower values preserve drift longer.    |
| `drag`                | Extra forward deceleration in m/s², default 0, bounded 0–100.                                  |
| `thrustScale`         | Engine multiplier for declared power loss, default 1, bounded 0–1.                             |
| `forwardAcceleration` | Signed route-tangent acceleration in m/s², default 0, bounded −100–100.                        |
| `lateralAcceleration` | Signed route-right acceleration in m/s², default 0, bounded −100–100. Positive is driver-left. |

These same per-call options are available on `stepVehicle(state, input, track, dt, { surface })` for grounded adapters. Omitted/invalid values use defaults; baseline steering, braking, reserve accounting and stationary magnetic hold remain intact. Declared forces act on moving craft; parked magnetic hold remains active. Zones, membership, surface IDs, enter/exit events, heat/cooling accumulation and visible moving boundaries belong to the level's deterministic wrapper. Store additional mutable state in the wrapper's snapshot/restore/reset methods, and keep all mutation in `advance`, never presentation or the pure samplers.

`airAcceleration({ state, jump, position, velocity, time })` is an optional pure world-force sampler. It returns a finite `{x,y,z}` vector, added to gravity and limited pilot control in flight. Position and velocity are copies; treat state as read-only. It does not affect automatic missed-jump recovery. Curved leaps need authored clearance and landing envelopes; the helper does not aim at the receiving road. Flight rule overrides are finite nonnegative numbers (positive dimensions, timeout, settle duration and step); the step cannot exceed 1/120 second. Per-jump receiving rail heights use `railHeight: { [jumpId]: metres }`, defaulting to 0.9 m. `railOffset: { [jumpId]: metres }` extends only the receiving rail envelope beyond the usable deck edge to match outboard barriers; the default is zero. Road landings retain the authored width, and a supported rail hit uses the same inward bounce onto the deck.

`launchImpulse({ state, jump, position, time })` optionally returns a finite world velocity delta in m/s, sampled exactly once at real takeoff. Use it for an authored, visibly signalled launch interaction. It does not alter boost reserve. Its resulting velocity is part of the flight snapshot. The configurable miss bounds `missBelow` (23 m), `missBeyond` (18 m) and `missLateral` (55 m) measure receiving-frame separation before timed recovery; curved paths must set bounds from their measured flight envelope and retain a bounded `timeout`.

Optional split decks must supply per-call `roadBounds: { min, max }` from `groundOptions` while the grounded route narrows. Bounds are geometric route-lateral deck edges, inside the full track width and at least the craft's diagonal hull width (about 8.33 m) apart. The swept hull collides with these asymmetric rails and returns `impact.payload.railLateral` for accurate shared sparks. Omission retains full-width rails. Invalid bounds are ignored, so validate authored bounds in level tests. Build a visible divider/taper matching the bounds; selecting no launch must never allow later sideways driving over the missing branch strip. Bounds affect grounded travel only, not a launched trajectory or the full receiving shelf.

Shared model defaults include `curvedContact: true`: if the cached plane sweep finds no landing, it brackets the descending hull against independently projected points on the actual curved receiving surface. This closes isolated speed/phase contact holes without enlarging the landing or accepting upward/underside contacts. Nacre explicitly uses `curvedContact: false` to retain its approved version-5 replay/contact behavior. Keep this model-rule value in the level's `rulesId` serialization; adopting the changed default changes compatibility for recordings using that contact mode.

`ui.compactLandscape: true` enables the compact HUD layout. At heights up to 570 px it separates the upper-right minimap, lower telemetry, left collapsed review toggle and centered expanded review panel, including 640×360. Shared transient notices use the upper center at 48px, clear of the chase craft. Touch controls remain visible across the short-landscape width range, including 844px; coordinate level-owned overlays with the notice band. It also keeps shared portrait notices above bottom telemetry and below review controls at portrait heights of at least 700px; desktop layout remains unchanged. At desktop sizes above 760 px wide and 700 px tall, it also separates the section label, expanded review controls and minimap into consecutive vertical regions. Approved circuits do not opt in automatically.

With curved contact enabled, the solver compares road and rail hit fractions before resolving either. An earlier supported deck contact wins; a later rail must not restart the landing sweep underneath the deck. `model.rules.contactVersion` is fixed by the shared model and must remain in the serialized rules identity when adopting solver changes. Nacre's explicit legacy contact mode preserves its existing order.

`ui.portraitCompactHud: true` reserves an upper HUD for portrait viewports up to 760px wide and at least 700px tall. Reserve/speed telemetry starts at 272px and transient notices at 330px, leaving the lower chase craft and touch controls unobstructed. Expanding review moves telemetry to 468px and notices to 420px below the panel. Keep level-owned guidance in the notice band, suppressing it while a transient notice is present. Desktop and landscape layout are unaffected by this flag. It is optional and defaults off; approved circuits retain their existing positions. Vesper opts in, with surface information at 156px and jump guidance sharing the notice band.
