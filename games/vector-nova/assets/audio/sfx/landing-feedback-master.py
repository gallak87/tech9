"""Master the calm thump/click landing family from two generated sources.

Run: python3 assets/audio/sfx/landing-feedback-master.py --sources <directory>
Inputs: landing-thump-source.wav and landing-click-source.wav.
The four thump configs intentionally share a prompt/seed. Grade differences
are restrained body/click balance and decay, without notes or pitch changes.
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
RATE = 44100
# Duration, thump/click weights, click delay, body/click lowpass, peak dBFS.
RECIPES = {
    "landing-catch": (.24, 1, .22, .018, 700, 3200, -2),
    "freestyle-bank-good": (.16, .42, .18, .012, 500, 2200, -3),
    "freestyle-bank-great": (.19, .60, .20, .012, 600, 2500, -3),
    "freestyle-bank-perfect": (.23, .78, .22, .012, 700, 2800, -3),
    "freestyle-trick": (.06, 0, .28, 0, 700, 2200, -6),
}
SOURCES = {
    "thump": ("landing-thump-source.wav", "landing-catch.json", .015, .28, 35),
    "click": ("landing-click-source.wav", "freestyle-trick.json", .95, .08, 650),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stem(source, start, seconds, low, high):
    with wave.open(str(source), "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (2, RATE, 2):
            raise ValueError("Expected generated stereo 44.1 kHz 16-bit PCM")
        if wav.getnframes() / RATE < start + seconds:
            raise ValueError("Generated source is too short")
    filters = [f"atrim=start={start}:duration={seconds}", "asetpts=PTS-STARTPTS",
               f"highpass=f={low}", f"lowpass=f={high}"]
    with TemporaryDirectory(prefix="landing-stem-") as temporary:
        pcm = Path(temporary) / "filtered.f32"
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-af", ",".join(filters), "-ac", "2", "-ar", str(RATE),
            "-f", "f32le", str(pcm),
        ], check=True)
        data = array("f", pcm.read_bytes())
    if sys.byteorder != "little":
        data.byteswap()
    peak = max(abs(value) for value in data)
    if peak < .0001 or not all(math.isfinite(value) for value in data):
        raise ValueError("Invalid source stem")
    return [value / peak for value in data]


def master(cue, sources):
    seconds, body_weight, click_weight, delay, body_high, click_high, peak_db = RECIPES[cue]
    frames = round(seconds * RATE)
    data = [0.] * (frames * 2)
    inputs = []
    for name, weight, offset, high in [
        ("thump", body_weight, 0, body_high),
        ("click", click_weight, delay, click_high),
    ]:
        if weight == 0:
            continue
        filename, config, start, window, low = SOURCES[name]
        source = sources / filename
        decoded = stem(source, start, window, low, high)
        begin = round(offset * RATE) * 2
        for index, value in enumerate(decoded[:len(data) - begin]):
            data[index + begin] += value * weight
        inputs.append({"source": name, "sourceSha256": digest(source),
                       "config": config, "configSha256": digest(ROOT / config),
                       "startSeconds": start, "windowSeconds": window,
                       "highpassHz": low, "lowpassHz": high,
                       "weight": weight, "delaySeconds": offset})
    fade_in = .0015 if body_weight else .0008
    fade_out = min(.035, seconds * .3)
    for frame in range(frames):
        attack = min(1, frame / max(1, round(fade_in * RATE)))
        release = min(1, (frames - 1 - frame) / max(1, round(fade_out * RATE)))
        envelope = attack * (.5 - .5 * math.cos(math.pi * release))
        for channel in range(2):
            data[frame * 2 + channel] *= envelope
    peak = max(abs(value) for value in data)
    gain = 10 ** (peak_db / 20) / peak
    output = array("h", (round(value * gain * 32767) for value in data))
    if sys.byteorder != "little":
        output.byteswap()
    target = ROOT / f"{cue}.wav"
    with wave.open(str(target), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(output.tobytes())
    return {"config": f"{cue}.json", "configSha256": digest(ROOT / f"{cue}.json"),
            "inputs": inputs, "master": target.name, "masterSha256": digest(target),
            "durationSeconds": seconds,
            "processing": {"pitchOrTempoChanges": False, "compressor": None,
                           "peakDbfs": peak_db, "fadeInSeconds": fade_in,
                           "raisedCosineFadeOutSeconds": fade_out}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    args = parser.parse_args()
    provenance = {
        "runtime": "Stable Audio 3 Small-SFX MLX", "toolchain": "tools/sfx-models.json",
        "mastering": "landing-feedback-master.py; shared generated thump/click stems, filtering, balance and silent fades",
        "referenceAudio": None, "format": "stereo 44100 Hz 16-bit PCM",
        "direction": "Calm muted thump and clean dry click; no melody, chord, flourish or pitch progression.",
        "approval": "Revised for user listening; no human approval claimed.",
        "cues": {cue: master(cue, args.sources) for cue in RECIPES},
    }
    (ROOT / "landing-feedback-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Mastered calm thump/click family: " + ", ".join(provenance["cues"]))


if __name__ == "__main__":
    main()
