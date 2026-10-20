# Sound effects

Give pickups and ship feedback more weight, a recognizable identity and a clear attack without covering the music or other race cues. Work on a complete device sound set using the [expansion brief](../sounds/expansion.md), with individual cues from the [sound inventory](sounds.md). Codex handles prompting and generation; the user judges whether it sounds good. Keep one current prompt/settings file and WAV per effect, replacing revisions in place.

## Local setup

The [official Stable Audio 3 MLX runtime](https://github.com/Stability-AI/stable-audio-3/tree/main/optimized/mlx) supports Apple Silicon. We use **Small-SFX**, its sound-effects model, with FP16 generation and the FP32 SAME-S decoder. It releases each model stage before loading the next. No PyTorch, CUDA, server or hosted account is needed.

From `games/vector-nova`, install Python 3, Git, curl and [uv](https://docs.astral.sh/uv/getting-started/installation/) (`brew install uv` if using Homebrew), then:

```sh
npm run sfx:setup
npm run sfx:generate -- --check
```

Setup installs its own Python environment and about **1.59 GiB of weights**, all inside the existing gitignored `.audio-model/`:

- `stable-audio-3/`: pinned upstream source, `optimized/mlx/.venv/`, model weights under `optimized/mlx/models/mlx/`, and model licences.
- `sfx-python/`: managed Python; `sfx-cache/`: dependency/download caches.

[sfx-models.json](../../tools/sfx-models.json) pins source/Python/model revisions and SHA-256 checksums; [sfx-requirements.txt](../../tools/sfx-requirements.txt) locks the four runtime packages with hashes. Setup reuses verified downloads, resumes partial ones and preserves a different existing runtime instead of resetting it. Generation uses local files only. Run one model job at a time; the wrapper rejects overlapping SFX jobs.

## Generate one effect

After choosing a cue, create its current config, for example `assets/audio/sfx/vector-pickup.json`:

```json
{
  "prompt": "A single powerful futuristic energy pickup. Immediate deep electromagnetic punch, a bright rising energy surge, and a short clean shimmering tail. Isolated dry game sound effect, no music, no voices, no background ambience.",
  "seconds": 2,
  "seed": 70931,
  "steps": 8,
  "cfg": 1
}
```

```sh
npm run sfx:generate -- --config assets/audio/sfx/vector-pickup.json
afplay assets/audio/sfx/vector-pickup.wav
```

The example config is a starting recipe, not an installed or approved replacement. The default WAV destination is beside the config; `--output /path/to/sound.wav` overrides it. Keep masters outside `public/` until the sound is accepted and integrated.

Defaults are 2 seconds, seed 70931, 8 steps and guidance (`cfg`) 1. The wrapper supports 0.5–30 seconds for short effects; stay around 1–3 seconds for pickups. Optional `negative_prompt` requires `cfg` greater than 1. Keep descriptions short and concrete: source, attack, body, tail and recording character. A request for a seamless loop or exact event timing is not a guarantee.

Output is stereo 44.1 kHz / 16-bit PCM. The upstream writer rejects non-finite audio; our wrapper checks format, duration, near-silence and excessive clipping before atomically replacing the destination. A failed render leaves the existing WAV intact. No automatic playback, game modification, numbered takes or retained render logs.

## Audition and integration

Open the game with `?dev=1` to compare the existing cues using its dropdown and Play button beside Tunes. For sound and visuals together, open **Ship inspector → Powerups**, choose a device and press **Trigger**. The direct studio URL is `?inspect=1&dev=1&ship=kestrel`. **Stop** clears the audition; triggering again starts it afresh.

Check **Engine sound** to hear propulsion while the existing **Driving** and **Boost** buttons are pressed. It starts unchecked, follows effects volume/mute and goes silent when the window loses focus or the inspector closes. Powerup auditions can play over it.

A Rook target sits ahead in the dev studio. Arc pellets stop at its hull and each contact pulses the same blue outline/glow used in gameplay; Repulsor lights the struck hull rose. Check **Shield target** to audition the first hit against Aegis, with its mint block effect and shared block sound. Damage grace still limits hit confirmations. The view starts from behind at a three-quarter angle, with auto-rotate off; drag to turn it. Without `dev=1`, the inspector has only its normal controls and no target or audition audio.

Aegis offers **shield** for the full duration and **absorb + break** for a hit after 1.5 seconds. It plays a warp start and collapse, with no sustained hum. Driving reveals a dim mint trail; impact fractures the glowing field.

Gameplay, Sounds and the inspector share generated Aegis activation/collapse, Arc activation/impact and Repulsor charge/discharge/impact samples from `assets/audio/sfx/`. Arc keeps its tuned synthesized shots. Attacker contacts are quieter than incoming hits; later Arc contacts during damage grace remain audible without extra damage. Arc/Repulsor end with their existing tails, with no extra expiry chime. Listen to complete sequences with propulsion and Tunes before considering a device finished. For engine layers, audition sustained texture separately from ignition and release; for pickups, judge the first instant, body and tail independently.

Trim and balance each candidate against gameplay, decide stereo/mono and delivery format, and register its config/master/export and generation provenance in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json). Loops need an audible seam check. The shared device bus decodes samples on unlock, caches them for its lifetime and sends them through the same voice budget, compressor, effects volume and underwater mix as synthesis. Failed loads retain procedural cues. Stop, pause, mute and disposal stop all owned voices. Loudness and spatialization still need listening; louder generation alone does not establish a better pickup.

## Source and licences

Runtime code is MIT. The model weights use the [Stability AI Community License](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE.md); the bundled Google T5Gemma text encoder also carries [Gemma terms](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE_GEMMA.md). Setup preserves both texts in `model-licenses/`. Downloads remain local; the game does not ship the runtime or weights. Record the pinned toolchain, config and any supplied reference audio when registering an accepted effect.
