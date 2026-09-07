# Kaida runtime r2 — first candidate integration

**29 native checks passed**, using Godot 4.6.3 on this Mac through the actual Dusk foundation scene. [runtime.json](runtime.json) records the model hash, game source identity, 67 imported bones, durations and checks. [Attack](attack-contact.png), [walk](walk.png), [run](run.png) and [rehearsal](rehearsal-contact.png) captures show the imported assets. This is the native editor binary running the game, not a freshly packaged `.app`.

The five roles resolve in the AnimationPlayer. Embedded base color/normal maps load; the independent Blender reimport also confirms all three runtime texture images retain their pixel hashes. Godot evaluates 0.401 m maximum mesh displacement between attack start/contact, and the separate weapon follows its bone attachment. Walk, run and attack retain constant horizontal `MotionRoot` translation at sampled times. The actual rehearsal completes approach, attack, recovery and return with exactly one impact and returns Kaida to formation. A second Kaida instance exercises the hurt role in this probe; the game's default target is unchanged.

No accepted tuning was written. Still captures, warm-up and forced draws perturb the displayed FPS/p95, so these are **not performance acceptance measurements**. The HUD updates less frequently than the simulation; its contact counter can lag a near-contact capture. Full-cycle deformation, grip, blending, stride/controller agreement, plant/contact and normal-play performance are 03 work, along with the owner's provisional-body review.

Runtime r1 is retained as the earlier first-pass export. Runtime r2 uses clip times starting at zero: attack is 1.333333 s, contact is 0.666667 s (Blender frame 21 at 30 FPS). The source master and review animation are otherwise the same. The 18 local pipeline tests passed after the rest-pose dimension change; both real asset builds passed export/reimport and GLB checks.

To rerun in a fresh evidence directory from Dusk:

```sh
godot --path "$PWD/game" --script "$PWD/_prep/tools/character_probe.gd" --resolution 1440x900 -- \
  --descriptor res://assets/kaida/r2/descriptor.json --output "$PWD/_prep/.build/kaida-review-check"
```

The character probe takes a registered descriptor and output directory, reuses the game's importer/controller, and never creates accepted settings. Its current in-place check expects the authored `MotionRoot` bone and textured skeletal equipment; it is a focused character check, not a universal verifier.
