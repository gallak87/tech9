# Sound effects

Keep one current prompt/settings JSON and WAV per effect, replacing revisions in place. See the [sound inventory](sounds.md) for gameplay cues.

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

For an isolated cue, use **Sounds → Play** with `?dev=1` or `?dev=2`. For the full sound/VFX sequence, use `?dev=1` or `?dev=2` and open **Race → Ship inspector → Powerups, equipment & contact → Trigger**, or `?inspect=1&dev=1&ship=kestrel`. Stop cancels the audition; triggering again starts fresh. Effects volume is shared with gameplay.

- **Engine sound** adds Driving/Boost while those buttons are on. It starts unchecked and silences on blur or close.
- **Shield target** adds Aegis to Rook for Arc/Repulsor/Lance. **Ion · incoming wake** instead attacks your ship and offers **Shield your ship**.
- **Aegis · shield** plays the full lifetime; **absorb + break** tests a hit after 1.5 seconds. Its middle is intentionally silent.
- **Equipped abilities** includes all six items. Lance fires the actual heavy bolt; Deflector has full-lifetime and absorb/break auditions. Utility items stage launch/landing, reserve refill, a four-second overtake and airborne stabilization with the shared gameplay effects. The studio uses presentation-only motion and never constructs a race or collision world. Jump Drive has separate launch and landing-catch recordings.
- **World contact → Fire · heat + recovery** plays four seconds of fire contact, then five seconds of recovery. The shared crackle, continuous slow lava-red hull pulse, smoke and flames fade together; High graphics also adds hull-wide heat shimmer. Stop clears both sound and effects.
- Graphics quality uses the same pickup renderers as gameplay. Low keeps bare cues; High includes glow, trails and fractures. Normal inspection loads no pickup-test code, target or audition sounds without `dev=1` or `dev=2`.

Listen with propulsion and Tunes. Preserve natural tails, align attacks with real events and check loop seams by ear.

Lance fire adds an offline audio edit after local generation: `assets/audio/sfx/lance-fire-edit.py --source <generated-WAV>` masters the generated ion discharge with a gentle low cut and softened upper frequencies, retaining its natural electrical body and charged-air tail. Its exact recipe and source/master hashes live in equipment provenance; runtime still plays the shared WAV sample.

Register the current config/master/export and generation provenance in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json). The shared device bus decodes samples on unlock and applies the same voice budget, compressor, effects volume and underwater mix as synthesis. Physical ship collisions and lap/finish announcements share the sample loader. Countdown/GO retain their original synthesis. Lap/finish announcements use a clear bus outside the underwater filter, while retaining the shared effects volume and compressor. Sample-backed cues have no procedural fallback: missing files stay silent and dev previews report the failure. Stop, pause, mute and disposal stop owned voices.

Helion fire and Cindercoil lava share one generated bonfire loop through `src/audio/hazard-contact.js`. The current nine-second sample covers the inspector's four-second contact and five-second recovery; gameplay loops it for variable contact lengths and fades gain with the same afterburn envelope as the ship effects. Its prompt (`Close field recording of a steady crackling bonfire. Dense continuous small wood crackles over a smooth flame hiss, filling the entire recording at an even level.`), final mono 24 kHz WAV and exact source/master hashes live in `assets/audio/sfx/hazard-contact-provenance.json`; `hazard-contact-edit.py --help` describes the reproducible mastering steps. Both levels prepare the same sample on unlock. The shared contact gain is 0.4; the recording supplies a steady close crackle over flame hiss. A short final release prevents a hard cutoff; pause, mute, reset and results stop the voice. The sample provides hazard feedback; propulsion retains its coded sound.

Interceptor boss recordings live separately in `assets/audio/sfx/bosses/`, preserving approved fleet cues. Generate one boss action at a time, then run `master.py --cue <id> --source <generated-WAV>` to fit its gameplay window, tame isolated peaks and apply a smooth release. The current prompt, source/master hashes and exact trim/filter/compression recipe stay in that folder. Boss phase and accepted-fire events share the race effects bus and the Sounds picker; they do not create another audio context or play during paused simulation.

## Source and licences

Runtime code is MIT. The model weights use the [Stability AI Community License](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE.md); the bundled Google T5Gemma text encoder also carries [Gemma terms](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/main/LICENSE_GEMMA.md). Setup preserves both texts in `model-licenses/`. Downloads remain local; the game does not ship the runtime or weights. Record the pinned toolchain, config and any supplied reference audio when registering an accepted effect.

## Landing and Freestyle

Gameplay, Sounds and Ship inspector → Powerups, equipment & contact → Landing & Freestyle share `landing-catch.wav`, the four `freestyle-bank-*.wav` recordings and `freestyle-trick.wav`. Touchdown plays on confirmed support; Good/Great/Perfect follows the 0.3 s grading window. Miss plays only on a confirmed failed bank. The click tallies each 25 continuous rotation points, capped at 32 ticks per second; completed rotations have no separate cue. Jump Drive retains its dedicated landing sample.
