# Canyon

A rocky highland scene for grounded exploration and fly inspection. Layered sandstone walls, fractured ledges, scree and sparse scrub frame a walkable gorge opening onto a broad overlook. A small timber shelter provides scale and a covered viewpoint.

## Scene

- Author a compact route from the gorge floor to the overlook, with surrounding scenery for elevated views.
- Build convincing strata, weathering, fractures, slope debris and material variation at walking and elevated distances. Use asymmetric formations and recognizable landmarks.
- Compose narrow passages, light reaching the canyon floor, shadowed rock, open sky and a distant rim. Vegetation supports the geology.
- Provide grounded movement, fly inspection, named views, reset, pause and graphics controls. Visible surfaces and substantial obstacles must agree with traversal and camera clearance.

## Reuse

Use the forest baseline's application lifecycle, renderer and suitable modules while authoring a distinct world. Terrain, placements, material responses and shelter exposure belong to the scene. Reuse the existing weather module for rain, wetness, snow and wind after the dry scene meets its visual and traversal requirements.

The height query represents one ground surface at each horizontal position. Add contact or exposure information only where authored overhangs and multiple surfaces require it. Keep one application-owned renderer, frame loop, sky, fog and lighting setup.

Apply [framework-dev](../../FRAMEWORK_DEV.md) to reusable assets or behavior demonstrated by the scene. Choose package placement and baseline selection when a second starting scene is accepted; [world composition](../../ROADMAP.md) remains separate capability work.

## Acceptance

Walk the complete route, inspect sheltered and exposed views, and verify pause/focus loss, reset and graphics changes. Review geology, silhouettes, material scale, lighting, repetition and composition against concrete environment references at ordinary traversal distances and close up. Follow [WORKFLOW.md](../../WORKFLOW.md) for checks and review evidence.
