# Level module API

The shared app discovers circuits under `src/levels/<slug>/`. Packaging, dispatch readiness and the selected foundation revision live only in the [launch ledger](expansion/LAUNCH_STATE.json). This API preserves the existing [session runtime](GATE4_RUNTIME_CONTRACT.md).

## Discovery and metadata

Each level supplies two files:

- `metadata.js`: default-export an asset-free object with `id` matching the folder, `name`, numeric `order`, boolean `shape`/`review`, and `ui` copy. Metadata feeds the paddock picker, briefing and review controls.
- `index.js`: default-export `createLevel({ shape, features })`, returning the descriptor below. Only the selected implementation is imported. No shared catalog/core edit is required.

Required `ui` strings: `edition`, `subtitle`, `eyebrow`, `intro`, `detail`, `start`, `tag`, `tagDetail`; `heading` is two text strings. Optional `ui.shape` overrides copy for shape review. Optional layout flags are `compact`, `stackedReview` and `lowNotice`. Use real text, not HTML. The approved level metadata files are small working examples.

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

Optional descriptor fields: `createRuntime(context)` replaces only the session adapter; otherwise ordinary magnetic motion is used. `createOverlay(context)` returns `{ dispose, update?, afterRender?, reset?, getPresentation? }`. `ship`, `audio` and `effects` pass existing constructor options; `railContactSparks` chooses rail-local spark placement and `practiceSectionsUntimed` labels section practice. These preserve existing opt-ins, not permission to expand gameplay. Only Halcyon's adapter loads its exact pickup feature; only Nacre's adapter supplies flight.

## Rendering and camera options

Backdrop result: `{ group, sunDirection, dispose, ready?, update?, setOverview?, assets?, ownedTextures? }`. It owns its sky textures; `assets` may expose borrowed resources to the environment. `ownedTextures` supports resource accounting. Optional light values are `sunColor`, `sunIntensity`, `ambientSky`, `ambientGround`, `ambientIntensity`, `fillColor`, `fillIntensity`, `environmentIntensity` and `far`.

Backdrop `update` receives the same frame during play. Reflection initialization also calls it with camera/settings/time/mode/reset, before vehicle presentation is available; handle that stationary case. No update occurs inside the regular draw call. Nacre's old multi-hook environment is adapted to a single update in its descriptor.

Descriptor `renderer` supports `world` (diagnostic name), `background`, optional `fog: { color, density }`, `bloomStrength`, `bloomThreshold`, `fillHeight`, `reflectionFar` and `contact` options. The selected factory owns sky/world identity; no Halcyon panorama is silently applied to new levels. High/low and reduced-motion settings remain shared.

Descriptor `camera` optionally sets `preserveFlightView`, `portraitAspect` and `maxPortraitScale`. Default chase behavior is unchanged; Nacre explicitly opts into its approved flight/portrait composition. Camera code does not infer behavior from track names.

## Track and review contract

Use metres, seconds and radians. Supply unique `id`, `name`, positive finite `length`/`width`, ordered `checkpoints`, contiguous named `sections`, `scenarios`, and `sample(distance)`. Sampling wraps physical distance and returns finite `{ position, tangent, right, up, quaternion, curvature, bank }`, optionally unwrapped `roll`. Geometric +X (`right`) appears driver-left when facing +Z; preserve the existing input convention.

Production/shape share one track and its frames. Sections use `{ id, name, start, end, showcase? }`; a matching `<id>-showcase` scenario enables a parked section start. Runtime scenarios may add `{ label, state }` entries. `review: true` enables fitted 3D/top/profile views. Keep scenery/clearance rules local to the level; the future shared geometry-helper work is separate from this loader API.

Run contract/unit tests, lint/build and short hidden production checks, including failure cleanup, selected-asset isolation, controls, pause/reset, review UI and repeated disposal. Keep screenshots/raw reports ignored and retain only a compact current result. The integrator owns shared API changes and combined regressions; builders own their level paths.
