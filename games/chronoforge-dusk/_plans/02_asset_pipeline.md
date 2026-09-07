# 02 — Asset pipeline and Kaida source handoff

**Type:** bounded tooling assignment plus manual-assisted asset acquisition. **Status:** local tooling complete and verified with static/skinned diagnostics; owner-supplied Kaida Meshy r2 has a textured rig and assembled idle/run source actions. Proportions remain provisional; walk, attack, hurt and finishing are pending.

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

See the [local commands and manifests](../_prep/README.md), [22-check native runtime evidence](../_prep/evidence/proofs-r1/README.md), and [Kaida reference/source handoff](../_prep/KAIDA_HANDOFF.md). Both runtime recipes retain masters, maps, source motion, export scenes/settings and immutable candidate packages. The owner requested the original-sprite-based 2D A-pose and separate blade, then simplified the cuffs/forearms in reference r2. The owner supplied Meshy r2's FBX and four PNG maps. [Source preparation](../_prep/assets/kaida/README.md) preserves the original download, packed Blender masters, named maps, mesh proportions and topology, with verified FBX/GLB reimports. The owner considers her too skinny and wants to continue with this provisional body. Mixamo accepted the full mesh without textures and returned a 65-bone rig. The reusable `mixamo_upload`, `mixamo_restore` and `mixamo_clips` preparation steps automate that local round trip and compatible clip assembly; see [MIXAMO.md](../_prep/MIXAMO.md). Idle/run are assembled; walk, attack, hurt and rig/export finishing remain pending. Step 03 still requires a finished real character candidate.

## Reuse notes and spot-check — 2026-09-07

The implemented source/recipe split still matches this plan. All three preparation commands ran on the real Kaida; 18 local tests and nine Blender rejection checks passed. Idle/run source poses also matched at every integer frame after transfer and save/reopen. Runtime format 1 remains unchanged. The following refinements should carry into the next character:

- **Use the automated local steps:** [MIXAMO.md](../_prep/MIXAMO.md) documents `pipeline.py prepare` with upload, restore and clip-assembly metadata templates. Prepared uploads omit materials/maps; returned rigs recover the packed source material only after bind-geometry and per-corner UV checks. Current scope is one triangulated mesh, one UV set and one source material.
- **Preserve geometry while diagnosing uploads.** Kaida's full 81,202 triangles uploaded and rigged successfully without textures after the textured upload failed. The old 24k success did not establish a triangle ceiling. Do not adopt blanket decimation or infer an existing rig from Mixamo's generic mapping-error text.
- **Keep rigging output intact until clip finishing.** The returned base has 65 bones, up to seven weights per vertex and a two-frame static T-pose facing opposite its original A-pose. The restore tool changes the editor view, not the rig or action. Preserve those sources; verify compatible clips, then handle axes, influence limits and in-place export deliberately. A static T-pose is not idle.
- **Check clip compatibility before transfer.** `mixamo_clips` compares names, hierarchy, rest matrices, transforms and FPS, then verifies transferred motion. Animation-only downloads are convenient; the owner's matching downloads with skin worked too. Preserve source travel (Kaida's run moves 3.71188 m), and keep in-place corrections separate.
- **Interactive authoring is optional.** [The shared Blender Lab MCP connection](../_prep/BLENDER_MCP.md) supports editing and inspecting an open Blender scene; headless scripts still handle offline work. The owner liked a [separate authored wave demo](../_prep/assets/kaida/demos/wave-r1/README.md) built over the retained idle. It demonstrates the edit/review loop without replacing the required gameplay roles or accepting the full character.
- **Reuse the game foundation.** Supply immutable candidate revisions with embedded materials and all five clips, a separate weapon dependency, and actual character dimensions/grip. Keep controller displacement and saved tuning game-owned. The diagnostic rig paths, height and grip offsets are examples, not defaults for the next character.
- **Current stopping point:** Kaida's textured idle/run master is ready for Blender review, with proportions still provisional. Walk, attack and hurt are the next inputs; deformation/grip review and a finished runtime candidate are pending. No new native-app validation or visual acceptance is implied by these preparation checks.
