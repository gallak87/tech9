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

For an isolated cue, use **Sounds → Play** with `?dev=1` or `?dev=2`. For the full sound/VFX sequence, use `?dev=1` or `?dev=2` and open **Race → Ship inspector → Powerups & equipment → Trigger**, or `?inspect=1&dev=1&ship=kestrel`. Stop cancels the audition; triggering again starts fresh. Effects volume is shared with gameplay.

- **Engine sound** adds Driving/Boost while those buttons are on. It starts unchecked and silences on blur or close.
- **Shield target** adds Aegis to Rook for Arc/Repulsor/Lance. **Ion · incoming wake** instead attacks your ship and offers **Shield your ship**.
- **Aegis · shield** plays the full lifetime; **absorb + break** tests a hit after 1.5 seconds. Its middle is intentionally silent.
- **Equipped abilities** includes all six items. Lance fires the actual heavy bolt; Deflector has full-lifetime and absorb/break auditions. Utility items stage launch/landing, reserve refill, a four-second overtake and airborne stabilization with the shared gameplay effects. The studio uses presentation-only motion and never constructs a race or collision world. Jump Drive has separate launch and landing-catch recordings.
- Graphics quality uses the same pickup renderers as gameplay. Low keeps bare cues; High includes glow, trails and fractures. Normal inspection loads no pickup-test code, target or audition sounds without `dev=1` or `dev=2`.

Finish the complete device set using the [brief/template](../sounds/expansion.md) and [cue inventory](sounds.md). Listen with propulsion and Tunes; technical validation cannot judge the mix. Preserve natural tails, align attacks with real events and check loop seams by ear.

Register the current config/master/export and generation provenance in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json). The shared device bus decodes samples on unlock and applies the same voice budget, compressor, effects volume and underwater mix as synthesis. Physical ship collisions and lap/finish announcements share the sample loader. Countdown/GO retain their original synthesis. Lap/finish announcements use a clear bus outside the underwater filter, while retaining the shared effects volume and compressor. Sample-backed cues have no procedural fallback: missing files stay silent and dev previews report the failure. Stop, pause, mute and disposal stop owned voices.

## Source and licences

Runtime code is MIT. The model weights use the [Stability AI Community License](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE.md); the bundled Google T5Gemma text encoder also carries [Gemma terms](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE_GEMMA.md). Setup preserves both texts in `model-licenses/`. Downloads remain local; the game does not ship the runtime or weights. Record the pinned toolchain, config and any supplied reference audio when registering an accepted effect.
