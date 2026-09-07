# Building Dusk environments

These are working authoring rules from the coastal 06 prototype and the owner's playtest. Use them for the next environment; revise them when a native playtest supplies better evidence. They are not a new pipeline or level editor. [06's handoff](evidence/environment-06/README.md) records what has actually been verified.

## Begin with movement, not scenery

- Lay out the connected route at the current character's real scale. Reuse `DuskCharacter`, its prepared asset, and accepted walk/run/stride settings. Environment framing must not overwrite inspection or rehearsal tuning.
- **A held direction should carry the player along the main path.** The owner found the first coastal camera's 18° yaw frustrating: following an orthogonal road required alternating W and D. The coastal view now uses 0° yaw, so camera-relative WASD and the route's axes agree. Do not reintroduce long narrow paths oblique to keyboard movement just to make a screenshot more interesting. Use generous turning spaces and test any deliberate diagonal passage with ordinary keys.
- Keep one stable movement frame through a connected space. Camera turns, thresholds, or transitions must not unexpectedly redirect held input. Normalize diagonals. Walking, running, braking, and animation playback remain controller-owned.
- The current Kaida capsule has a 0.32 m radius and about 1.90 m height. Budget passage width between the **actual colliders**, including rails, equipment, and corners. The coastal crossing is 4 m wide before its edge rails; its ramps are 6–7 m wide. These are a comfortable starting point, not universal minimums. Verify narrower spaces at walking and running speed before dressing them.
- Without jumping or climbing, every required elevation change needs a continuous walkable surface. 06 uses a 3 m rise over 13 m and 16 m runs (about 13° and 11°). Maintain matching endpoints, floor snap, and a flat turning area. Decorative steps/planks can use a continuous ramp collider only when visual foot contact remains convincing.
- Mark a safe arrival before activating the actor's collider. Test ordinary cold startup before placing or resetting the actor in a test. Every route needs a comfortable return and an explicit reset to the safe spawn.

## Make physical boundaries legible

- Collision should agree with the visible construction. Protective collision can extend above a low parapet to keep a capsule from climbing it; it must remain on that visible edge, not create an unexplained fence across open ground.
- Test both directions through slope seams, inside and outside corners, narrow passages, and optional spaces. Run into boundaries, release input, then turn away. No falls, trapping, persistent sliding, or residual running animations against a wall.
- Keep foreground vegetation low and nonblocking unless its physical role is clear. Put solid props at deliberate margins and give them simple colliders. Small rubble must not turn a clear path into a sequence of invisible snags.
- Separate collision from imported render meshes. Preserve editable metre-scale Blender sources and let the game own simple terrain and traversal shapes. Check the visible deck against its collision plane: 06 initially hid the timber deck under its blockout paving.

## Compose for the camera and the moving player

- Use the actual elevated gameplay camera while authoring. A dramatic editor orbit does not establish a readable location. Keep Kaida, her feet, and her carried sword identifiable against the surface and shadow behind her.
- Fix foreground obstruction in the scene. Low front walls, roofless compositions, and smoothly fading individual occluders are available choices. Do not ask the player to orbit to find Kaida. The inspection camera remains a separate tool.
- Keep follow and height changes comfortable. Author panoramic framing for a specific overlook when it helps, and blend into it gradually without changing the movement axes. Verify the **whole landmark** fits the intended view, rather than only its base.
- Distinguish arrival, through-route, turning spaces, elevation, side space, and a distant focal point. Use scale, repair details, materials, and light to give those spaces a purpose. Do not rely on story gates or labels to make an unreadable route usable.
- Ground construction in believable support, proportions, and material transitions. Concentrate wear at joints, waterlines, exposed edges, and repairs. Avoid evenly scattering the same prop everywhere. Salt masonry, oxidized useful technology, timber repairs, and coastal plants establish 06's identity without assigning story canon.
- Judge water, foliage motion, shadows, and sound in the exported app. Keep moving details restrained, footsteps tied to grounded travel, and pause/inactive behavior consistent across animation, audio, and effects.

## Scope of this evidence

06 contains open ruin arches and outdoor traversal. Enterable rooms and indoor/outdoor transitions are outside this assignment and have not been prototyped or accepted as a production pattern.

## Asset and delivery checks

- New static meshes use Dusk's `static_blend` recipe and `DuskAssetAssembly`; terrain, water, light, layout, and effects can remain Godot-owned. No character acquisition stages are needed for scenery. Retain editable sources, maps, provenance, metadata, and immutable selected packages.
- Revisions get new identities. Confirm a real revision/reimport in the native app without changing Kaida's package or accepted tuning. Shared mesh batching is an implementation choice after measurement, not permission to skip descriptor/hash validation.
- Export and play the complete route through real input, in both directions and at both speeds. Automated `Input.parse_input_event` route coverage is useful engineering evidence; also record direct OS input and the owner's subjective playtest separately. A report must not imply human review that did not happen.
- At 1920×1080 and the 60 FPS cap, measure warmed stationary and traversal intervals. Record frame-time distributions and spikes, draw calls, geometry, memory, and available CPU/GPU data. Keep readback, screenshots, imports, startup, and capture runs separate from normal-play measurements. Verify 30 FPS pause and 10 FPS inactive behavior.
- Scope regression runs to the affected system. Scenery-only edits do not require repeating the Kaida suite solely to match a global source digest; retain and label the existing passing evidence.
- Deliver the launchable native app, exact source/asset identities, representative gameplay captures and motion, actual checks, and remaining limits. Commit coherent tested checkpoints. Finish the assigned environment scope before starting the next milestone.
