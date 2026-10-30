"""Master the current boss-only Small-SFX recordings without touching fleet cues."""

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parent
RECIPES = {
    "goliath-charge": (0, 1.4, 28, 3600, -3, 0.012, 0.055),
    "goliath-turn": (0.17, 0.8, 32, 3000, -2.5, 0.004, 0.07),
    "goliath-fire": (0, 0.7, 28, 2800, -1, 0.001, 0.08),
    "goliath-expose": (0.04, 1.1, 30, 3300, -2, 0.004, 0.08),
    "goliath-recover": (0, 0.6, 28, 3000, -2.5, 0.003, 0.07),
    "goliath-core-hit": (0, 0.5, 28, 3000, -1.5, 0.001, 0.065),
    "goliath-lock": (0, 0.3, 32, 3300, -2, 0.001, 0.045),
    "goliath-disable": (0.06, 1.2, 26, 3200, -1.5, 0.003, 0.1),
    "wraith-charge": (0, 1.2, 40, 4200, -3, 0.009, 0.045),
    "wraith-lock": (0, 0.25, 45, 4200, -2.5, 0.001, 0.04),
    "wraith-turn": (0.05, 0.55, 40, 4000, -2.5, 0.003, 0.055),
    "wraith-fire": (0.15, 0.45, 38, 3800, -1.5, 0.001, 0.065),
    "wraith-counter": (0, 0.55, 38, 4100, -2, 0.002, 0.065),
    "wraith-expose": (0, 0.8, 40, 3400, -2.5, 0.004, 0.065),
    "wraith-core-hit": (0.04, 0.4, 35, 3800, -1.5, 0.001, 0.065),
    "wraith-disable": (0.05, 1.2, 32, 4000, -1.5, 0.003, 0.1),
}
DECAYS = {
    "goliath-disable": {"startSeconds": 0.2, "exponent": 2},
    "wraith-disable": {"startSeconds": 0.18, "exponent": 2.4},
}


def filter_audio(data, channels, rate, kind, hz):
    cosine = math.cos(2 * math.pi * hz / rate)
    alpha = math.sin(2 * math.pi * hz / rate) / math.sqrt(2)
    a0 = 1 + alpha
    if kind == "highpass":
        b = [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2]
    else:
        b = [(1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2]
    b = [value / a0 for value in b]
    a = [-2 * cosine / a0, (1 - alpha) / a0]
    history = [[0.0, 0.0, 0.0, 0.0] for _ in range(channels)]
    for i, value in enumerate(data):
        state = history[i % channels]
        output = (
            b[0] * value + b[1] * state[0] + b[2] * state[1]
            - a[0] * state[2] - a[1] * state[3]
        )
        state[:] = [value, state[0], output, state[2]]
        data[i] = output
    return {"type": kind, "hz": hz, "Q": math.sqrt(0.5)}


def compress_audio(data, channels, rate):
    # A transparent peak-envelope compressor brings out motor/air body without
    # clipping the late mechanical transient or adding distortion harmonics.
    threshold = max(abs(value) for value in data) * 0.2
    release = math.exp(-1 / (rate * 0.055))
    envelope = 0.0
    for frame in range(len(data) // channels):
        peak = max(abs(data[frame * channels + c]) for c in range(channels))
        envelope = max(peak, envelope * release)
        gain = (envelope / threshold) ** (-2 / 3) if envelope > threshold else 1
        for channel in range(channels):
            data[frame * channels + channel] *= gain
    return {"thresholdRelativeToPeak": 0.2, "ratio": 3, "releaseSeconds": 0.055}


def master(cue, source):
    raw = source.read_bytes()
    with wave.open(str(source), "rb") as wav:
        rate, channels, width = (
            wav.getframerate(), wav.getnchannels(), wav.getsampwidth()
        )
        if (rate, channels, width) != (44100, 2, 2):
            raise ValueError("Expected stereo 44100 Hz 16-bit source")
        pcm = array("h", wav.readframes(wav.getnframes()))
    if sys.byteorder != "little":
        pcm.byteswap()
    start_seconds, seconds, low, high, peak_db, fade_in, fade_out = RECIPES[cue]
    start = round(start_seconds * rate)
    end = start + round(seconds * rate)
    if end * channels > len(pcm):
        raise ValueError("Source is too short for this mastering recipe")
    data = [value / 32768 for value in pcm[start * channels:end * channels]]
    filters = [
        filter_audio(data, channels, rate, "highpass", low),
        filter_audio(data, channels, rate, "lowpass", high),
    ]
    compressor = compress_audio(data, channels, rate)
    frames = len(data) // channels
    attack, release = round(fade_in * rate), round(fade_out * rate)
    decay = DECAYS.get(cue)
    for frame in range(frames):
        leading = min(1, frame / max(1, attack))
        trailing = min(1, (frames - frame - 1) / max(1, release))
        gain = leading * (0.5 - 0.5 * math.cos(math.pi * trailing))
        if decay:
            progress = max(0, frame / rate - decay["startSeconds"])
            gain *= math.exp(-decay["exponent"] * progress / (seconds - decay["startSeconds"]))
        for channel in range(channels):
            data[frame * channels + channel] *= gain
    peak = max(abs(value) for value in data)
    if peak < 0.0001 or not all(math.isfinite(value) for value in data):
        raise ValueError("Invalid or silent mastered cue")
    gain = 10 ** (peak_db / 20) / peak
    mastered = array("h", (round(value * gain * 32767) for value in data))
    if sys.byteorder != "little":
        mastered.byteswap()
    target = ROOT / f"{cue}.wav"
    with wave.open(str(target), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        wav.writeframes(mastered.tobytes())
    provenance_path = ROOT / "provenance.json"
    provenance = json.loads(provenance_path.read_text()) if provenance_path.exists() else {
        "runtime": "Stable Audio 3 Small-SFX MLX",
        "toolchain": "tools/sfx-models.json",
        "referenceAudio": None,
        "format": "stereo 44100 Hz 16-bit PCM",
        "approval": "Integrated for encounter critique; human listening approval pending.",
        "cues": {},
    }
    provenance["cues"][cue] = {
        "config": f"{cue}.json",
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "trimStartFrame": start,
        "trimEndFrame": end,
        "filters": filters,
        "compressor": compressor,
        "gain": gain,
        "peakDbfs": peak_db,
        "fadeInFrames": attack,
        "fadeOutFrames": release,
        "fadeOutCurve": "raised-cosine",
        "seconds": seconds,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "editScript": "master.py",
        **({"bodyDecay": decay} if decay else {}),
    }
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"{cue}: {seconds:.2f}s, {peak_db:.1f}dBFS, clean zero-ended release")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cue", choices=RECIPES, required=True)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    master(args.cue, args.source)
