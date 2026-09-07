# Diagnostic fixtures for native foundation

Run `python3 generate.py` (Python 3.10+, standard library only) from this directory or use its absolute path. The output is deterministic. No Blender, hosted generation, Mixamo, external art or other game code is used.

The generator writes two approximately 14 KB original GLBs with a rigid articulated block mannequin, five in-place clips (`idle`, `walk`, `run`, `attack`, `hurt`) and one separate baton GLB. Slate/clay are material variants with immutable revision paths. Both are explicitly placeholders, not a proposed Kaida design. The geometry uses 12 triangles per box mesh and shared mesh instances; there are no textures or skeletal weights.

Coordinates are authored directly in glTF metres, Y up, -Z front, origin on the ground. The dark face marker identifies front. Height is 1.85 m. A named Grip node travels with the right arm; the baton attaches through the runtime descriptor.

These fixtures establish standard Godot model/clip import, identity, reference errors, sockets and controller wiring. They establish no production rigging, deformation or visual quality. `_prep/fixtures` is the explicit small-fixture allowance in plan 01, not the production tooling for 02.
