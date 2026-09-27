# Selected Echo artwork

These are selected project-generated images reused from `games/chronoforge-echo` for the Tech9 preparation requested by the project owner. Echo's `ART_DIRECTION.md` describes the generated art as self-contained. This record does not assert a new public license, third-party copyright assignment, or CC0/MIT status for the artwork. No separate third-party art license was present for these images in the inspected source package.

`provenance.json` records exact source paths, dimensions and SHA-256 hashes. Runtime PNGs are unmodified copies of the selected, losslessly optimized Echo files. The original generation wording for these particular sheets is unavailable in the inspected records; later victory-pose prompts are not substituted for that missing history.

`runtime/` contains the shipped prepared images. `sources/` retains the generated originals needed for editing/preparation. `runtime/coast-props.png` is itself the editable original and already has usable alpha. Source metadata, measured crops and foot anchors live in `src/coastal.js`. `src/authoring.js` preserves the neutral-exterior extraction thresholds/seeds and coastal ground preparation. Prepared runtime alpha and terrain must not be processed twice. The original and prepared images are raster editing sources; layered source files were not present.

Rendering and exploration algorithms were adapted from Echo's viewport, touch input, artwork, world-scenery, traversal and asset-cache implementations. Echo keeps its separately maintained code and campaign. PixiJS is a package dependency with its own MIT license; its source is not vendored here. This module includes no font binaries.
