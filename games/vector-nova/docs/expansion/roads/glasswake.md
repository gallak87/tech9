# Glasswake Comet — road finish

Use the [road workflow](README.md). Target `glasswake`; preserve crystal/frost gameplay cues.

## Starting point

The [road builder](../../../src/levels/glasswake/track/production.js) owns separate High/Low crystal materials, opaque frost bands, ribs and edge fins. It loads `ice-surface-v1.png` through [ice/crystal finish helpers](../../../src/levels/glasswake/environment/materials.js). [Surface sampling](../../../src/levels/glasswake/surface.js) ties the authored frost bands to reduced grip.

## Investigate

Assess crystal depth, reflection/roughness, frost structure and the texture's physical scale under the actual glacial lighting. Improve the sense of dense ice and opaque frost without obscuring where the ship can drive. Determine whether the map, shader, transparency or construction is the limiting factor before choosing a replacement. Protect the distinction between clear rib lanes and pale low-grip areas.

## Keep and check

Use a clear deck, a frost boundary, a banked rib/fin view and a fractured jump's receiving shelf. Compare both quality modes for visibility through stacked crystal and for repeated or sparkling detail at speed. Preserve all grip-zone bounds, supported triangles and fracture gaps. Check the [material tests](../../../tools/expansion-glasswake-materials.test.mjs) and relevant road/grounding checks if affected. The texture/helper is also used by scenery: audit consumers and keep their finish coherent without broadening into an environment rebuild.
