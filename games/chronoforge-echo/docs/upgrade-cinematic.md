# Town Center upgrade cinematic

Successful Town Center upgrades from Settlement works play this sequence in
normal gameplay and production builds. It works in Haventide, Emberline,
Orbital Reach and Last Crown, for levels 1 → 2, 2 → 3 and 3 → 4.

## Player flow

1. Upgrade the Town Center at the indoor Settlement works desk. Existing
   resource costs, liberation checks and civilization requirements still apply.
2. The upgrade is applied and checkpointed once, before the reveal starts.
3. Hold the actual indoor camera and crew, fade outside in 180 ms, and give
   the old exterior a brief suspenseful 2% push in. Keep the scale fixed as
   the building changes in 850 ms with a quick upward burst of sparkles.
4. Fade back in 180 ms to the same indoor composition, then automatically
   return to Settlement works with the new level and upgrade message.

The sequence lasts about five seconds. Space, Esc or either Skip reveal button
returns immediately. Skipping does not undo or repeat the purchase. Reloading
mid-reveal retains the checkpointed upgrade without replaying or charging again.
Restrained motion omits the zoom and sparkles, keeping fades and the dissolve.
Only the exterior changes; interior upgrade artwork remains future work.

Exploration, movement and interaction pause during playback. The cinematic uses
detached render states; it never travels, reveals another map, moves the crew,
or changes civilization tier. Completing, skipping or resetting releases the
captured canvas buffers. A rendering failure restores Settlement works while
keeping the paid upgrade. No captures are written to disk or browser storage.

## Local art preview

The localhost-only backtick panel still offers Upgrade from inside Haventide.
Choose a level pair, then Upgrade Town Center to rehearse the same presentation
without spending resources or saving changes. This preview stages the crew at
the desk and includes replay controls. Its controls remain excluded from
production; the shared cinematic renderer and styles ship with the game.

## Implementation and checks

- [construction.js](../src/construction.js) connects the real settlement button
  to progression, checkpointing and presentation.
- [upgrade-cinematic.js](../src/upgrade-cinematic.js) defines timing, particles,
  regional camera framing and detached art states.
- [upgrade-tour.js](../src/upgrade-tour.js) renders the sequence and handles
  playback, input isolation, skip, completion and cleanup.
- Unit tests cover payment/checkpoint ordering, duplicate activation, failed
  purchases, skip/completion, all town and level combinations, unchanged
  expedition state, exterior framing and restrained motion. Build verification
  requires the production cinematic while rejecting dev preview controls.

No game, dev server or browser was launched for these checks. Visual playtesting
is performed by the user.
