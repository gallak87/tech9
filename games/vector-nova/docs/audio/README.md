# Gameplay music

Build music we want to race to: deep, futuristic and immersive, with enough drive to stay engaging. The direction is sustained synth harmony, fluid bass and evolving texture; big EDM drops are welcome. Avoid cheesy piano/plinky leads, busy note patterns, monotonous percussion and long quiet intros. Vary groove, harmony and BPM across a pool that can grow toward roughly 16 tracks.

**Codex writes prompts and runs generation; the user listens and makes the musical decisions.** Blue Hour anchors Halcyon; `mix` tracks explore the wider soundtrack. Keep one current prompt, WAV master and MP3 export per song. Overwrite revisions and delete rejected songs, including their catalog entries; no numbered takes, evidence folders or iteration reports.

## Setup

From `games/vector-nova`, on native Apple Silicon macOS, install Python 3, Git, curl, Xcode command-line tools (`xcode-select --install`) and CMake (`brew install cmake` if using Homebrew), then:

```sh
npm run audio:setup
npm run audio:generate -- --check
```

Setup pins the native runtime, ggml submodule and approximately 4.1 GiB of model weights using [the lock file](../../tools/audio-models.json). It builds Metal/Accelerate binaries and verifies SHA-256 checksums. Everything downloaded or built stays in gitignored `.audio-model/acestep.cpp/`, including `models/` and licence files. Rerunning reuses verified files and resumes partial downloads. Other platforms are not scripted yet.

To reuse downloads from an existing installation, add `--models-from /path/to/acestep.cpp/models` to `npm run audio:setup --`. Generation uses the local cache by default; `ACESTEP_ROOT` can point to another prepared runtime. The Q8 Turbo / 0.6B planner and 256-frame VAE tiles target roughly 8 GB of working memory, leaving room for other apps on a 16 GB Mac. Run one generation at a time.

## Generate

Edit a [current prompt](../../assets/levels/halcyon/audio/README.md), then match its tempo/key and destination:

```sh
npm run audio:generate -- \
  --prompt assets/levels/halcyon/audio/ionwake.txt \
  --output assets/levels/halcyon/audio/ionwake.wav \
  --bpm 134 --key "D minor"
```

Defaults regenerate Blue Hour at 128 BPM / F♯ minor. Length defaults to 120 seconds; use `--duration 30` for a short sketch (1–120 seconds supported). Existing songs use seed 70931, 4/4 and 8 diffusion steps. The planner preserves the supplied caption and metadata; instructions about arrangement are requests, not guarantees.

A successful render atomically replaces the selected WAV master: stereo 48 kHz / 16-bit, peak −1.5 dBFS, 5 ms edge fades. Native duration may vary by up to one second. Requests and intermediate float audio are temporary and cleaned automatically. Encode the master before listening in Tunes.

## Encode for web delivery

Install FFmpeg with libmp3lame (`brew install ffmpeg` on macOS). WAV masters live beside the prompts in `assets/levels/<slug>/audio/`; only 192 kbps stereo 48 kHz MP3s belong in the matching `public/` directory. Encode directly from the WAV master, never from a previous MP3. Encoding does not change the mix or normalize loudness.

```sh
npm run audio:encode                  # every catalog track
npm run audio:encode -- ionwake       # selected track ID(s)
node tools/assets-verify.mjs
```

The encoder reads [tracks.js](../../src/audio/tracks.js), derives each master by replacing its `.mp3` path with `.wav` outside `public/`, and atomically replaces each completed export. Unknown IDs, missing masters or encoder failures stop the command. Commit the masters and encoded exports with their catalog/provenance updates. Vite copies the MP3s as static assets; neither local production builds nor GitHub Actions need FFmpeg, Python or the generation models. Keep WAVs out of `public/` so builds do not ship both formats.

## Process

1. Pick a feeling, BPM/key, groove and instrument roles. Distinguish songs through rhythm and harmony as well as timbre.
2. Ask for an established groove immediately: e.g. “cold open, kick/snare/bass/chords together on the first downbeat.” Give the two-minute piece contrast, drops and a changing return. Do not spend a quarter of it waiting for the music to begin.
3. Render sequentially, encode, listen in Tunes, translate feedback into one concrete prompt change and overwrite. Technical checks can catch silence/clipping; they cannot judge whether a groove feels good.
4. For a new song, add its prompt/WAV master, title/BPM/`tags` and `.mp3` filename in [tracks.js](../../src/audio/tracks.js), its row in the source README and an entry in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json), then run `audio:encode`. Blue Hour uses `['halcyon']`; general auditions use `['mix']`.
5. Finish gameplay balance and the audible loop transition with the user before treating a song as a finished circuit soundtrack. [Circuit briefs](circuit-briefs.md) provide starting directions; a reusable generation Skill is [roadmapped](../../ROADMAP.md).

## In-game audition

Tunes is enabled on every circuit by default; `?music=0` disables it for development. Music starts with race/practice start; a manual pause is respected on subsequent starts in that page session. **M** plays/pauses, **,** and **.** change songs, and **/** expands/collapses. Repeat is off initially: songs advance through the list, and Shuffle changes that order. Repeat loops the current song when enabled. Song, volume, repeat, shuffle and collapsed state are saved locally. Refresh or switch away/back after replacing an MP3.

The audition mix is independent of game pause/restarts and environment effects; hiding the tab pauses it. Keep browser/player testing manual for this iteration; this pass is desktop-only.

## Authoring approach

Prompts, WAV masters and source/licence notes live in `assets/levels/<slug>/audio/`; playable MP3 exports live in `public/assets/levels/<slug>/audio/`. The current pool shares the Halcyon folder, while metadata tags express circuit assignment. See the [Halcyon brief](halcyon.md) and [source catalog](../../assets/levels/halcyon/audio/README.md). Final race lifecycle behavior remains part of integrating the finished soundtrack.
