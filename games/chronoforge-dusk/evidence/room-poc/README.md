# Workshop rooms and camera proof of concept

Owner-authorized follow-up to the completed outdoor 06 task. One original coastal workshop now supports an actual room scene, doorway entry/exit, and two indoor views. This informs later plans; it does not implement 07's gameplay loop or commit the game to third person.

## Try it

Open `dist/Chronoforge Dusk.app`. From the arrival, head down and left through the opening to the workshop on the west apron. **E** at the timber door enters; **E** near the inside door leaves. **C** switches indoor cameras. WASD/arrows move and Shift runs. Third person supports **right mouse drag** or **J/L** to turn the camera. **R** resets to the current space's safe entry; Esc pauses. F2 still opens the existing development scene.

[Outside](exterior.png) · [Close cutaway](cutaway.png) · [Third person](third-person.png)

- **Outdoor:** the established 0°-yaw coastal camera and controls.
- **Close cutaway:** a closer orthographic view, restrained follow, hidden roof/front wall, unchanged collision and the same keyboard axes as outdoors. This is the first-visit default and the recommended starting point for small rooms.
- **Third person:** perspective follow with deliberate orbit, complete roof/walls, collision-aware camera distance, and character fading when a wall forces the lens very close. It stays available for comparison; the preferred mode is remembered between visits during this session.

The room is the same 6.4 × 5.2 m shell at the same scale as the exterior. Enter/exit uses a brief fade and a safe return point. Held movement must be released before continuing after a doorway or camera change, preventing unwanted motion across a changed view. E is an explicit interaction, so proximity never immediately bounces the player back outside. The indoor shore mix is quieter; light comes from a warm room source and a cool utility source.

## What this establishes for later work

- **07:** keep the player/controller alive across local scene changes; bind each doorway to an explicit destination/return position; separate input during transitions from ordinary movement. These are proven here without a save system or story gate.
- **08:** author room framing and cutaway pieces together. A perspective camera needs solid walls/ceiling and clearance around furniture; an overhead camera needs intentional roof/front-wall visibility. Decide the camera for a location deliberately rather than deriving it solely from the word “interior.”
- **09–10:** detach the inactive world's lights/collision with its scene. Repeated visits must not accumulate room nodes or duplicate audio. This POC retains one coastal scene while indoors; it is not large-region streaming or a memory-unloading benchmark.
- Third person exposes much more character and surface detail. Here the representative primitive counter is substantially higher than in cutaway, so future close-view art and performance decisions need their own evidence. Kaida's current source and clips were preserved.

The room camera uses Godot's [SpringArm3D](https://docs.godotengine.org/en/4.6/classes/class_springarm3d.html) with a 0.22 m sphere, 0.12 m margin, and the actor excluded. Its maximum distance is 3.15 m. The cutaway uses size 8.2; perspective uses a 68° FOV. These are local POC choices, not universal environment constants.

## Verification and identities

Runtime checkpoint: `3434413`. Baseline: `0b7bc79`, including the owner's newer Kaida walking/speed work from `b814fb9`. This task does not change Kaida, her controller, accepted tuning, the importer, or the preparation pipeline.

Tested runtime SHA-256: `f73f59ee857cc2afccadfd9108e3e6cd9f7be700d9b91a0b26f1ba8e9ee79e94`.

`python3 tools/native.py test-room` passed **23 focused checks + 3 cold-start checks**, fresh run `febc5d503a0d47cbbec3d9c50d7b3e06`, without external input. Mapped physical input exercised the outdoor approach/return, entry with a held key, both camera modes, wall contact, third-person turning, pause/reset, eight doorway transitions, stable node count after repeated visits, and unchanged acceptance-file bytes. The full Kaida/combat suite was not repeated. Source preparation/export/reimport for the one new static asset passed through the existing recipe.

Godot 4.6.3 / Forward+ / Metal / Apple M1 Pro, 1920×1080 internal, 60 FPS cap. Two five-second native intervals, excluding capture readbacks:

| View | Samples | Mean / p95 / max ms | >33.34 ms | Draws | Primitives | Video MiB |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Cutaway | 299 | 16.71 / 18.56 / 57.26 | 1 | 126 | 37,372 | 368.03 |
| Third person | 300 | 16.67 / 18.83 / 19.78 | 0 | 152 | 337,754 | 368.03 |

These are short engineering observations, not a performance acceptance gate. CPU process snapshots were 8.50/7.06 ms; GPU timing was unavailable. The desktop was locked during this run, so direct OS playtesting and an isolated foreground performance session remain unverified. The screenshots were captured from the exported app's viewport and visually inspected. Owner review of camera comfort and the mix remains pending.

New mesh: `coast.workshop/r1`, GLB SHA-256 `5d8409faa9f55841437d23e6ad072f8fa6bff61848fadff724c795949d6b59f1`. [Editable source/metadata](../../_prep/assets/coast.workshop/asset.json) pins the master and authoring helpers; [authoring script](../../_prep/assets/coast/author_workshop.py) retains the original geometry. Only Dusk's existing coastal material/geometry helpers, runtime components and current Kaida package were reused. No external code or production assets were copied.

The signed local `.app` is the tested export; its pre-commit label is `0b7bc795fb9c+dirty`, and its content digest matches the committed runtime. Generated reports/logs remain local and ignored (`test_room.json`, `test_room_restart.json` in Godot user data). Only this summary and selected captures are committed. No interiors beyond this workshop, party systems, encounters, progression or save/load were added.
