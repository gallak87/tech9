# VECTOR//NOVA roadmap

Reviewed against `main` and the current source on **2026-10-11**. Implemented means the feature is in the game; it does not imply a new visual review or physical-device test. Open items are a backlog for future assignment, not instructions to restart completed art or critic campaigns.

## Implemented

- [x] Eleven worlds: Halcyon Speedway, Asterion Orbital, Nacre Tempest, Vesper Canopy, Glasswake Comet, Cindercoil, Saffron Leviathan, Umbra Fold, Helion Flare, Zephyr Basilica and Shatterline, with their course-owned scenery, surfaces, hazards and events.
- [x] Shared racing: the player plus nine distinct rival chassis, physical rival motion, Vector boost strips, Aegis shields, countdown, two-lap races or solo practice, relative gaps, finish beat/results, retry and continued driving. Easy/Medium/Hard have been made faster; all difficulties receive the full strip boost. Difficulty can be changed from pause for the next restart.
- [x] Shatterline: a 21.1 km point-to-point sprint with twelve jumps, three approximately five-second flights, a double Service Corkscrew, Avalanche Sweep and Scissor Dive. Overturn Weave includes two freely drivable 360° tubes with real surface handling, collision, camera support and forgiving exits. The old level/tunnel construction tasks are complete.
- [x] Canonical Saffron Leviathan uses the 40 m roadway; Umbra Fold uses the 35 m roadway.
- [x] Fleet: Kestrel, Shrike, Bastion and Needle, distinct handling, selection/stats, real-model preview and inspection. Fitted construction, clean ceramic/composite/metal finishes, studio lighting and managed KTX2 textures are implemented; further photorealism is a separate deferred pass.
- [x] Shared flight/contact: real airborne motion, swept hull contacts, bounded recovery and detached crash camera. All production races share a game-owned movement controller using Rapier collision queries, with magnetic support and physical racer shoves/yaw. Landing transitions now carry speed without the old settling slowdown; manual boost also works in flight and consumes reserve.
- [x] Front end: desktop race setup and narrow-screen accordions, cached circuit stills, fleet preloading, deferred world loading, progress UI, live results and retained Circuits → Resume sessions. Start stays beside Resume above narrow-screen accordions.
- [x] HUD/input polish: remove mid-screen gameplay callouts across all circuits; keep art controls in Dev tools; lead the desktop legend with Shift Boost. Mobile Tunes collapses to a logo-aligned button. Two-thumb touch controls combine steering/airbrake on the left and Boost + Go/Go/Neutral/Brake on the right, with release/pause/focus cleanup.
- [x] Music and publishing: local generation/audition workflow, eight playable songs, 192 kbps MP3 delivery and GitHub Actions/Pages deployment. Start race/practice starts music unless manually paused; ordinary menu clicks do not. Initial-arrival/first-click autoplay is no longer planned.
- [x] Surface passes: Halcyon asphalt, Asterion alloy, Nacre ceramic, Glasswake crystal relief, Cindercoil fired ceramic, Helion tiles, Saffron Leviathan fused glass/sand, Zephyr weave refinements and Shatterline asphalt decks. See the [road finish index](docs/expansion/roads/README.md) before reusing an older brief.
- [x] Targeted performance/render fixes: Vesper/Glasswake physical-transmission removal, fleet texture compression, live Dev tools metrics/material switches, and Halcyon's ground-underlay depth fix. These do not close the broader M1 profiling task.
- [x] Level/tooling foundation: lazy discovery, owned world/resource lifecycle, shared geometry helpers, normalized asset folders/provenance, reproducible menu captures and maintained frontend/level checks. Developer replay/scenario tooling remains; the separate AI `racersVersion` stamp was removed.

## Performance and device validation

- [ ] Finish hands-on phone/tablet and physical-gamepad driving checks, including long flights, two-thumb ergonomics and responsive HUD/camera behavior across circuits. Shared touch behavior has browser-emulation coverage; that is not a full device or per-level driving pass. The user's separate mobile review of the widening campaign remains outstanding.

## Level work

- [ ] Investigate the extra turn-assistance feel reported in Zephyr on 2026-10-17: the early right bend beneath the stone cross-span, approaching the boost strip before the first waterfall jump (reference HUD: lap 1, 00:07.300, 396 km/h). The shared 0.3 curvature assistance is present; additional bend-specific behavior is unconfirmed. Compare neutral-input yaw, road banking/support transport and camera motion before proposing a handling change. Deferred from the query-controller/FPS pass; preserve the approved assistance until reviewed with the user.

- [ ] Human driving review of [Worldspire](docs/levels/worldspire.md) and [Nightweir](docs/levels/nightweir.md): compact 13.1 km and 12.4 km races, nine/eight jumps, three corkscrews each, distinct textured edges and distance-linked Awakening/Floodgates events. Both include a 650 m braking runout and are authorized for production completion.

- [ ] Review [Saffron surroundings](docs/expansion/saffron.md) against the canonical 40 m roadway and address confirmed clearance issues.
- [ ] Scope Umbra Fold’s adjacent scenery/support/observatory refit against the canonical 35 m roadway.
- [ ] Cindercoil: add player-facing lava-contact flames and lingering ship/HUD smoke or heat feedback. The existing crater-spill glow and road-contact smoke are already implemented; reuse Helion's effects where appropriate.
- [ ] Reproduce any remaining Halcyon white-ground/lane-marking flicker and Asterion road flicker on the current build before changing them. Halcyon's underlay depth fix and both circuits' subsequent road finishes have shipped; the older reports are not confirmed current defects.
- [ ] Broaden static collision coverage where driving exposes missing contacts, especially scenery outside the existing deck/jump corridors. Many circuits already have collision worlds; this is not a from-scratch all-level rollout. Add contact sparks with actual contacts and consider bounded scrape marks. Racer body contact is separate below.

## Further art passes

- [ ] Halcyon: explore closer buildings, street-canyon scale and grounded city infrastructure using the [saved circuit concept](docs/levels/art-revamp-reference/circuit-wall-v1.png). The asphalt pass is complete; a world/route change needs its own scope.
- [ ] Nacre: improve storm-ocean wave scale, layered crests, foam and water lighting using the [saved concept](docs/levels/art-revamp-reference/circuit-wall-v1.png). Preserve road/jump readability, underwater racing and approved flight behavior; the ceramic road finish is already implemented.
- [ ] Vesper: the broader [HD environment proof](docs/hd/vesper.md) remains unimplemented. Start with one representative hollow/connector and measured runtime cost. Preserve opaque resin; the earlier transmission removal and Dev tools work are complete.
- [ ] Umbra Fold: the dedicated [road finish brief](docs/expansion/roads/umbra.md) remains available for assignment. Reassess older requests for graphite/metal separation, masonry repairs, recessed lighting, closer jump/arrival framing and the Fold's start-grid reference against the current source before defining another pass; previous Umbra construction/material/lighting passes already exist.
- [ ] Reassess older optional polish notes against current visuals: Zephyr's aerated waterfalls, varied island shelves/openings and close masonry; Saffron Leviathan's bone erosion, creature armor, sandfall volume and ordinary scenery. These are retained art directions, not freshly verified defects or permission to resume completed critique loops.
- [ ] Author landmark-focused circuit menu stills: Nacre's leviathan, Cindercoil's lava and equivalent signature vistas. Save camera poses and event timing for the existing [capture workflow](ARCHITECTURE.md#circuit-preview-refresh); ordinary ship-free previews already exist.

## Music

- [ ] Continue from the existing eight-song pool if more variety is wanted; the earlier target was roughly 16. Choose/finalize circuit assignments, race mix and audible loop transitions with the user. Blue Hour is tagged for Halcyon; the other seven tracks remain general `mix` auditions. Playback, encoding and deployment already work. See the [audio guide](docs/audio/README.md).
- [ ] Optionally package the proven prompt → sequential render → Tunes audition → human-feedback process as an audio-generation Skill. Reuse the guide/scripts, provenance and one-current-take rules; do not create a second workflow or evidence archive.

## Future race modes and systems

- [ ] Scope briefings, sector splits and persistent personal records separately from the completed race/results flow. A podium presentation is optional follow-up.
- [ ] Consider expansion beyond the delivered ten-racer field only after measuring performance and independent finishes.
- [x] Add shared physical ship contact, strong magnetic attachment, yaw response and contact feedback cooldowns.
- [ ] Prototype two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Put recharge on slower/wider lines, retain passive regeneration while tuning, and reset eligibility per racer/lap with forward-crossing anti-farming rules. Expand only after review.
- [ ] Add a deterministic three-lap solo Time Trial: local non-colliding ghost, sector deltas and instant retry; fixed initial state, manual boost/regeneration and disabled road devices. Separate records by circuit/ship/rules. Automatic failed-jump recovery remains valid with elapsed-time loss. Existing developer input logs are not a player-facing ghost mode.
- [ ] Add a Founders Cup over Halcyon/Asterion/Nacre, carrying ship selection between races and saving progress with restart/abandon controls. The earlier 12-racer proposal uses points 25/20/16/13/11/9/7/5/4/3/2/1, with ties broken by wins then total time; revisit that scoring for the current ten-racer field.
- [ ] Connect Cup/Time Trial to the frontend when implemented. Rewards would unlock cosmetics rather than stronger stats; retain current content in Practice/Quick Race.

## Tooling follow-up

- [ ] Consolidate the compatibility developer launcher into dedicated tool views after migrating its consumers. Preserve jump-test cases/reset/step/launch, shape review and ship/rival inspection. Direct art-pass/inspection links and maintained frontend/level checks already exist.
- [ ] Migrate or retire historical browser harnesses against the current shell/session lifecycle, including old mobile scripts that still target the removed driving-button row. Preserve useful physics/scenario assertions; use the supported commands in [tools/README.md](tools/README.md). Temporary scratch cleanup is routine ownership work under AGENTS.md, not a new product milestone.

## Deferred

- [ ] Kestrel photorealism comparison and further authoring: paused while publishing/gameplay took priority. Start with matched Blender/Three.js baselines, then prove a visible improvement on one assembly before full baking or fleet rollout. Follow the [ship visual improvement workflow](assets/ships/README.md#visual-improvement-workflow); the shipped fleet finish is not evidence of photorealism or browser export degradation.
- [ ] Umbra gravity-lens cue: revisit the arrow that can imply steering toward the pull even though the player must counter-steer.

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require separate scope. Quality and a complete racing loop take priority over map count.
