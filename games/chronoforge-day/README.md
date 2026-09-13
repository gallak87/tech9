# Chronoforge Day

A local staging tool for original 3D characters, viewed through a 2.5D camera.
Kaida, her skeleton, and the first motion clips are built and wired in. The
controls are optional: watch the subject, identify a weak pose, and refine it
in the next session. This folder contains no game systems.

## Open the stage

```sh
cd games/chronoforge-day
npm install
npm run dev
```

Open `http://localhost:5186`. The repository's existing installed dependencies
were reused for this first pass. Normal setup needs only Three.js and Vite.
No asset packs, remote inference, downloaded models, or external art files.
Vite needs Node 20.19+ or 22.12+. The launch helper also checks existing nvm
installations when the shell selects an older Node; it installs nothing.

Choose a clip, pause, scrub its timeline, or step at 30 fps. Drag the view to
orbit, right-drag to pan, and scroll to zoom. Camera presets include a fixed
game view. Inspect the skeleton, support feet, sword trajectory, and contact
target. Click a named timeline phase to jump straight to it. The target turns
green only when the actual blade tip is close.

Appearance, motion tuning, lighting, camera and current pose persist in this
browser. Export JSON to keep an explicit checkpoint or share it with a later
session. Import pauses playback. Reset returns to the initial Kaida preset.

## Direct inspection

`?clip=attack&t=0.73&camera=side` opens the sword contact pose directly.
The console exposes deterministic helpers:

```js
__CHRONOFORGE_DAY__.pose('walk', 0.28)
__CHRONOFORGE_DAY__.step(1)
__CHRONOFORGE_DAY__.set({view: {skeleton: true, contacts: true}})
__CHRONOFORGE_DAY__.inspect()
```

The inspection result includes joint positions, actual sword/target positions,
render counts, the current settings, and motion phase. No campaign traversal
is needed to reproduce a pose.

## Continue from here

- `src/characters/humanoid.js`: shared proportions, named skeleton, skinned body,
  Kaida's modular costume and materials. `createHumanoid(profile)` is the family
  seam; other humanoids should keep its bone names and motion interface.
- `src/animation/clips.js`: deterministic rest, idle, walk, attack, hit poses.
  The walk is in place; support feet travel backward as on a treadmill.
- `src/stage.js`: lighting, camera, floor, overlays and measurement tools.
- `src/config.js`: preset schema, defaults and validation.

Borrowed approach from Vulpine: authored cross-sections, centralized materials,
coherent lighting, deterministic motion and fixed inspection states. The stage
has no runtime dependency on another game folder and does not copy Vulpine's
large renderer or gameplay modules.

First refine Kaida at the intended camera distance. Once the form and motion
are satisfactory, reuse the humanoid family for companions and humanoid enemy
factions through proportions, costume modules and palettes. Add another body
family only when anatomy needs a different rig. Game development comes later.

## Validation

`npm run check` checks geometry, skin weights, finite poses, planted idle feet,
repeatable sampling, sword contact, and preset imports without a browser.
`npm run build` bundles the tool. This first pass has **not** been visually
reviewed or playtested. Neither a green build nor a contact calculation is an
artistic-quality verdict.
