# Original coastal audio

`generate_coast.py` synthesizes the stereo shoreline bed and eight mono boot-on-stone/timber footfalls under `game/audio/coast/`. It uses seeded noise, filters, amplitude envelopes and simple oscillators at 48 kHz, 16-bit PCM. There are no sampled recordings, external licenses, hosted credits or downloads. The shoreline uses a one-second overlap at the loop boundary. Regenerate with `python3 _prep/audio/generate_coast.py` from Dusk.

`DuskCoastAudio` loops the bed, chooses stone/timber by the actual bridge location and emits footsteps from measured grounded displacement. Stationary, blocked, reset and paused movement produces no new steps. This is a restrained procedural ambience pass; the owner's subjective audio mix review remains separate.
