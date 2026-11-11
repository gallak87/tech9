# Course-private cranio-thoracic extension

Original connected cortical anatomy for Saffron Ossuary, authored against the
actual fitted skull, banked road, dunes and native approach cameras. Unequal
folded fans, genuine through-galleries, one sheltered occipital pocket and a
buried asymmetric shoulder preserve a bright road exit. The original Saffron
concept and project-owned cranial/scapular construction language guide the
pale leached cortex, chalk lips and warm marrow. Canonical assets and the route
remain read-only.

From `games/vector-nova`, regenerate the temporary editor-only guide and build:

```sh
node assets/levels/eliminator-saffron/export-authoring-guides.mjs /tmp/vector-nova-saffron-guide.json
blender --background --factory-startup --python assets/levels/eliminator-saffron/cranio-thoracic/build_cranio_thoracic.py -- --guide /tmp/vector-nova-saffron-guide.json
```

The guide may live at any explicit absolute or relative path. Its large JSON
is not a shipping dependency. The Blend retains guide road, skull, dunes and
cameras for editing; only original anatomy and sediment export beneath the
identity world-space root `ossuary_cranio_thoracic`. The child
`ossuary_sediment` borrows the existing course bedrock finish.

The three established bone roles use one restrained geometry-derived cavity
COLOR_0 bake: twelve deterministic hemisphere rays per vertex against the
actual closed anatomy and fitted canonical skull, a 72 m radius and two
connected smoothing passes, with neutral visibility values from .76 to 1.
There are no textures or artificial lighting in this source. The broad folded
forms and clean lips retain a deliberately sculptural finish; small-scale
weathering and normal response belong to the established runtime material.

`manifest.json` records source/Blend/export/reference hashes, semantic guide
identity, closed-component checks and all-route triangle SAT plus enclosed-solid
negative-control guards. Actual exported POSITION accessor indices and hashes
identify both fans' vertices inside canonical skull volume in three directions,
complete buried fan/root toe regions and the sediment's complete bottom and
upper perimeter. Dune depths use the actual rendered triangle diagonal rather
than bilinear heights or object-bound centres. These records regenerate in the
builder; temporary guide filenames are irrelevant. Raw input hashes are a
source snapshot; semantic geometry identity survives source-only formatting.
