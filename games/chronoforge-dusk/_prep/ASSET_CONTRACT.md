# Asset handoff draft

**Status: design draft to prove with Kaida and one static prop.** This describes the producer/consumer boundary; it is not an implemented schema, a validation guarantee, or a frozen skeleton specification.

The game owns its runtime requirements and how assets are assembled, animated, and displayed. The pipeline emits assets that meet those requirements. Both lanes agree on the handoff; provider-specific details stay upstream.

## Separate production instructions from runtime facts

| Production manifest | Runtime descriptor |
| --- | --- |
| Source files and reference revision | Stable asset ID and revision/hash |
| Chosen recipe and stage dependencies | Asset kind and animation mode: none, rigid, skeletal |
| Provider/download information and manual steps | Exported model/image/animation files and dependencies |
| Blender/script/tool versions and export settings | Scale, orientation, origin, and measured bounds |
| Working files, build/cache inputs, reports | Materials/textures, clip roles, sockets, and applicable motion policy |
| Candidate/accepted history | Compatible handoff version and successful import identity |

Use one explicit format when implementation begins. Avoid duplicating the same convention in scripts, copied mapping files, and prose. Changes to the handoff version should be intentional; do not build compatibility adapters for previous experiments.

## Shared baseline

- Exports have stable IDs and immutable revision identity. Missing dependencies or incompatible requirements produce a clear failure.
- Use glTF/GLB for the first 3D runtime handoff, retaining Blender/FBX and source textures upstream. Do not export the entire source-production workspace with the game.
- Use metres for the agreed runtime scale. Define facing/up and origin once, and verify the imported orientation in Godot. Blender/exporter coordinate conversion must not be applied twice.
- Character placement uses a ground-aware origin and declared physical scale. Static props use a useful placement pivot. Do not force all characters to Kaida's exact height or all objects to a character convention.
- Declare material/texture assignments and color-space roles. Reimport the output to verify them; file size is not evidence of correct texture embedding.
- Record relevant geometry, material, texture, and animation counts. Establish budgets from actual use and measured cost. Validation should state which limits it enforces.

## Skeletal assets

- Identify the skeleton/profile mapping and rest-pose assumptions. Godot's humanoid profile is the initial tool for suitable characters, with manual review where required. Matching bone names alone does not prove compatible motion.
- Preserve skinning, useful deformation bones, and imported animations. Inspect normalized weights and supported influence counts in the actual import path.
- Map gameplay roles such as idle, walk, run, attack, hurt, and defeat to named clips. Record duration, loop behavior, and any clip speed/trim decisions.
- Declare where displacement comes from. The initial game uses in-place traversal and game-owned battle movement. An intentional exception must name its owner and be tested.
- Define weapon/attachment socket semantics and local grip transforms. Separate the weapon from the character body. Exported attachment transforms must be checked with the actual equipment and animation.
- Clip-specific event markers may travel with the asset, but the game owns the action timeline and gameplay effects. There must be one agreed impact event, not competing timers.

## Static and rigidly animated assets

Static assets declare no skeleton or clips and must bypass humanoid processing. Include placement scale/pivot, material dependencies, and any collision/placement intent the game needs. The game owns actual physics behavior and may use a simple authored collider rather than render geometry.

Rigid animation declares its clips and animated parts without pretending to be humanoid motion. Machinery, doors, and similar props can remain Blender-authored objects/animations. Route validation follows those requirements.

Images and other non-3D assets have their own dimensions, alpha/color-space, or format requirements when introduced. Do not create a skeleton-shaped schema for every asset.

## Import, tuning, and acceptance

The game may import a technically valid candidate for evaluation. It must display the candidate's identity and retain the accepted version for comparison. Promotion is deliberate and must not destroy the previous version.

An acceptance record pairs the asset revision with the game revision and saved presentation settings used to evaluate it. Restore that combination for a true rollback or comparison; restoring only a model after changing animation/controller settings may not reproduce the prior result.

Separate imported/generated resources from game-owned movement, blending, camera, material overrides, and action definitions. Reimport must not erase those decisions. A saved development-mode change belongs to the owning game configuration and must survive restart.

If an export renames or removes a referenced bone, clip, material, or socket, report the affected game settings explicitly. Do not silently discard overrides or substitute an unrelated clip to make the import appear successful.

Use simple states with clear meaning: source/working, candidate, accepted, and superseded. Candidate means structurally ready to inspect. Accepted means the declared in-game appearance, motion, and performance checks have been completed with evidence; it is not implied by export success.
