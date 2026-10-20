# Sound effects

Open the game with `?dev=1` to show **Sounds** beside Tunes. Pick a sound and press **Play**; picking another stops the current preview. Use **M** to pause Tunes while listening. Effects volume comes from Settings. Each preview stops automatically; engine and sustained effects play for three seconds.

These 38 choices cover the current gameplay sound effects and their distinct audible variants. The Sounds panel uses the same generated samples, synthesis and effects volume as gameplay. The preview owns separate audio resources and does not activate pickups or alter the race. Audition from a menu or pause screen to hear the selected effect in isolation: racing audio and Tunes otherwise continue, and the isolated cue does not reproduce competition between voices in the full racing mix.

For pickup sound and VFX together, open **Ship inspector → Powerups** with `dev=1`, or go directly to `?inspect=1&dev=1&ship=kestrel`. Choose a device and press **Trigger**. The Arc, Repulsor and Aegis sound sets match gameplay. Aegis has separate full-duration and absorb/break sequences. Check **Shield target** to preview a blocked first hit, and **Engine sound** to hear Driving/Boost alongside the device.

| Picker entry                   | When heard in game                         | Current character                                        |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| Vector · activate              | Vector road device activates               | Rising rush with low engine body                         |
| Aegis · activate               | Shield activates                           | Generated broad warp-start surge                         |
| Repulsor · charge              | Repulsor is acquired and charges           | Generated compressed magnetic rise                       |
| Arc · activate                 | Arc emitter activates                      | Generated controlled electrical whip                     |
| Ion · activate                 | Ion wake emitter activates                 | Falling rush and low body                                |
| Repulsor · fire                | Repulsor discharges                        | Generated rounded pressure punch and air tail            |
| Arc · fire                     | Each Arc shot fires                        | Electrical snap with a deep descending body              |
| Arc · hull impact              | Arc hits the unshielded player             | Generated electrical armor crack and low thud            |
| Repulsor · hull impact         | Repulsor hits the unshielded player        | Generated cushioned pressure hit                         |
| Arc · target contact           | Player's pellet strikes a rival            | Arc impact at reduced gain; grace contacts quieter still |
| Repulsor · target contact      | Player's pulse strikes a rival             | Repulsor impact at reduced gain                          |
| Arc · shield blocked           | Rival shield blocks an Arc hit             | Shared generated field block at reduced gain             |
| Repulsor · shield blocked      | Rival shield blocks the pulse              | Same shared block                                        |
| Aegis · absorb hit             | Shield absorbs contact or weapon hit       | Generated rounded warp collapse; softened upper edge     |
| Combat · unshielded hit        | Other weapon hits unshielded player        | Noise crack and low impact                               |
| Combat · hit confirmed         | Other weapon hits an unshielded rival      | Short rising confirmation                                |
| Combat · shield hit confirmed  | Other weapon hits a shielded rival         | Short falling confirmation                               |
| Aegis · expire                 | Shield times out                           | Same warp collapse at softer gain                        |
| Ion · expire                   | Ion emitter ends                           | Lower noise variant of expiry                            |
| Device · unavailable           | Road device cannot activate                | Quiet noise tick                                         |
| Device · cancelled             | Vector is cancelled                        | Short falling noise                                      |
| Aegis · cancelled              | Shield is cancelled                        | Same warp collapse at lower gain                         |
| Vector · sustained rush        | Vector boost remains active                | Continuous bright filtered noise                         |
| Ion · sustained wake           | Ion emitter remains active                 | Continuous lower filtered noise                          |
| Countdown · 3 / 2 / 1          | Each red start light                       | Same short 480 Hz tone                                   |
| Countdown · go                 | Green start light                          | Longer 960 Hz tone                                       |
| Lap complete                   | Ordinary lap crossing                      | Rising two-pitch cue                                     |
| Final lap                      | Final lap begins                           | Two-note announcement                                    |
| Race complete · winner         | Valid first-place finish                   | Four rising notes                                        |
| Race complete · finisher       | Other valid finish                         | Two rising notes                                         |
| Race complete · invalid run    | Invalid finish                             | Two falling notes                                        |
| Ship · impact                  | Road/wall collision                        | Short descending low thump                               |
| Ship · hover / idle            | Stationary running ship                    | Hover fundamental and paired engine harmonics            |
| Ship · cruise                  | Ship travelling at speed                   | Engine harmonics plus airflow; preview at 112 m/s        |
| Ship · manual boost            | Manual boost held at speed                 | Brighter engine and additional rush; preview at 157 m/s  |
| Nacre · thunder                | Nacre lightning event                      | Crack with low rolling tail                              |
| Nacre · submerged thunder      | Same event with submerged listener         | Thunder through the shared underwater filter             |
| Glasswake · ice shelf collapse | Opening sheet and later calving shelf fall | Shared ice cracks, low body and falling powder           |

The propulsion bed continuously responds to acceleration, braking, steering and speed; its three presets are representative states, not separate recordings. Underwater filtering also affects other Nacre sounds. A shielded `combat-hit` is silent because `shield-hit` supplies the audible cue.

Arc and Repulsor finish through their existing tails, with no extra expiry cue. Aegis has no sustained audio layer; its start and collapse leave room for propulsion.

The picker catalog is [sounds.js](../../src/audio/sounds.js). Generated sample routing lives in [sample cues](../../src/pickups/sample-cues.js). Synthesis and mixing live in [pickup sound design](../../src/pickups/sound-design.js), [pickup audio](../../src/pickups/audio.js), [race cues](../../src/audio/index.js), [propulsion](../../src/audio/propulsion.js), [Nacre thunder](../../src/audio/nacre-thunder.js) and [Glasswake shelf audio](../../src/levels/glasswake/audio.js). Keep the catalog and this table aligned when a sound changes.
