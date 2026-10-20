# Sound effects

Open the game with `?dev=1` to show **Sounds** beside Tunes. Pick a sound and press **Play**; picking another stops the current preview. Use **M** to pause Tunes while listening. Effects volume comes from Settings. Each preview stops automatically; engine and sustained effects play for three seconds.

These 25 choices are sorted alphabetically by group and name. Shared recordings appear once; volume-only variants and silent events have no separate entries. The Sounds panel uses the same generated samples, synthesis and effects volume as gameplay. It sets the output level before the first transient, keeps each decoded tail intact, and reports a missing sample instead of auditioning a substitute. The preview owns separate audio resources and does not activate pickups or alter the race. Audition from a menu or pause screen to hear the selected effect in isolation: racing audio and Tunes otherwise continue, and the isolated cue does not reproduce competition between voices in the full racing mix.

For pickup sound and VFX together, open **Ship inspector → Powerups** with `dev=1`, or go directly to `?inspect=1&dev=1&ship=kestrel`. Choose a device and press **Trigger**. The Arc, Repulsor and Aegis sound sets match gameplay. Aegis has separate full-duration and absorb/break sequences. Check **Shield target** to preview a blocked first hit, and **Engine sound** to hear Driving/Boost alongside the device.

| Picker entry                | When heard in game                                                          | Current character                                       |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Aegis · activate            | Shield activates                                                            | Generated broad warp-start surge                        |
| Aegis · collapse / hit      | Shield absorbs a hit, expires or is cancelled; weapon hits a shielded rival | Shared generated rounded warp collapse                  |
| Arc · activate              | Arc emitter activates                                                       | Generated controlled electrical whip                    |
| Arc · fire                  | Each Arc shot fires                                                         | Electrical snap with a deep descending body             |
| Arc · hull impact           | Arc hits a hull; quieter for outgoing contact                               | Generated electrical armor crack and low thud           |
| Ion · activate              | Ion wake emitter activates                                                  | Falling rush and low body                               |
| Ion · hull impact           | Ion wake hits the unshielded player                                         | Original synthesized noise crack and low impact         |
| Ion · sustained wake        | Ion emitter remains active                                                  | Continuous lower filtered noise                         |
| Ion · target contact        | Player's wake hits an unshielded rival                                      | Original synthesized rising confirmation                |
| Repulsor · charge           | Repulsor is acquired and charges                                            | Generated compressed magnetic rise                      |
| Repulsor · fire             | Repulsor discharges                                                         | Generated rounded pressure punch and air tail           |
| Repulsor · hull impact      | Repulsor hits a hull; quieter for outgoing contact                          | Generated cushioned pressure hit                        |
| Vector · activate           | Vector road device activates                                                | Rising rush with low engine body                        |
| Vector · sustained rush     | Vector boost remains active                                                 | Continuous bright filtered noise                        |
| Ship · cruise               | Ship travelling at speed                                                    | Engine harmonics plus airflow; preview at 112 m/s       |
| Ship · hover / idle         | Stationary running ship                                                     | Hover fundamental and paired engine harmonics           |
| Ship · manual boost         | Manual boost held at speed                                                  | Brighter engine and additional rush; preview at 157 m/s |
| Countdown · 3 / 2 / 1       | Each red start light                                                        | Same short 480 Hz tone                                  |
| Countdown · go              | Green start light                                                           | Longer 960 Hz tone                                      |
| Final lap                   | Final lap begins                                                            | Two-note announcement                                   |
| Lap complete                | Ordinary lap crossing                                                       | Rising two-pitch cue                                    |
| Race complete · finisher    | Other valid finish                                                          | Two rising notes                                        |
| Race complete · invalid run | Invalid finish                                                              | Two falling notes                                       |
| Race complete · winner      | Valid first-place finish                                                    | Four rising notes                                       |
| Ship · impact               | Wall, rail, structure or racer collision                                    | Generated short body knock with a small scrape          |

The propulsion bed continuously responds to acceleration, braking, steering and speed; its three presets are representative states, not separate recordings. A shielded `combat-hit` is silent because `shield-hit` supplies the audible cue. Arc, Repulsor and Ion blocked-hit confirmations share the Aegis collapse recording. Expiry, cancellation and attacker confirmation use quieter gains in gameplay; the inspector auditions those event sequences.

Arc and Repulsor finish through their existing tails, with no extra expiry cue. Aegis has no sustained audio layer; its start and collapse leave room for propulsion.

All eight WAVs in `assets/audio/sfx/` are live: seven device cues and one physical ship-impact cue. Arc hull impact and target contact share `arc-hit.wav`. Aegis and Repulsor use the approved softened recordings. The race bus plays `ship-impact.wav` for unshielded collisions; a shielded collision uses the Aegis block alone.

Original synthesis remains live for Vector activation/rush, Ion activation/wake/impact/confirmation, the approved Arc shots, propulsion and race announcements. Sample-backed cues have one source only; missing files stay silent and dev previews report the error. Unavailable pickups and Vector cancellation are silent, retaining HUD feedback. Ion emission ends by fading its bed over a few hundred milliseconds; there is no separate expiry chime. Ordinary Vector exit ends its rush without a separate cue. Aegis expiry/cancellation retain their warp collapse.

Environment sound work is deferred; the circuits retain their original thunder and shelf synthesis, with no environment entries in this picker.

The picker catalog is [sounds.js](../../src/audio/sounds.js). Generated sample routing lives in [device samples](../../src/pickups/sample-cues.js) and [race samples](../../src/audio/sample-cues.js), using the shared [sample loader](../../src/audio/sample-bank.js). Synthesis and mixing live in [pickup sound design](../../src/pickups/sound-design.js), [pickup audio](../../src/pickups/audio.js), [race cues](../../src/audio/index.js), [propulsion](../../src/audio/propulsion.js), [Nacre thunder](../../src/audio/nacre-thunder.js) and [Glasswake shelf audio](../../src/levels/glasswake/audio.js). Keep the catalog and this table aligned when a sound changes.
