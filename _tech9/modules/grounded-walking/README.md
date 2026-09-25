# Grounded walking · 1.0.0

A desktop camera controller promoted from three playable Tech9 consumers. It owns movement/look input and its listeners. The scene or game owns UI, rules, spawn selection and the camera instance. No Three.js import is required: supply a camera with `position.{x,y,z}` and Euler-compatible `rotation.{x,y,z}` in `YXZ` order (`reorder()` is used when present).

Copy this module and `placement-collisions` into an owned source tree together, preserving `<module-id>/src/`. The forest example uses `src/capabilities/grounded-walking/src/WalkingController.js`; games never import the canonical framework at runtime.

```js
app.setController(
  (context) =>
    new WalkingController(context, {
      enabled: false,
      speed: 2.6,
      boostSpeed: 4,
      playerRadius: 0.3,
      eyeHeight: 1.68,
      isWalkable: (x, z) => shoreline.isWalkable(x, z),
      onPause: (reason) => showPauseMenu(reason),
    }),
);
```

Context requires `camera`, `canvas`, `bounds` (`minX/maxX/minZ/maxZ`), `groundHeight(x,z)` and optional `definition.getColliders()`. Colliders are static horizontal `{x,z,radius}` discs; the controller captures their array at construction. `isWalkable`, `canMove` and `canLook` default to true. The optional `onPause` defaults to a no-op. Enable from the game's start/resume action; `enabled` defaults to false.

- `update(dt)` owns ground following, normalized WASD/arrows movement, Shift boost and IJKL look. Deltas clamp to 0–0.1 seconds; movement uses bounded collision substeps.
- Right-button drag looks without native capture. `lock()` requests capture only when the caller invokes it from a user gesture and returns `Promise<boolean>`; denial keeps fallback input usable.
- `setEnabled(false)` clears keys/drag and releases only this canvas's lock. `resetMotion()` clears held input after an external view change. Rotation remains on the injected camera, so no stale internal yaw overrides a scene view.
- P, Escape, Tab, window blur, hidden document, and exit of this canvas's pointer lock call `onPause(reason)` after disabling. Reasons are `keyboard`, `tuning`, `blur`, `hidden` and `pointer-lock`. Menus decide how to present these states. Disabling does not itself issue a pause callback; duplicate blur/unlock events do not issue another callback.
- Disabled/menu input and editable fields retain their normal keys. Movement/look guards also clear held state when closed. Disposed controllers cannot be re-enabled. `dispose()` is idempotent, removes listeners and releases owned capture, including pending capture resolving after disposal.
- `snapshot()` returns read-only state data. Games decide whether to expose it; the examples expose test access only with `?test=1`.

The forest example is `scenes/scene-test/?controller=walk`; default forest flight remains available. The pond example uses the same controller with a shoreline predicate. Camera/UI composition remains scene-owned.

## Provenance and validation

Promotion source checkpoint: `2713c2fc45cebc50b523900d6c49fc4f4eaf450d` (merged pilots). Design and input behavior come from these repository-authored consumers:

| Source                                                          | Last source change                         |
| --------------------------------------------------------------- | ------------------------------------------ |
| `games/alder-signal/src/game/WalkingController.js`              | `5099e1fb7cd7338301402d7d2e3cf79b7cd5f6d0` |
| `_tech9/games/pinewatch-hunt/src/game/Walker.js`                | `52b987dc3ec464aec4036a168a62d3e673de1594` |
| `_tech9/games/stillwater-fishing/src/game/WalkingController.js` | `32dfab687ab196f5e26f047964e8fdbe060256c0` |

The extraction is repository-authored JavaScript; it bundles no third-party runtime code or assets. The source repository declares no general redistribution license; this provenance record does not add one. Existing game asset licenses remain with their games.

Run `node --test _tech9/modules/grounded-walking/tests/*.test.js` with supported Node. Tests exercise disabled/editable input, normalized movement, terrain/collision/shore guards, drag and keyboard look, repeated pause/resume, canvas-specific lock transitions, pending lock completion and disposal. Browser validation belongs to the runnable examples and must distinguish fallback keyboard/drag from successful native capture.

Limits: keyboard/mouse desktop only; single heightfield, no jumping/gravity, moving solids, slopes, steps, navmesh, mesh-accurate physics or spawn depenetration. Choose a valid spawn outside colliders. Collision circles and eight shoreline perimeter samples are conservative approximations. Legacy non-promise pointer-lock browsers may report false before a later browser lock event; current Chromium supports the promise path. This is a reusable controller, not a character/animation or game rules package.
