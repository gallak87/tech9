# Map 6 — Cindercoil: level completion brief

## Assignment and authority

**Goal:** Finish a volcanic circuit with lava-surge line choices, a vent launch, a rupturing caldera and warm molten light against cool ash/shadow.

Read this brief, [the common execution rules](../README.md) and the current [level API](../../LEVEL_API.md) from the primary worktree when the user resumes you. Continue your existing level work with the latest primary code. Consult architecture/art sections as needed.

Own `cindercoil` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=cindercoil` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Defining interactions and spectacle

- **An erupting route:** clearly signalled lava surges temporarily cover parts of the deck, making you choose between a tight protected line and a faster exposed line.

- **Volcanic launch:** a broken spiral ramp sends you across an active vent; timing the approach between eruptions determines how cleanly you cross.

- **Caldera rupture:** A caldera wall ruptures, sending thick lava cascades into the basin beneath you, with cooling crust breaking into rafts.

Keep descending bowls, braking shelves and the rising corkscrew. Spread surge choices across the bowl/curtain reaches, integrate the broken-ramp vent launch into the coil sequence with an explicit landing, and reveal the caldera rupture from several districts. Do not confine all new action to one short segment.

## World and driving direction

A vast natural caldera surrounds heavy ivory, charcoal and oxidized-red ceramic infrastructure. Slow molten curtains provide scale and warmth; cold ash layers and readable shadow faces prevent the world from becoming an orange bloom wall. The tabled industrial energy-complex concept stays tabled.

Start near 4.5 km with a constant 30 m usable width and about 260 m of vertical range. Alternate 300–550 m loaded descending arcs with obvious 100–200 m braking shelves; vary the exit directions instead of repeating one bowl. Give the rising 360° corkscrew a long, smooth transport frame and clear entry/exit. Grounded sections remain magnetic; explicitly authored vent jumps and telegraphed lava-contact hazards belong to this level’s runtime.

| District idea        | Route and composition starting point                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ashgate Shelf**    | A short rising approach reveals the caldera rim and enters an early bending descent. Angular ceramic buttresses and a split basalt arch establish heavy construction.                                                              |
| **Ember Bowl**       | A broad descending bank turns around a molten lake, introducing a warned surge with protected and exposed lines. Successive terrace edges establish speed and depth while the outside wall stays low enough to read the next exit. |
| **Basalt Teeth**     | Two offset braking shelves cross black columnar formations. The first tight exit points toward a distinctive breached rock tooth so players can learn the sequence.                                                                |
| **Curtain Reach**    | A long lateral view passes multiple slow lava curtains at different depths. A smooth S and short acceleration stretch keep the road active while giving the spectacle space.                                                       |
| **Furnace Coil**     | A rising corkscrew winds around a hollow cooled lava tower and feeds a broken-ramp vent launch with a readable receiving shelf. Open cantilever supports remain outside the racing and camera envelopes throughout the roll.       |
| **Blackglass Crown** | A high banked shelf crosses obsidian terraces under dark drifting ash. Cooler polished inserts and distant warm lake reflections create tonal relief after the coil.                                                               |
| **Cinder Return**    | A measured descent with one braking turn returns to Ashgate. The original arch and tiered support foundations become familiar markers, with a brief stable run to the line.                                                        |

## Raceway construction and whole-world finish

- Running surface: broad interlocking white and charcoal heat-shield plates with restrained expansion joints, thick beveled edges and selected oxide-red replacement cassettes. Show ceramic roughness and construction; avoid asphalt and rows of tiny glowing rectangles.
- Boundaries: heavy cantilever edge walls rise from offset external supports, with a low continuous inner curb and slotted upper masses. Shape their outer silhouette like kiln shelves, keeping corners readable through deliberate openings.
- Underside/supports: deep ceramic box keels, cooling slots, basalt-founded piers and wide bracket arms. Foundations meet stable rock terraces; the coil is visibly suspended from its central tower without braces crossing the path.
- District variation: pale heat plates above lava, darker glazed panels at Blackglass Crown and red inset reinforcement through the coil. The full road assembly responds to warm reflected light without saturating to featureless red.

- Hero landmarks: the caldera lake, layered lava curtains and hollow coil tower. Curtains originate at believable channels and terminate in pools; no floating flat orange sheets.
- Ordinary stretches: broken lava tubes, cooled ropy flows, basalt columns of varied cluster shapes, ash drifts and terrain terraces. Give shadowed near rocks edge definition and multiple middle-distance silhouettes so the world stays rich away from lava.
- Lighting: Use lava as a motivated warm light source against cool ash sky and darker basalt shelters. Surges and rupture should visibly affect nearby surfaces without blowing out ceramic plates or hiding the safe line. Give shaded shelves readable rock depth and cooling relief; transitions into exposed bowls must retain the ship and braking markers.

**Reject these shortcuts:** Reject orange fog that erases the route, generic factory scenery, unsupported bridge masses, repeated identical bowls, corkscrew camera intersections, or heat/smoke that secretly changes handling. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add slow lava-surface detail, sparse ember particles and limited localized heat distortion. Low retains the large lava silhouettes, terrain layers, ceramic material blocks and lighting contrast while reducing particles and secondary molten detail. Reduced motion disables distortion and swirling ember fields; decorative lava flow can become a static illuminated surface while active surges retain accurate boundary cues.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The rupturing caldera wall, volumetric lava channels/cascades and crust rafts, and broken vent-launch structure are major scene-to-Blender subjects. Use reusable rock/ceramic families for ordinary stretches; avoid flat orange sheets and visibly crude hero silhouettes.

Use the [shared production/critic loop](../README.md#production-and-critique-loop) and [common verification/completion rules](../README.md#verification-and-resource-discipline). The checks below add this level’s specific interactions and lighting. Iterate on desktop first; perform the mobile pass once desktop art and critique are settled. Merge and verify the completed level yourself, including affected existing circuits after shared changes.

## Acceptance on the actual production build

1. Drive both protected and exposed surge lines with real input; verify warning, timing, declared contact consequence and clear safe boundaries.
2. Traverse the corkscrew and volcanic launch, including imperfect eruption timing; check grounded frames, actual flight/landing and recovery/checkpoint order.
3. Inspect the caldera rupture, thick cascades and crust rafts from near/middle/far views; verify reset/pause/replay of hazard and spectacle state.
4. Check warm bowls/cool shelves in high/low/reduced motion and document hazard/landing cues plus any difficult unsupported section.
