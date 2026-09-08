# Coastal encounter staging proof of concept

Owner-authorized follow-up to the coastal and room POCs. A visible practice sentry on the upper terrace triggers a continuous zoom into a left/right battle view of that exact location. Kaida takes position, advances to strike, returns, and can guard the sentry's answering pulse. Victory, defeat and disengage all lead back to ordinary exploration.

## Try it

Open `dist/Chronoforge Dusk.app`. Follow the crossing and eastern ascent to the upper terrace. Approach the labeled sentry and press **E** when prompted. **Space** strikes; **G** guards during the incoming-pulse prompt; **Tab** disengages. Three strikes quiet the sentry; two unguarded pulses end the practice. **Enter** returns after either result. **Esc/P** pauses and **R** resets. The command buttons also work by mouse.

[Approach](approach.png) · [Side view](ready.png) · [Guard](guard.png)

The camera blends over 0.95 seconds in both directions, twice its original speed at the owner's request. The battle frame is an orthographic side shot (0° yaw, 17° pitch, size 6.2). The original terrace geometry, lighting, shore ambience and Kaida instance remain present. Staging uses a clear foreground aisle around the opponent; commands and traversal resume when Kaida also reaches her destination. Return restores the actual entry position and facing; held movement must be released before continuing.

## What this establishes for later plans

- **07:** a visible encounter, same-scene formation, local commands, one impact per strike, telegraphed response, and recoverable win/loss/cancel boundaries. The existing `DuskRehearsal` timeline is reused unchanged under a translated/rotated formation. Contact feedback adapts its coordinates to the world-space blade samples.
- **08:** author a battle footprint and camera alongside the route. This POC uses the upper terrace's clear action lane and a separate staging aisle; it does not choose battle locations automatically. Initial facing and the full attack need inspection in the close view, with both participants above the command bar.
- **Later expansion:** larger parties, multiple targets, arbitrary slopes, tight interiors and encounter persistence need their own placement and lifetime decisions. The room POC and this encounter remain separate local demonstrations.

ATB gauges, techniques, rewards, XP, equipment, save/load, story and crew additions remain outside this POC. The new mechanical sentry is explicitly marked as a **staging stand-in**, not a final enemy or proof of humanoid asset production. Basic defeat uses the established held hurt/fall behavior. Close-view character/contact polish remains subject to the current Kaida cutoff; this task does not revise her assets, controller or accepted tuning.

The reference was the left/right arrangement and advance/return presentation in `chronoforge-dawn/shots/proto-ref/battle-open.png` and `battle-midfight.png`. Only those images were used as reference. No original-game, prototype or Dawn implementation or production assets were copied. Dusk's local coastal helpers, prepared Kaida, importer, action timeline and effects were reused.

## Native verification

Initial staging checkpoint: `6920bd4`; asset checkpoint: `22c98f9`. This follow-up halves both camera blends to 0.95 seconds. Selected stills retain the original, unchanged endpoint composition.

Tested runtime SHA-256: `011b50491eea650c00d64ad8597f0fd799205af0e80a53edb4e2be859d63d2e6`.

`python3 tools/native.py test-encounter` passed **39 focused checks + 4 cold-start checks**, fresh run `205fb5cf713148028c855abb7a13bb63`, with no external input. Mapped physical input covered the actual coastal approach, continuous zoom, unchanged actor/site instances, initial facing, strike/contact, repeated command rejection, guard, victory, defeat/retry, opposite-side engagement, mid-action disengage, held-key return, reset during entry, pause and simulated focus loss, and unchanged acceptance-file bytes. The measured sword-to-torso contact distance was 0.154 m. The full Kaida and unrelated room suites were not repeated.

Godot 4.6.3 / Forward+ / Metal / Apple M1 Pro; 1920×1080 internal, 60 FPS cap. Short native intervals excluding screenshot readbacks:

| Interval | Samples | Mean / p95 / max ms | >33.34 ms | Draws | Primitives | Video MiB |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Ready, warmed 5 s | 300 | 16.66 / 17.04 / 18.40 | 0 | 275 | 124,308 | 345.78 |
| Two-strike exchange | 406 | 16.67 / 17.13 / 17.65 | 0 | 275 | 124,334 | 345.92 |

CPU process snapshots were 15.70/5.22 ms; GPU timing was unavailable. These short observations are not a performance acceptance gate. This timing follow-up used automated input in the exported executable; direct OS playtesting and subjective review of the faster camera remain unverified. Original native viewport screenshots were inspected during the initial staging pass.

The ad-hoc signed local `.app` passed signature verification. Its pre-commit label remains `6920bd4e9e86+dirty`; the content digest above identifies the tested implementation. No gameplay rerun or re-export is required solely to change that label. Raw native reports and logs remain local and ignored: `test_encounter.json`, `test_encounter_restart.json` in Godot user data and `/tmp/dusk-encounter-snappy.log`.

New asset: [practice.sentry/r1 metadata](../../_prep/assets/practice.sentry/asset.json), prepared with the unchanged `skeletal_blend` recipe, exported/reimported and loaded through the existing consumer. GLB SHA-256: `ea4279940f49b21818460b5f7cc02a4bf1a119caa5e8d55c4fef445eac9545b7`. The editable Blender master, three-bone mechanism and five original mechanical clips are retained in its immutable candidate package. Asset-production metadata remains tracked; native validation reports do not.

Kaida a1 remains at model SHA-256 `65f98f5fe156e2490d7a3ad75c5783bd0dfad769683d8d8b67dcea16bee27ebf`, with the existing sword and the current 2.99/6.63 m/s walk/run settings.
