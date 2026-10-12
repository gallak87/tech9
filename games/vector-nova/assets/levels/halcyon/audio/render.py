"""Generate the current Halcyon preview with quantized ACE-Step on Apple Metal."""

import argparse
from array import array
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
from tempfile import TemporaryDirectory
import wave

SOURCE = Path(__file__).resolve().parent
GAME = SOURCE.parents[3]
ACE_ROOT = Path(os.environ.get("ACESTEP_ROOT", str(GAME / ".audio-model/acestep.cpp"))).expanduser().resolve()
OUTPUT = SOURCE / "blue-hour-preview.wav"
SEED = 70931
DURATION = 120


def replace_preview(rendered: Path, output: Path, duration: int = DURATION) -> None:
    """Validate the native float WAV, apply headroom and tiny edge fades, then export."""
    raw = rendered.read_bytes()
    # ace-synth's wav32 writer emits a fixed 44-byte RIFF header.
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE" or raw[36:40] != b"data":
        raise RuntimeError("Unexpected native WAV layout")
    fmt, channels, sample_rate = struct.unpack_from("<HHI", raw, 20)
    if (fmt, channels, sample_rate) != (3, 2, 48000):
        raise RuntimeError("Expected stereo 48 kHz float audio")
    samples = array("f")
    samples.frombytes(raw[44:])
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples or not all(math.isfinite(value) for value in samples):
        raise RuntimeError("Generated audio is empty or non-finite")
    frames = len(samples) // channels
    # The planner may end a few 0.2-second codes early/late; retain its actual
    # duration so audition loops do not gain an artificial silent tail.
    if abs(frames / sample_rate - duration) > 1:
        raise RuntimeError(f"Unexpected duration: {frames / sample_rate:.3f}s")
    peak = max(abs(value) for value in samples)
    if peak < 0.001:
        raise RuntimeError("Generated audio is silent")
    gain = (10 ** (-1.5 / 20)) * 32767 / peak
    fade_frames = round(0.005 * sample_rate)
    pcm = array("h", (
        round(value * gain * min(1, (i // channels) / fade_frames,
                                (frames - 1 - i // channels) / fade_frames))
        for i, value in enumerate(samples)
    ))
    if sys.byteorder != "little":
        pcm.byteswap()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.wav")
    try:
        with wave.open(str(temporary), "wb") as wav:
            wav.setparams((channels, 2, sample_rate, frames, "NONE", "not compressed"))
            wav.writeframes(pcm.tobytes())
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Replaced {output} ({frames / sample_rate:.2f}s)", flush=True)


def main() -> None:
    """Generate one WAV master; audio:encode produces the playable MP3."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt", type=Path, default=SOURCE / "prompt.txt",
                        help="Text prompt file (default: current Halcyon prompt)")
    parser.add_argument("--output", type=Path, default=OUTPUT,
                        help="Destination WAV master (default: beside the Halcyon prompt)")
    parser.add_argument("--bpm", type=int, default=128,
                        help="Tempo in BPM (default: 128)")
    parser.add_argument("--key", default="F# minor",
                        help="Musical key (default: F# minor)")
    parser.add_argument("--duration", type=int, default=DURATION,
                        help="Length in seconds, 1–120 (default: 120)")
    parser.add_argument("--check", action="store_true",
                        help="Check runtime and models without generating audio")
    args = parser.parse_args()
    if not 1 <= args.duration <= 120 or args.bpm <= 0:
        parser.error("Use a duration from 1 to 120 seconds and a positive BPM.")
    for executable in ("ace-lm", "ace-synth"):
        if not (ACE_ROOT / "build" / executable).is_file():
            raise SystemExit(f"Missing {executable}; run npm run audio:setup; see docs/audio/README.md.")
    lock = json.loads((GAME / "tools/audio-models.json").read_text())
    for name, spec in lock["files"].items():
        model = ACE_ROOT / "models" / name
        if not model.is_file() or model.stat().st_size != spec["bytes"]:
            raise SystemExit(f"Missing or incomplete {name}; run npm run audio:setup.")
    if args.check:
        print(f"Runtime and model sizes ready at {ACE_ROOT}; setup verifies checksums.")
        return
    caption = args.prompt.read_text().strip()
    if not caption:
        parser.error("The prompt file is empty.")
    request = {
        "caption": caption,
        "lyrics": "[Instrumental]", "vocal_language": "unknown",
        "bpm": args.bpm, "keyscale": args.key, "timesignature": "4",
        "duration": args.duration, "seed": SEED, "lm_seed": SEED,
        "lm_batch_size": 1, "synth_batch_size": 1, "use_cot_caption": False,
        "inference_steps": 8, "shift": 3.0, "guidance_scale": 1.0,
        "lm_model": "acestep-5Hz-lm-0.6B-Q8_0.gguf",
        "synth_model": "acestep-v15-turbo-Q8_0.gguf",
        "output_format": "wav32",
    }
    # Native CLI intermediates exist only for this run and are removed on exit.
    with TemporaryDirectory(prefix="halcyon-music-") as temporary:
        folder = Path(temporary)
        (folder / "request.json").write_text(json.dumps(request))
        print("Planning one instrumental with the quantized 0.6B model…", flush=True)
        subprocess.run([
            str(ACE_ROOT / "build/ace-lm"), "--models", str(ACE_ROOT / "models"),
            "--request", str(folder / "request.json"), "--max-seq", "2048",
        ], check=True, cwd=ACE_ROOT)
        print("Rendering with quantized Turbo; one GPU module loaded at a time…", flush=True)
        subprocess.run([
            str(ACE_ROOT / "build/ace-synth"), "--models", str(ACE_ROOT / "models"),
            "--request", str(folder / "request0.json"), "--vae-chunk", "256",
        ], check=True, cwd=ACE_ROOT)
        replace_preview(folder / "request00.wav", args.output, args.duration)
    print("Run npm run audio:encode to refresh the catalog's playable MP3s.", flush=True)


if __name__ == "__main__":
    main()
