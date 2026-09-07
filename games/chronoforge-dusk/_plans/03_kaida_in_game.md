# 03 — Kaida in game

**Type:** iterative asset/game refinement with owner playtesting. **Status:** unblocked by 02’s real `kaida/r2` candidate and native integration smoke check; owner-led refinement remains to begin.

**Requires:** the working native foundation from 01 and a real new Kaida model/rig/clip candidate through 02. If manual source inputs remain missing, resolve those first; a test actor cannot satisfy this step.

**Read:** [AGENTS.md](../AGENTS.md), [asset handoff](../_prep/ASSET_CONTRACT.md), and relevant [validation](../VALIDATION.md). Inspect Kaida's original [battle idle](../../chronoforge/src/assets/kaida_battle_idle.png), [overworld sprite](../../chronoforge/src/assets/kaida_overworld.png), and other useful original assets directly.

## Outcome

The original Kaida brought into a convincing modern 2.5D game, with polished appearance, movement, grip, and battle presentation. AAA-quality finish is the ambition; judge the actual native game at traversal and battle scale.

Preserve magenta hair, cyan jacket/top, dark lower clothing, boots, an agile silhouette, and a luminous magenta blade. Resolve missing details through coherent references. Do not inherit the prototype's redesign or copy Dawn's model.

## Work in the actual game

1. Import the identified candidate using the game's standard actor path. Confirm the revision shown on screen, materials/textures, scale, orientation, skeleton mapping, clips, and equipment attachment.
2. Inspect shoulders, elbows, hips, knees, wrists, palms, and fingers across complete motion cycles. Keep the sword separate, with a believable grip and blade path. Repair the owning mesh/weights/clip rather than hiding a defect with glow or offsets.
3. Tune real traversal: starts, walking/running, turns, stops, collision, camera tracking, and ground contact. Make stride, playback speed, and game displacement agree.
4. Tune the actual rehearsal action: ready, anticipation, approach, plant, strike, impact, recovery, and return. Add hurt and defeat states, and a technique pose when useful. Coordinate clip playback, target reaction, hit stop, camera, effects, and sound on one action timeline.
5. Extend the development controls only where they help diagnosis: clip/action replay, slow/stepped motion, skeleton/sockets, contact markers, accepted-versus-candidate comparison, and repeatable captures.
6. Refine the small surrounding patch and game lighting enough to judge the intended experience. Keep neutral inspection available to distinguish asset defects from presentation problems.
7. Save accepted settings outside generated imports, restart, and reproduce the result. Record asset/game revisions and measured native performance.

Movement initially stays controller-owned with in-place clips. Preserve original clip data upstream. Introduce root-motion extraction only for a concrete benefit with one explicit displacement owner; avoid doubled movement or accumulating compensation offsets.

A generic motion-library clip may need authored corrections to fit Kaida's proportions, weapon, and personality. Animation roles do not imply a separate downloaded file for every transition; use useful blends and source edits.

## Ownership and iteration

Asset work owns model, UVs, weights, source clips, and export corrections. Game work owns import integration, blending, control, camera, action timing, effects, and sound. Keep both connected to the same evaluation build. One integrator controls comparisons; preserve accepted candidates before changes.

For each defect, identify whether the cause is geometry, skinning, clip, blending, movement, camera, materials/light, effects, or sound. Re-test comparable actions after changing that layer. Do not regenerate the model merely because a downstream result looks wrong.

## Done

Kaida remains recognizable at actual gameplay size. Skin, grip, attachments, ground contact, and transitions hold through normal play. Movement responds well; attacks have convincing anticipation, contact, recovery, and return. Lighting and effects support readability. The native build performs acceptably under documented settings and reproduces accepted tuning after restart.

The owner plays the short traversal/rehearsal and is happy for Kaida to become the quality reference. Record remaining optional embellishments separately from blocking defects. One agent assignment may complete a focused correction pass; it must not pretend subjective polish is guaranteed in one shot.

Stop before expanding into the whole game. After acceptance, 04 proves repeatability and 05 opens the owner-led story discussion. Subsequent characters inherit the method while retaining their own proportions and movement identity.
