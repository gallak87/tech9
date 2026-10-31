# VECTOR//NOVA trailer · RC1

Frozen review candidate of the approved interwoven trailer. The next recording follows the in-flight gameplay updates and bug fixes and the [re-record TODOs](../TODO.md).

- [Video](vector-nova-rc1.mp4): 67 seconds, 4020 frames, 1920×1080 H.264 at 60fps, stereo AAC at 48kHz.
- [Frozen script](script.md).
- [Frozen edit plan](edit-plan.json): capture setup, source windows, frame boundaries and music arrangement.
- [Working script](../script.md) and [working edit plan](../interwoven.json) for subsequent revisions.

The MP4 is a byte-for-byte copy of the approved cut. Size: 90,275,927 bytes. SHA-256:

    5522076bc62868c3db6c2a12681daa393a27a381e12f3d1f26fce908ee8e089f

The game rendered at 1600×900, scaled to the 1080p export. RC1 passed full audio/video decoding; source-frame and menu checks covered the weapon hit/pass, native C camera changes, creature, gravity lensing, tower motion, Garage loadout and final landing. The recorded finale matches Garage’s fully upgraded Kestrel with Quad Core and Jump Drive, Reserve Injector, Deflector and Lance.

## Re-recording

Keep these RC1 files frozen. Save the next movie and its script/edit snapshots in a new candidate folder.

Use the [gameplay capture runner](../../tools/marketing/prototype.mjs), [menu capture runner](../../tools/marketing/menu-capture.mjs) and [trailer assembler](../../tools/marketing/trailer.mjs). Run their commands from the game directory.

The edit plan references raw takes under local ignored .experiments/ directories; those raw recordings are not bundled with RC1. They remain available in the current workspace. The plan documents the approved edit and requires those sources to reproduce it exactly.

For the next candidate, record fresh gameplay and menu takes after the fixes land, including the real Time Trial record/ghost sequence and more visible pointer movement. Refresh the edit plan’s importFrom paths and source in-points using the new action markers rather than reusing RC1’s old footage. The ghost sequence and browsing movement may require timing changes before assembly.
