"""Master the current generated landing and Freestyle cue set.

Run: python3 assets/audio/sfx/landing-feedback-master.py --sources <directory>
Inputs are <cue>-source.wav files rendered with each current <cue>.json.
"""

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import wave

ROOT = Path(__file__).resolve().parent
# Source start/window, final duration, low/high cut, peak dBFS, edge fades.
RECIPES = {
    "landing-catch": (1.025, .42, .42, 35, 6200, -1.5, .001, .045),
    "freestyle-bank-good": (.135, .66, .35, 90, 6500, -2, .002, .035),
    "freestyle-bank-great": (0, 1.08, .45, 90, 6500, -2, .002, .05),
    "freestyle-bank-perfect": (.025, 1.18, .65, 80, 7000, -1.8, .002, .065),
    "freestyle-trick": (0, .1, .1, 180, 5000, -4, .0005, .018),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def master(cue, source):
    start, window, seconds, low, high, peak_db, fade_in, fade_out = RECIPES[cue]
    with wave.open(str(source), "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (2, 44100, 2):
            raise ValueError("Expected generated stereo 44.1 kHz 16-bit PCM")
        if wav.getnframes() / 44100 + 1e-6 < start + window:
            raise ValueError(f"Source is too short for {cue}")
    filters = [
        f"atrim=start={start}:duration={window}", "asetpts=PTS-STARTPTS",
        f"highpass=f={low}", f"lowpass=f={high}",
    ]
    tempo = window / seconds
    tempos = []
    while tempo > 2:
        tempos.append(2)
        tempo /= 2
    if abs(tempo - 1) > 1e-8:
        tempos.append(tempo)
    filters.extend(f"atempo={value:.12g}" for value in tempos)
    filters.extend([f"apad=whole_dur={seconds}", f"atrim=duration={seconds}"])
    compressor = cue != "freestyle-trick"
    if compressor:
        filters.append("acompressor=threshold=0.1:ratio=1.8:attack=1:release=45:makeup=1")
    with TemporaryDirectory(prefix="landing-master-") as temporary:
        pcm = Path(temporary) / "filtered.f32"
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-af", ",".join(filters), "-ac", "2", "-ar", "44100",
            "-f", "f32le", str(pcm),
        ], check=True)
        data = array("f", pcm.read_bytes())
    if sys.byteorder != "little":
        data.byteswap()
    frames = round(seconds * 44100)
    if len(data) != frames * 2:
        raise ValueError(f"Unexpected mastered length for {cue}")
    for frame in range(frames):
        attack = min(1, frame / max(1, round(fade_in * 44100)))
        release = min(1, (frames - 1 - frame) / max(1, round(fade_out * 44100)))
        envelope = attack * (.5 - .5 * math.cos(math.pi * release))
        for channel in range(2):
            data[frame * 2 + channel] *= envelope
    peak = max(abs(value) for value in data)
    if peak < .0001 or not all(math.isfinite(value) for value in data):
        raise ValueError(f"Silent or non-finite cue: {cue}")
    gain = 10 ** (peak_db / 20) / peak
    output = array("h", (round(value * gain * 32767) for value in data))
    if sys.byteorder != "little":
        output.byteswap()
    target = ROOT / f"{cue}.wav"
    with wave.open(str(target), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(output.tobytes())
    return {
        "config": f"{cue}.json", "configSha256": digest(ROOT / f"{cue}.json"),
        "sourceSha256": digest(source), "master": target.name,
        "masterSha256": digest(target), "durationSeconds": seconds,
        "sourceStartSeconds": start, "sourceWindowSeconds": window,
        "processing": {"highpassHz": low, "lowpassHz": high,
                       "pitchPreservingTempo": tempos, "compressor":
                       {"threshold": .1, "ratio": 1.8, "attackMs": 1, "releaseMs": 45}
                       if compressor else None,
                       "peakDbfs": peak_db, "fadeInSeconds": fade_in,
                       "raisedCosineFadeOutSeconds": fade_out},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    args = parser.parse_args()
    provenance = {
        "runtime": "Stable Audio 3 Small-SFX MLX",
        "toolchain": "tools/sfx-models.json",
        "mastering": "landing-feedback-master.py; FFmpeg filters and pitch-preserving atempo",
        "referenceAudio": None, "format": "stereo 44100 Hz 16-bit PCM",
        "approval": "Integrated for user listening and gameplay review; no human approval claimed.",
        "cues": {cue: master(cue, args.sources / f"{cue}-source.wav") for cue in RECIPES},
    }
    (ROOT / "landing-feedback-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Mastered " + ", ".join(provenance["cues"]))


if __name__ == "__main__":
    main()
