# Kaida runtime r4 — fitted grip integration check

**29 checks passed, zero failures** in the actual Dusk foundation scene using Godot 4.6.3 on this Mac. [runtime.json](runtime.json) records source identity, asset hashes and results. [Attack](attack-contact.png) and [rehearsal](rehearsal-contact.png) captures show the imported revision, not a newly packaged app.

The five clips resolve, the 67-bone skin evaluates, embedded base color/normal maps load, and the separate `kaida.energy-sword/r2` follows `SwordSocket`. Maximum mesh displacement between attack start/contact was 0.489 m. Sampled walk/run/attack motion remains in place. The controller completes approach, attack, recovery and return with exactly one logical impact and returns to formation. A second Kaida instance exercises hurt in the probe; the default game target is unchanged. No accepted tuning was written.

The Blender build also passed export/reimport and GLB checks. [Source close-ups and motion measurements](../../assets/kaida/demos/foundation-r3/README.md) cover the new diagonal socket, individual finger fit and narrower handle. Earlier foundation reviews were rejected by the owner. **The current grip awaits owner review, and the attack remains a motion draft.** The logical impact check does not prove sword/target contact, foot planting, convincing weight transfer or visual quality. A suitable source attack plus local cleanup remains the next recommended motion-quality pass.

Capture warm-up and forced draws perturb HUD FPS/p95; these are not performance acceptance measurements. The HUD counter can lag the simulation in near-contact screenshots. The packaged app was not rebuilt.

To rerun in a fresh directory from Dusk:

```sh
godot --path "$PWD/game" --script "$PWD/_prep/tools/character_probe.gd" --resolution 1440x900 -- \
  --descriptor res://assets/kaida/r4/descriptor.json --output "$PWD/_prep/.build/NEW_NATIVE_CHECK"
```

This focused probe expects a textured character with `MotionRoot` and declared bone equipment. Missing mesh/socket failures now finish the report instead of indexing an empty list. It does not automatically accept assets or settings.
