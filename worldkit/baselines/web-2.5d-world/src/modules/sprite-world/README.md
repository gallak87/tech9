# Sprite world

Echo-derived Canvas2D sprite exploration presented through **PixiJS 8.16.0 / WebGL**. The module owns a filtered artwork surface, its Pixi texture/presenter, controls and decoded assets. The consumer owns scene composition, game rules and HTML interface. Requires a browser, ES modules and `pixi.js: 8.16.0`; Vite copies referenced PNGs into the consumer's build. No campaign, combat, persistence or live Echo imports.

The runtime requires explicit `assets`, `frames`, `actor` and `drawGround` inputs and validates them before allocating resources. It imports no preset and has no campaign, character or biome defaults. Import `createSpriteWorld` directly from `src/world.js` to exclude sample art from the dependency graph. The optional exports in `src/coastal.js` are a replaceable art preset used only when supplied by the consumer.

The authored working example is `baselines/web-2.5d-world/`. Copy the entire module, including `assets/`, into `src/modules/sprite-world/`.

```js
import {
  createSpriteWorld,
  COASTAL_ASSETS,
  COASTAL_FRAMES,
  COASTAL_ACTOR,
  drawCoastalGround,
  createCoastalPatterns,
} from './modules/sprite-world/src/index.js';

const world = await createSpriteWorld({
  mount: document.querySelector('#stage'), // give this element an explicit size
  scene: {
    id: 'courtyard',
    width: 1800,
    height: 1300,
    spawn: { x: 700, y: 700 },
    roads: [
      {
        points: [
          [200, 700],
          [1600, 700],
        ],
        width: 80,
      },
    ],
    water: [],
    clearings: [],
    props: [
      {
        id: 'old-arch',
        frame: 'arch',
        x: 1000,
        y: 700,
        height: 200,
        footprints: [
          { x: -82, y: -20, w: 40, h: 28 },
          { x: 42, y: -20, w: 40, h: 28 },
        ],
        interact: { label: 'Read inscription', radius: 140 },
      },
    ],
  },
  assets: COASTAL_ASSETS,
  frames: COASTAL_FRAMES,
  actor: COASTAL_ACTOR,
  drawGround: drawCoastalGround,
  createPatterns: createCoastalPatterns,
  controls: { container: document.querySelector('#controls'), touch: 'auto' },
  viewport: { logicalWidth: 960, pixelBudget: 1500000 },
  budgets: { assetBytes: 96 * 1024 ** 2, concurrency: 2, warmGroups: 1 },
  onInteract(object) {
    console.log(object.id);
  },
  onError(error) {
    console.error(error);
  },
});
world.start();
// Before a modal: world.setPaused(true). After closing: world.setPaused(false).
// On unmount/reset: world.dispose(). Create a fresh instance to restart.
```

`start()` owns one animation loop; `stop()` cancels it and clears input. A consumer may instead call `update(dtSeconds)` and `render()` from its own loop. Do not use both loops. `setPaused(boolean)` stops simulation and input while leaving presentation available. `resize()` clears stale pointer/key state and adapts to the stage rectangle; a ResizeObserver does this automatically. `teleport(x,y)` is an explicit consumer action and rejects blocked positions. `setScene(scene)` prepares that scene's `assetIds` (or all supplied assets), then activates it; a load failure leaves the current scene intact. Scene IDs identify dependency groups and should be unique per composition. `dispose()` is idempotent and releases listeners, controls, decoded images, canvases and GPU resources. Browser context loss reports an error and requires recreation; automatic GPU reconstruction is not claimed.

`state` and `snapshot()` return observation copies: actor position/facing/moving/bounds, camera, viewport, nearby interaction, pause and scene ID, and resource statistics. `onState(snapshot)` runs after updates and state changes. `onPause(paused, world)` reports Escape and background pauses. Interact callbacks receive `(sceneProp, world)`. Input uses arrows/WASD, Shift to run, F/E/Enter to interact while the canvas is focused, Escape to pause, a proportional touch stick and Run/Interact buttons. Clicking the ground moves along a direct collision-checked line; this is not an obstacle-routing pathfinder. Manual input cancels the destination.

## Data and rendering

World coordinates are logical units, +X right and +Y down. Actor positions and prop positions are foot anchors. Props use `{id, frame, x, y, height, footprints?, occludes?, interact?}`. Footprints are `{x,y,w,h}` rectangles relative to the foot; they describe trunks/foundations rather than the painted canopy. `interact` supplies `{label,radius}` plus arbitrary consumer data. Arches can have two separate pillar footprints. Visual depth sorts by foot Y; nearer scenery overlapping the actor dims to 42% opacity. `occludes:false` disables dimming. Ground shadows remain independent of collision.

Frames use `{asset,x,y,w,h,anchorX,anchorY}` with crop and anchor values in **source pixels**. Render height determines width from crop aspect. Actors provide `animations: {idle: {right: [frame], ...}, walk: {right: [frame, ...], ...}}`. Each directional group has its own arbitrary positive frame count; omit `walk` for a static actor. Missing directions use `default` or the first group. Left mirrors right only when no explicit left group is supplied. `fps` or `animationRates.idle/walk` sets playback; frame `scale` overrides actor `scale` (default 1). The coastal sample retains the source character’s calibrated body stature and gait bob; other art needs no coastal IDs, proportions or direction count. A general animation state graph is outside this exploration module.

The required `drawGround(ctx, {scene,camera,viewport,images,patterns,time})` callback paints in world coordinates after camera translation. `images` is a Map by asset ID. An optional `createPatterns(ctx, images)` factory returns `{patterns, surfaces?, dispose?}`; its returned resources are owned by that world and disposed on replacement/teardown. Without the factory, `patterns` is an empty array and no tile canvases are allocated. The optional coastal painter uses six prepared tile patterns at the original 128-unit repeat, authored roads `{points:[[x,y],...],width}`, water polygons `[[x,y],...]`, and clearings `{x,y,radius,aspect?}`. Water is blocked except where a road crosses it; use `scene.isWalkable(x,y,radius)` for additional constraints. Ground drawing is bounded to the visible backing surface. The consumer controls additional decoration, shore treatment and scene composition.

`camera: {anchorX: 0.5, anchorY: 0.57, speed: 9}` configures the actor’s desired position inside the viewport and follow convergence per second. Set a larger `anchorY` to show more scenery ahead of the actor. Anchors clamp to 0–1; nonfinite values use the defaults. The same camera policy applies after resize and teleport, with scene bounds still authoritative.

Desktop preserves the real CSS aspect with the configured logical width. Mobile derives logical extent from CSS stage size, optional portrait zoom, and scene fit. Rendering resolution is independently capped by `pixelBudget`, `maxDimension` (2048 default), and `maxScale` (2 default). Reserve the touch thumb zone in the consumer layout; pass only the usable stage element. Controls remain CSS-sized. `fit:'fixed'` explicitly keeps `logicalWidth/Height` for consumers that already letterbox their stage.

## Controls and lifetime

The consumer styles `.sprite-controls`, `.sprite-stick`, `.sprite-stick-knob`, `.sprite-stick-label`, and `.sprite-action[data-action="run"|"interact"]`. Use a roughly 118px stick, ≥48px buttons and safe-area padding; the example provides complete responsive styles. The module sets only pointer/focus semantics and knob translation. `controls.clear()`, `controls.setEnabled(boolean)` and `controls.focus()` support consumer UI transitions. Loss of pointer capture, blur, hidden documents, pause, rotation and disposal clear movement. A hidden document pauses explicitly; resuming remains a user decision.

`AssetCache` is separately importable from `src/assets.js` without loading Pixi. It accepts `{entries,load,release,concurrency,budgetBytes,warmGroups,commonIds}` and exposes `prepare(key,ids)`, `activate(key)`, `discard(key)`, `resetSession()`, `diagnostics()` and `dispose()`. `images` owns the decoded sources. Sources shared by groups load once. Active, common, prepared and pending sources are protected; inactive groups evict by recency and budget. Activating one group consumes only its preparation reservation; other prepared groups remain protected until their own activation, discard or session reset. Concurrent users may pass an opaque `{reservation}` object as the third argument to `prepare` and the second argument to `activate`/`discard`. Every request must use its own token and retain it for that lifetime. Omitting the token uses the group key as a single caller’s reservation. The world’s scene transition coordinator supplies unique tokens, so stale requests cannot discard a newer request for the same scene. `concurrency` must be a finite positive integer, `warmGroups` a finite nonnegative integer, and `budgetBytes` finite and nonnegative; invalid options fail synchronously before loading. Entry IDs must be unique nonempty strings, and common IDs must be registered.

The byte budget is an eviction target, not a hard cap: active and pending assets can exceed it, and browser decode/GPU allocations are not fully measurable. `load(entry,{signal})` must observe abort for prompt cancellation; late noncancelable results are released without installation. An Image loader with dimension/crop checks is supplied. Failing required artwork rejects initialization instead of silently substituting other sprites.

The presenter uses one viewport canvas and one Pixi texture. The optional coastal pattern factory also owns six 256px tile canvases. Statistics report decoded pixel bytes and owned surface counts, not complete browser/GPU memory. A consumer-supplied ground renderer owns and disposes any extra resources it allocates.

## Assets and checks

Read [asset provenance and rights](assets/NOTICE.md). Selected runtime PNGs preserve Echo's exact prepared pixels; retained raster originals, calibrated metadata and `src/authoring.js` make preparation editable. Do not key prepared alpha or retint prepared terrain again. Runtime builds do not ship the unused authoring originals. No historical prompt wording or public artwork license is invented.

From `_tech9/`, run `./run exec -- node --test modules/sprite-world/tests/*.test.js`. Tests cover pixel/source provenance, crop geometry, aspect/coordinate transforms, bounded resolution, camera integration, swept collision, passage/water access, pointer ownership, asset cancellation/eviction/failure and idempotent disposal. The starting package owns real-input browser validation of this integrated renderer and controls.
