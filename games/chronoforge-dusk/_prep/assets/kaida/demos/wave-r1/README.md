# Kaida wave demo

Open [kaida-wave-demo.blend](kaida-wave-demo.blend). This is a separate animation experiment; the original textured idle/run master remains unchanged. The owner watched the wave and liked its appearance on 2026-09-07.

## Play it

1. Move the pointer over the large character view.
2. Press **Space** to play or pause. **Shift + Left Arrow** returns to the start.

## Switch clips

The panel immediately below Kaida is the **Action Editor**. In its header, look for the field named **wave.demo**. Click the action chooser immediately to its left, then choose an action from the list. Keep **Armature** selected in the upper-right Outliner if the chooser is empty.

Set **End** at the right of the playback bar to match the selected clip:

| Action | End frame | What it does |
| --- | ---: | --- |
| `wave.demo` | 90 | Raise the right hand, wave twice, lower it |
| `idle.source` | 60 | Original Mixamo idle |
| `run.source` | 23 | Original Mixamo run, including forward travel |

**Start** stays **1**, and all clips use 30 FPS. After switching, return to the start and press Space. The run moves through the scene because its original travel is retained.

The wave combines the existing idle's body motion with newly keyed right upper-arm, forearm and hand rotations. The source actions, skin and textures are preserved. [Authoring script](../../author_wave_demo.py) records the experiment; [review and checks](review.json) record the saved result. It is not yet a runtime character candidate or a replacement for the outstanding walk/attack/hurt inputs and finishing.
