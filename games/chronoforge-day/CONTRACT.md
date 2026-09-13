# Chronoforge Day — character stage

This is an art and animation staging tool, not a game. First subject: Kaida.
Use Three.js and code-authored assets locally. No paid services, model downloads,
combat systems, maps, progression, enemies, or settlement development.

Carry forward Vulpine's deterministic geometry, shared materials, coordinated
lighting, and fixed inspection cameras. Keep this folder independent of Vulpine.
Build one reusable humanoid family; appearance and proportions are data, while
bone names and motion clips are shared. Future factions should reuse that family.

## Initial lanes

- Root: config, stage renderer, integration, package, documentation, static checks.
- Character: `src/characters/**` only.
- Motion: `src/animation/**` only.
- Controls: `src/ui.js`, `src/style.css` only.

No runtime/playthrough tests in this first pass. Validate source/build and pure
geometry/motion checks; the user will inspect the staging tool.

## Coordinates and character interface

Metres, Y up, character faces +Z. Anatomical left is +X; right is -X.
The root origin is at floor level. Neutral soles touch Y=0. Limb bone axes
point down -Y; spine/neck extend +Y. Feet extend +Z. Right-hand sword extends
down -Y from its grip in the neutral pose. Use Three.js Euler order XYZ.

`createHumanoid(profile)` from `src/characters/humanoid.js` returns:

```js
{
  root, // THREE.Group; may be translated by a clip
  bones, // named THREE.Bone objects below
  rest, // name -> { position: Vector3, quaternion: Quaternion, scale: Vector3 }
  skeleton, // THREE.Skeleton
  meshes, materials, // arrays, shared materials permitted
  weapon: { root, tip }, // tip is Object3D at the end of the blade
  metrics: { height, hipHeight, upperLeg, lowerLeg, footHeight,
             upperArm, forearm, shoulderWidth },
  setWireframe(enabled), dispose()
}
```

Required bones: pelvis, spine, chest, neck, head, upperArmL, forearmL,
handL, upperArmR, forearmR, handR, thighL, shinL, footL, thighR, shinR, footR.
Use genuine skinning for deforming body surfaces; rigid accessories can attach
to bones. Rest transforms must be copied after binding. Materials/geometry are
disposed once. Geometry must construct in Node without DOM or WebGL.

Profile fields: `height` (default 1.72), `build` (1), `headScale` (1),
`weaponScale` (1), and `palette` with skin, hair, coat, cloth, leather, metal,
accent, blade colors. Kaida: magenta swept hair, teal fitted jacket, dark
trousers, tall boots, warm brass fittings, violet sword. Stylized human
proportions, tapered forms, layered costume; avoid a toy made of spheres.

## Motion interface

`src/animation/clips.js` exports `CLIPS` and `applyPose(rig, clipId, time, motion)`.
CLIPS: array of `{id,label,duration,loop,description,markers:[{time,label}]}`.
Provide rest, idle, walk, attack, hit. Walk in place; the attack may lunge.
Motion tuning: `{stride:1,intensity:1,reach:1}`. Each call resets root/bones to
rest, then samples absolute time: no accumulated drift and no external clock.
Return `{phase,progress,contacts:{left,right},strike}` where strike is 0..1.
No lateral whole-character idle oscillation. Foot contacts matter. Attack has
anticipation, travel, contact, follow-through, recovery. Strike target reference:
`(-height*0.13, height*0.62, height*0.65)` in stage space. User can inspect the
actual sword-to-target distance; do not fabricate a hit result.
The reach control scales the target's Z coordinate. Camera orbit is stored in
an optional `cameraPose: {position:[x,y,z],target:[x,y,z]}` field; choosing a
camera preset clears it.

## UI / integration interface

`mountUI({state,clips,cameras,lightingPresets,onChange,onAction})` from `src/ui.js`
mounts inside `#app` and returns `{update(state,stats),destroy()}`. It must create
`#viewport` for the renderer. Cameras/lightingPresets are `{id,label}[]`.
`onChange(patch)` receives nested partial state; root merges and sanitizes.
`onAction(name,payload)` actions: togglePlay, restart, stepBack, stepForward,
reset, export, import (parsed JSON payload). Import can also be handled by UI
reading a local file before forwarding JSON. Don't recreate focused controls
on frame updates. Stats: `{fps,triangles,bones,phase,contacts,tipDistance}`.

State shape:
```js
{
  version: 1, clip: 'idle', time: 0, playing: true, loop: true, speed: 1,
  camera: 'threeQuarter', zoom: 1, lighting: 'studio', exposure: 1.05,
  view: {skeleton:false,wireframe:false,grid:true,contacts:false,trajectory:false,target:true},
  character: {height:1.72,build:1,headScale:1,weaponScale:1,palette:{
    skin:'#d79e85',hair:'#b52a63',coat:'#185665',cloth:'#252837',
    leather:'#422d35',metal:'#718293',accent:'#b19161',blade:'#b880f7'}},
  motion: {stride:1,intensity:1,reach:1}
}
```

Camera IDs: threeQuarter, front, side, back, game. Lighting: studio, daylight,
dusk. Transport supports absolute time scrubbing, pause, loop and frame steps.
Root owns persistence and JSON export. The UI is a compact, polished asset
workbench with visible controls, not a game HUD or a marketing page.
