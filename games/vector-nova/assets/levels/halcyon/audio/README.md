# Current audio sources

Blue Hour is the Halcyon direction; the other songs are tagged `mix`. These are roughly two-minute instrumental auditions, with gameplay balance and loop transitions still subject to listening feedback.

| Song          | Tempo / key        | Current prompt                         | Playable WAV            |
| ------------- | ------------------ | -------------------------------------- | ----------------------- |
| Blue Hour     | 128 BPM / F♯ minor | [prompt.txt](prompt.txt)               | `blue-hour-preview.wav` |
| Phase Shift   | 132 BPM / E minor  | [phase-shift.txt](phase-shift.txt)     | `phase-shift.wav`       |
| Nightshift    | 122 BPM / F♯ minor | [nightshift.txt](nightshift.txt)       | `nightshift.wav`        |
| Undertow      | 128 BPM / F♯ minor | [undertow.txt](undertow.txt)           | `undertow.wav`          |
| Ionwake       | 134 BPM / D minor  | [ionwake.txt](ionwake.txt)             | `ionwake.wav`           |
| Event Horizon | 138 BPM / G minor  | [event-horizon.txt](event-horizon.txt) | `event-horizon.wav`     |
| Slipstream    | 128 BPM / D minor  | [slipstream.txt](slipstream.txt)       | `slipstream.wav`        |
| Mirage        | 124 BPM / B minor  | [mirage.txt](mirage.txt)               | `mirage.wav`            |

Current prompts are linked above; WAVs are in `public/assets/levels/halcyon/audio/`. [tracks.js](../../../../src/audio/tracks.js) owns title, BPM, tags and the fixed picker order, with Blue Hour first. See the [audio guide](../../../../docs/audio/README.md) for setup, generation commands, settings and iteration rules, and the [Halcyon brief](../../../../docs/audio/halcyon.md) for its world direction.

## Source and licence

Generated locally from project-authored prompts without reference audio using [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5), [acestep.cpp](https://github.com/ServeurpersoCom/acestep.cpp) and the [published GGUF weights](https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF). Their MIT licence files remain with the installed source/models. [Pinned revisions and model checksums](../../../../tools/audio-models.json) define the local setup. The game ships generated WAVs only.
