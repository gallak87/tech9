# Sound effects

Open the game with `?dev=1` to show **Sounds** beside Tunes. Pick a sound and press **Play**; picking another stops the current preview. Use **M** to pause Tunes while listening. Effects volume comes from Settings. Each preview stops automatically; engine and sustained effects play for three seconds.

These 31 choices cover the current gameplay sound effects and their distinct audible variants. The Sounds panel uses procedural Web Audio, with the same synthesis and effects volume as gameplay. The preview owns separate audio resources and does not activate pickups or alter the race. Audition from a menu or pause screen to hear the selected effect in isolation: racing audio and Tunes otherwise continue, and the isolated cue does not reproduce competition between voices in the full racing mix.

For pickup sound and VFX together, open **Ship inspector → Powerups** with `dev=1`, or go directly to `?inspect=1&dev=1&ship=kestrel`. Choose a device and press **Trigger**. Arc activation uses the current generated candidate in this studio; the following shots and all other cues remain procedural. This audition does not replace the gameplay sounds listed below.

| Picker entry                   | When heard in game                         | Current character                                       |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| Vector · activate              | Vector road device activates               | Rising rush with low engine body                        |
| Aegis · activate               | Shield activates                           | Soft low swell and ringing shell                        |
| Repulsor · charge              | Repulsor is acquired and charges           | Rising noise and pitched charge                         |
| Arc · activate                 | Arc emitter activates                      | Short electrical rise                                   |
| Ion · activate                 | Ion wake emitter activates                 | Falling rush and low body                               |
| Repulsor · fire                | Repulsor discharges                        | Low thump, noise burst and air tail                     |
| Arc · fire                     | Each Arc shot fires                        | Electrical snap with a deep descending body             |
| Aegis · absorb hit             | Shield absorbs contact or weapon hit       | Noisy impact and shield ring                            |
| Combat · unshielded hit        | Weapon hits unshielded player              | Noise crack and low impact                              |
| Combat · hit confirmed         | Player hits an unshielded opponent         | Short rising confirmation                               |
| Combat · shield hit confirmed  | Player hits a shielded opponent            | Short falling confirmation                              |
| Device · expire                | Aegis, Repulsor or Arc ends                | Shared falling noise and tone                           |
| Ion · expire                   | Ion emitter ends                           | Lower noise variant of expiry                           |
| Device · unavailable           | Road device cannot activate                | Quiet noise tick                                        |
| Device · cancelled             | Vector/Aegis is cancelled                  | Short falling noise                                     |
| Vector · sustained rush        | Vector boost remains active                | Continuous bright filtered noise                        |
| Ion · sustained wake           | Ion emitter remains active                 | Continuous lower filtered noise                         |
| Countdown · 3 / 2 / 1          | Each red start light                       | Same short 480 Hz tone                                  |
| Countdown · go                 | Green start light                          | Longer 960 Hz tone                                      |
| Lap complete                   | Ordinary lap crossing                      | Rising two-pitch cue                                    |
| Final lap                      | Final lap begins                           | Two-note announcement                                   |
| Race complete · winner         | Valid first-place finish                   | Four rising notes                                       |
| Race complete · finisher       | Other valid finish                         | Two rising notes                                        |
| Race complete · invalid run    | Invalid finish                             | Two falling notes                                       |
| Ship · impact                  | Road/wall collision                        | Short descending low thump                              |
| Ship · hover / idle            | Stationary running ship                    | Hover fundamental and paired engine harmonics           |
| Ship · cruise                  | Ship travelling at speed                   | Engine harmonics plus airflow; preview at 112 m/s       |
| Ship · manual boost            | Manual boost held at speed                 | Brighter engine and additional rush; preview at 157 m/s |
| Nacre · thunder                | Nacre lightning event                      | Crack with low rolling tail                             |
| Nacre · submerged thunder      | Same event with submerged listener         | Thunder through the shared underwater filter            |
| Glasswake · ice shelf collapse | Opening sheet and later calving shelf fall | Shared ice cracks, low body and falling powder          |

The propulsion bed continuously responds to acceleration, braking, steering and speed; its three presets are representative states, not separate recordings. Underwater filtering also affects other Nacre sounds. A shielded `combat-hit` is silent because `shield-hit` supplies the audible cue.

The picker catalog is [sounds.js](../../src/audio/sounds.js). Current synthesis lives in [pickup sound design](../../src/pickups/sound-design.js), [pickup audio](../../src/pickups/audio.js), [race cues](../../src/audio/index.js), [propulsion](../../src/audio/propulsion.js), [Nacre thunder](../../src/audio/nacre-thunder.js) and [Glasswake shelf audio](../../src/levels/glasswake/audio.js). Keep the catalog and this table aligned when a sound changes.
