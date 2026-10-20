# Circuit music directions

These are provisional seeds derived from the current level metadata and [art direction](../ART_BIBLE.md). Use [Blue Hour](halcyon.md) as the accepted starting point; create a short current brief when a circuit enters production. Circuit numbers follow the actual picker order; `orbital` is Asterion's implementation slug.

Shared family: forward motion, deliberate electronic sound design, a distinct short motif for each world and room for gameplay feedback. Differentiate tracks through rhythm, harmony and arrangement as well as instrument color. Difficulty does not require monotonically increasing BPM.

| Circuit / slug                   | World and player feeling                                                          | Musical seed                                                                                     | Gameplay audition priority                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 01 Halcyon Speedway / `halcyon`  | Blue-hour city; fluid focus                                                       | Deep trance, slow minor harmony, lower filtered synth phrases and rounded offbeat bass           | First acceleration, Vector/Aegis, repeated laps                                                      |
| 02 Asterion Orbital / `orbital`  | Sunlit shipyard above a living planet; precision and scale                        | Interlocking sequenced pulses, metallic plucks, spacious harmonic changes                        | Keep docking-turn and propulsion feedback clear beneath bright transients                            |
| 03 Nacre Tempest / `nacre`       | Storm causeways and luminous submerged trenches; turbulence and discovery         | Rolling broken beat, fluid arpeggios, deeper harmonic color with a buoyant upper motif           | Storm/thunder and entry/exit through the existing underwater mix; verify the tune survives filtering |
| 04 Vesper Canopy / `vesper`      | Moonlit giant trees and amber resin; agile, living motion                         | Syncopated woody percussion, soft mallet-like synths, branching call-and-response phrases        | Crown flights and sap/resin transitions; avoid clutter from many short notes                         |
| 05 Glasswake Comet / `glasswake` | Transparent crystal, frost and cobalt chasms; poised tension                      | Crisp restrained breaks, glassy strikes, open intervals and deliberate gaps                      | Shelf fracture sounds and frost-to-grip changes; avoid continuous brittle highs                      |
| 06 Cindercoil / `cindercoil`     | Ceramic/basalt caldera, furnace roll and vent flight; force and release           | Heavy syncopated percussion, rough-edged bass, short repeating figures with controlled intensity | Lava contact and boost feedback; preserve low-end clarity under the engine                           |
| 07 Saffron Leviathan / `saffron` | Fossil anatomy, migrating dunes and smoked-gold glass; ancient scale and momentum | Dry resonant percussion, long modal phrases, warm granular textures over an active bass pulse    | Sand drag, vertebral flights and impacts; retain motion without constant musical climaxes            |
| 08 Zephyr Basilica / `zephyr`    | Floating cathedrals and waterfall transfers; soaring breadth                      | Bell-like tones, airy harmonic layers and a buoyant broken beat                                  | Waterfall passages and nave turns; keep long tails from blurring rhythmic detail                     |
| 09 Helion Flare / `helion`       | Solar observatory, white heat and shelter; exposure and relief                    | Tight driving pulse, bright harmonic tension and alternating dense/open phrases                  | Heat/cooling feedback and flare evasion; avoid making every phrase an alarm                          |
| 10 Umbra Fold / `umbra`          | Ruined observatory and tidal gravity; controlled unease                           | Displaced accents over a dependable pulse, descending bass shapes and slow harmonic drift        | Gravity guidance and curved flights; disorientation belongs in color, not loss of rhythmic footing   |
| 11 Shatterline / `shatterline`   | Ruined mountain mass driver; accelerating descent                                 | Industrial syncopation, rounded bass, rising harmonic pressure                                   | Long flights and landing cues; clear changes without brittle highs                                   |
| 12 Worldspire / `worldspire`     | Mineral megastructure and cloud seas; scale and discovery                         | Wide sustained chords, weighty broken beats, contrasting open passages                           | Keep propulsion and long-flight cues readable                                                        |
| 13 Nightweir / `nightweir`       | Flooded midnight city; momentum and tension                                       | Deep rolling bass, restrained metallic rhythm, submerged textures                                | Establish the groove immediately; leave room for water and contact sounds                            |

Instrument words describe design ideas; they do not imply a sample library or generated asset has been selected. Listen to the whole set at comparable loudness before fixing final delivery levels. Revisit Nacre's treatment explicitly: its current full-mix underwater behavior is an established feature, and any different policy for music needs a deliberate decision.

## Brief template

Create `docs/audio/<slug>.md` when a circuit enters production. Carry forward the pilot's authoring process, changing what this world needs. Keep the brief current in place.

- **Identity:** circuit, slug, working title, source references and one sentence describing the player's intended feeling.
- **Composition:** tempo/meter hypothesis, harmonic language, motif, groove, instrument roles, arrangement map and contrast with the nearest existing soundtrack.
- **Game context:** race/loop requirements, important competing effects, environment processing, playback transitions and any proposed departures from Halcyon's accepted behavior.
- **First render:** a short passage that proves this track's particular idea, with one listening decision.
- **Delivery:** editable source, reproducible renderer/project, current mix, exact loop points, format and provenance. Add stems when needed for mixing. Runtime paths follow the [shared plan](README.md#authoring-approach).
- **Acceptance:** world fit, motif/variation, repeated listening, effects audibility, clean delivered loop and lifecycle checks; distinguish measured results from listening feedback.

## Production gauntlet

Use the [pilot process](README.md#process) for one complete track at a time: brief → sketch → full arrangement → production → game mix → user acceptance.

The user hears the current preview, then Codex updates the source, brief and preview in place. Finish with both a music-only repeat and an actual gameplay audition. Technical checks cannot substitute for hearing the result.
