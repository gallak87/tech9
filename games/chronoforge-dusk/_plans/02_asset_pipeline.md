# 02 — Asset pipeline and Kaida source handoff

**Type:** bounded tooling assignment plus manual-assisted asset acquisition. **Status:** complete first candidate handoff: Kaida runtime r4 has all five gameplay clips and a separate sword, verified in the native foundation. Proportions and animation polish remain provisional for 03.

**Requires:** 01's concrete runtime descriptor for final export/integration. Reference inspection and source acquisition can begin alongside 01.

**Read:** [AGENTS.md](../AGENTS.md), [_prep overview](../_prep/README.md), and [asset handoff](../_prep/ASSET_CONTRACT.md). Inspect original [Kaida/assets](../../chronoforge/src/assets) directly. Use relevant lessons when diagnosing an actual problem.

## Outcome

A small production pipeline with metadata-selected stages, versioned candidates, and reproducible exports suitable for Dusk's game-owned importer. Prove both a skeletal route and a shorter static route. Prepare the real new Kaida for the in-game refinement in 03.

## Work

1. Define production metadata around asset ID, source files, recipe, animation mode, required outputs, and dependencies. Keep provider details separate from the runtime descriptor owned by the game.
2. Implement only the local stages needed now: source inspection/preparation, Blender processing/export, applicable structural checks, candidate packaging, and explicit handoff. A static prop bypasses generation/rigging. A humanoid uses rig/clip stages when required. Metadata selects named operations; it is not arbitrary shell code.
3. Retain immutable downloads, texture sources, editable Blender files, animation originals/corrections, export settings, tool versions, and candidate/accepted history. Record asset provenance and applicable attribution when acquiring it.
4. Prove the static route with a simple newly authored Blender prop. Prove the skeletal export/check route with a real skinned fixture or available new Kaida input; label fixture results honestly. Follow the game's descriptor instead of inventing a competing format.
5. Prepare the original Kaida design for Meshy or Blender modeling. Keep her magenta hair, cyan jacket, agile silhouette, and separate energy blade. Add only the coherent reference views needed to resolve missing shape/detail.
6. Prepare the mesh for rigging: inspect hands, joints, topology, UVs, scale, orientation, and materials. Optimize selectively; preserve an editable master before geometry changes. Do not damage palms or silhouette to reach a universal triangle count.
7. Document and, when the owner supplies the inputs, process the manual Mixamo round trip: upload the prepared humanoid, place/check markers, download the rigged base and selected clips for that same skeleton, and retain names/options. Base-with-skin plus animation-only downloads are a starting convention to verify.
8. Assemble/finish source motion in Blender, retain useful bones and clips, and export declared animation roles. Reimport the actual output to check skin, textures, scale, facing, clips, and attachments. Supply the candidate to the game lane for 03.

The first complete runtime candidate needs idle, walk, run, one attack, and a basic reaction: format 1 requires all five roles. Verify the first base/idle pair before collecting the rest. Do not strip imported animation to reproduce Dawn's old contract. Preserve source root motion while conforming exports to the game's chosen displacement policy.

## Manual inputs and diagnosis

Meshy/Mixamo clicks are acceptable. A manual stage describes what to upload, download, and inspect, then records the returned files. If the real model or clips are missing, deliver the local tooling and exact outstanding input request; do not fabricate completion or spend the assignment generating the whole cast.

Carry texture sources around the rigging round trip. Inspect an upload error before assuming a universal service limitation. Verify UV/material correspondence when reattaching maps. Local ML, private service APIs, provider plugin systems, and full browser automation are not prerequisites.

Prefer explicit rebuilds initially. If caching becomes useful, include source/texture/clip bytes, recipe, scripts, handoff version, and relevant tool versions in its identity.

## Ownership and done

Own `_prep/` production sources/tools/metadata and candidate output. The game owns runtime import and presentation settings. Coordinate changes to their shared handoff.

Tooling is done when both selected recipes generate inspectable packages with truthful checks and documented inputs. Record separately whether real Kaida acquisition is complete or waiting on manual inputs. Structural readiness does not establish visual acceptance.

Deliver a candidate manifest/example, reproducible commands, a simple static prop, skeletal-route evidence, and either a real Kaida candidate or a precise source/clip handoff request. Stop before claiming polished Kaida, generating the remaining cast, or building a universal asset framework.

## Implementation handoff

See the [local commands and manifests](../_prep/README.md), [22-check native runtime evidence](../_prep/evidence/proofs-r1/README.md), and [Kaida reference/source handoff](../_prep/KAIDA_HANDOFF.md). Both runtime recipes retain masters, maps, source motion, export scenes/settings and immutable candidate packages. The owner requested the original-sprite-based 2D A-pose and separate blade, then simplified the cuffs/forearms in reference r2. The owner supplied Meshy r2's FBX and four PNG maps. [Source preparation](../_prep/assets/kaida/README.md) preserves the original download, packed Blender masters, named maps, mesh proportions and topology, with verified FBX/GLB reimports. The owner considers her too skinny and wants to continue with this provisional body. Mixamo accepted the full mesh without textures and returned a 65-bone rig. The reusable `mixamo_upload`, `mixamo_restore` and `mixamo_clips` preparation steps automate that local round trip and compatible clip assembly; see [MIXAMO.md](../_prep/MIXAMO.md). Idle/run were retained from Mixamo; a local Blender pass authored walk, attack and hurt and finished the rig/export. Runtime candidate `kaida/r4` and separate `kaida.energy-sword/r2` are now available for 03.

## Reuse notes and spot-check — 2026-09-07

The implemented source/recipe split still matches this plan. All three preparation commands ran on the real Kaida; 18 local tests and nine Blender rejection checks passed. Idle/run source poses also matched at every integer frame after transfer and save/reopen. Runtime format 1 remains unchanged. The following refinements should carry into the next character:

- **Use the automated local steps:** [MIXAMO.md](../_prep/MIXAMO.md) documents `pipeline.py prepare` with upload, restore and clip-assembly metadata templates. Prepared uploads omit materials/maps; returned rigs recover the packed source material only after bind-geometry and per-corner UV checks. Current scope is one triangulated mesh, one UV set and one source material.
- **Preserve geometry while diagnosing uploads.** Kaida's full 81,202 triangles uploaded and rigged successfully without textures after the textured upload failed. The old 24k success did not establish a triangle ceiling. Do not adopt blanket decimation or infer an existing rig from Mixamo's generic mapping-error text.
- **Keep rigging output intact until clip finishing.** The returned base has 65 bones, up to seven weights per vertex and a two-frame static T-pose facing opposite its original A-pose. The restore tool changes the editor view, not the rig or action. Preserve those sources; verify compatible clips, then handle axes, influence limits and in-place export deliberately. A static T-pose is not idle.
- **Check clip compatibility before transfer.** `mixamo_clips` compares names, hierarchy, rest matrices, transforms and FPS, then verifies transferred motion. Animation-only downloads are convenient; the owner's matching downloads with skin worked too. Preserve source travel (Kaida's run moves 3.71188 m), and keep in-place corrections separate.
- **Interactive authoring is optional.** [The shared Blender Lab MCP connection](../_prep/BLENDER_MCP.md) supports editing and inspecting an open Blender scene; headless scripts still handle offline work. The owner liked a [separate authored wave demo](../_prep/assets/kaida/demos/wave-r1/README.md) built over the retained idle. It demonstrates the edit/review loop without replacing the required gameplay roles or accepting the full character.
- **Reuse the game foundation.** Supply immutable candidate revisions with embedded materials and all five clips, a separate weapon dependency, and actual character dimensions/grip. Keep controller displacement and saved tuning game-owned. The diagnostic rig paths, height and grip offsets are examples, not defaults for the next character.
- **Current stopping point:** the [grounded candidate and review file](../_prep/assets/kaida/demos/foundation-r3/README.md) are ready for owner review and 03 refinement. No more Mixamo downloads are required for this first phase. Native integration checks pass; visual acceptance remains pending.

## First grounded set — 2026-09-07

The owner requested modular movement/action pieces rather than collecting more service clips. The rigging round trip is complete; Mixamo is optional as a motion library from here. `author_foundation.py` preserves the retained idle/run source master, bakes its sampled poses into a unit-scale working rig, and authors walk, a planted one-handed slash, and a short hurt reaction. `author_sword.py` builds new separate geometry from the retained reference. These are Kaida-specific authoring scripts, not universal retargeters.

Runtime r2 contains idle, walk, run, attack and hurt. Godot owns approach/return travel; the attack owns its wind-up, strike and recovery poses. The 41-frame attack at 30 FPS contacts on frame 21, halfway through its 1.333-second exported duration. The exporter now starts clips at zero and measures dimensions in rest pose so the currently selected animation does not change the physical descriptor. Three runtime texture images preserve base color, normal, and explicitly packed metallic/roughness channels; all four original maps remain upstream.

The rig keeps 65 original bones and adds `MotionRoot` and `SwordSocket`. The candidate limits weights to four influences; 779 vertices changed, with maximum discarded weight 0.0591 before renormalization. Original weights remain in the prior master. Joint/hand deformation still needs visual refinement. Do not confuse structural readiness with polished combat.

The [native candidate check](../_prep/evidence/kaida-r2/README.md) passed 29 checks, including five imported clips, real skin motion, separate equipment, in-place movement, and one rehearsal impact followed by return to formation. The 18 local pipeline tests passed. 03 should next tune stride/blending, plant/contact, grip, materials, camera and normal-play performance. Jump/flying attacks can later combine launch, airborne strike and landing with a controller-owned trajectory; that expansion and the full ATB system are outside this first set.

## Grip review correction and reuse lesson — 2026-09-07

The owner rejected the original backward finger curl and unnatural elbow lift, then rejected the first attempted correction because the hand still did not enclose the handle. Preserve those reviews as unsuccessful iterations. Export/reimport and the native smoke test did not establish believable anatomy.

The current `foundation-r3` source/review (runtime `kaida/r4`, sword `kaida.energy-sword/r2`) fits each finger to a diagonal socket near the knuckles and narrows only the handle/binding cross-section. [grip_pose.py](../_prep/assets/kaida/grip_pose.py) holds the local fit shared by all five clips; it must be re-fit for another hand or weapon. The elbow pole stays low and wrist orientation uses the forearm plus the actual diagonal grip. [The source render tool](../_prep/assets/kaida/render_foundation_review.py) checks every attack frame and palm/back/fingertip close-ups at start, wind-up and contact. Use small static grip studies before rebaking a whole set; check finger/handle contact from both sides. Maximum measured wrist-axis deviation is 30.58 degrees over this attack, which is evidence of a bounded pose, not visual acceptance.

The current slash is a motion draft. For the next quality pass, a suitable Mixamo attack can supply more credible whole-body mechanics, with local grip, planting, timing and transition cleanup. The approved wave did not establish that procedural combat authoring would be equally quick. The modular roles, source retention, controller-owned travel and separate equipment still support 03; no full ATB or aerial sequence was added. Current [review and version instructions](../_prep/assets/kaida/demos/foundation-r3/README.md) distinguish Meshy, source, review and runtime revisions. Earlier candidate files remain retained; the selector shows only the latest Kaida to avoid ambiguity.
