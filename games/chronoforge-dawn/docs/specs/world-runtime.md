# world-runtime — the API contract for Phase 4a

Shared contract for three parallel lanes. **Written before the code, so the tools
can be built against it rather than after it.** If a lane needs this to change,
say so in its report — do not change it unilaterally.

## Coordinate frame

Authoring data (`world-graph.mjs`) is in TILES with the origin at the map's NW
corner. The engine is centred on the world origin. The world module owns the
conversion and **nothing outside it ever sees a tile**.

```
worldX = (tx + 0.5) * TILE_M - widthM  / 2
worldZ = (ty + 0.5) * TILE_M - depthM  / 2
```

Outdoor maps are 45x30 tiles = 90 x 60 m. Interiors carry their own `w`/`h`.

Field evaluation is `docs/specs/heightfields.mjs` `heightAt(biomeId, xLocal, zLocal)`,
which takes MAP-LOCAL metres. The world module converts before calling it.

## `ctx.world` — the module API

Existing keys keep their meaning and their types. `actors/ground.js`,
`traversal/index.js` and `main.js` already read them; none of those files change.

| key | type | note |
|---|---|---|
| `root` | `THREE.Group` | unchanged |
| `focus` | `Vector3` | unchanged — where a review camera aims |
| `propFocus` | `Vector3` | unchanged |
| `size` | `number` | **`max(widthM, depthM)`.** `main.js:135` clamps the shadow focus with `size*0.5` on both axes; keep it conservative. |
| `heightAt(x,z)` | `number` | WORLD metres in, metres out. Same signature as today. |
| `normalAt(x,z,out?)` | `Vector3` | unchanged |
| `update(dt)` | | unchanged |
| `dispose()` | | unchanged |

New keys:

| key | type | note |
|---|---|---|
| `mapId` | `string` | the live map, or `'proto'` |
| `biomeId` | `string \| null` | `null` for interiors and for `proto` |
| `widthM` `depthM` | `number` | real extents; rectangular maps are the norm now |
| `setMap(id)` | `void` | disposes the current map and builds `id`. Throws on an unknown id. |
| `toWorld(tx,ty,out?)` | `Vector3` | tile -> world metres, y from `heightAt` |

`bus.emit('world:built', { mapId, biomeId, widthM, depthM, seed })` fires on every
build, including `setMap`.

## `proto` is preserved

`?map=proto` boots the **existing Phase 0 placeholder** — the 240 m dune field
and its material-study prop cluster — unchanged, including `heightAt`.

Two things depend on it and neither is allowed to break:

- every probe baseline in `docs/STATUS.json`, measured on that surface
- Phase 2.5's gate, "Kaida runs the dune" — free-roam needs a 34 deg slope to
  exist somewhere

**`proto` stays the default when no `map=` is given.** Switching the default is a
separate decision made after the new maps have been looked at.

## URL params

| param | default | |
|---|---|---|
| `map` | `proto` | any id in `world-graph.mjs` `MAPS`, or `proto` |

`__DAWN__.setMap(id)` does the same thing at runtime and is what the tools drive.

## What Phase 4a is NOT

Blocked-in ground only. No props, no scatter, no fog of war, no weather, no
per-biome lighting. `src/render/` is **frozen** — the character gate is judged
through it and re-tuning materials or post underneath that is not allowed this
session. Vertex colour from the biome `albedo` table is the whole look pass.
