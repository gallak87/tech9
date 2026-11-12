"""Master the current thump/tonal set without replacing the approved trick click.

Render each current non-click JSON into <cue>-source.wav in one directory,
then run: python3 assets/audio/sfx/landing-feedback-master.py --sources <directory>
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
# Source start, final duration, high/low cut, peak dBFS, edge fades.
RECIPES = {
    "landing-catch": (.99, .24, 35, 3500, -2, .001, .045),
    "freestyle-bank-good": (0, .26, 140, 1000, -3, .004, .035),
    "freestyle-bank-great": (.045, .30, 140, 1800, -3, .004, .04),
    "freestyle-bank-perfect": (0, .36, 120, 2300, -3, .004, .05),
    "freestyle-bank-miss": (.055, .32, 80, 1200, -3, .006, .06),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decoded(path):
    with wave.open(str(path), "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (2, RATE, 2):
            raise ValueError("Expected stereo 44.1 kHz 16-bit PCM")
        data = array("h", wav.readframes(wav.getnframes()))
    if sys.byteorder != "little":
        data.byteswap()
    return [value / 32768 for value in data]


def master(cue, sources):
    start, seconds, low, high, peak_db, fade_in, fade_out = RECIPES[cue]
    source = sources / f"{cue}-source.wav"
    raw = decoded(source)
    if len(raw) / (RATE * 2) < start + seconds:
        raise ValueError(f"Source is too short: {cue}")
    filters = [f"atrim=start={start}:duration={seconds}", "asetpts=PTS-STARTPTS",
               f"highpass=f={low}", f"lowpass=f={high}"]
    with TemporaryDirectory(prefix="landing-master-") as temporary:
        pcm = Path(temporary) / "filtered.f32"
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-af", ",".join(filters), "-ac", "2", "-ar", str(RATE),
            "-f", "f32le", str(pcm),
        ], check=True)
        data = array("f", pcm.read_bytes())
    if sys.byteorder != "little":
        data.byteswap()
    frames = round(seconds * RATE)
    if len(data) != frames * 2 or not all(math.isfinite(value) for value in data):
        raise ValueError(f"Invalid mastered source: {cue}")
    accent = None
    if cue == "landing-catch":
        # The approved click is only borrowed as a quiet crisp contact detail;
        # its master/config and standalone playback remain byte-for-byte intact.
        click = ROOT / "freestyle-trick.wav"
        detail = decoded(click)
        click_peak = max(abs(value) for value in detail)
        body_peak = max(abs(value) for value in data)
        begin = round(.012 * RATE) * 2
        for index, value in enumerate(detail[:len(data) - begin]):
            data[index + begin] += value / click_peak * body_peak * .12
        accent = {"file": click.name, "sha256": digest(click),
                  "relativePeak": .12, "delaySeconds": .012}
    for frame in range(frames):
        attack = min(1, frame / max(1, round(fade_in * RATE)))
        release = min(1, (frames - 1 - frame) / max(1, round(fade_out * RATE)))
        envelope = attack * (.5 - .5 * math.cos(math.pi * release))
        for channel in range(2):
            data[frame * 2 + channel] *= envelope
    peak = max(abs(value) for value in data)
    if peak < .0001:
        raise ValueError(f"Silent cue: {cue}")
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
            "sourceSha256": digest(source), "master": target.name,
            "masterSha256": digest(target), "durationSeconds": seconds,
            "sourceStartSeconds": start,
            "processing": {"highpassHz": low, "lowpassHz": high,
                           "pitchOrTempoChanges": False, "compressor": None,
                           "peakDbfs": peak_db, "fadeInSeconds": fade_in,
                           "raisedCosineFadeOutSeconds": fade_out,
                           "approvedClickAccent": accent}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    args = parser.parse_args()
    record = ROOT / "landing-feedback-provenance.json"
    prior = json.loads(record.read_text())
    approved = prior["cues"]["freestyle-trick"]
    if digest(ROOT / approved["master"]) != approved["masterSha256"]:
        raise ValueError("Approved trick master does not match its provenance")
    if digest(ROOT / approved["config"]) != approved["configSha256"]:
        raise ValueError("Approved trick config does not match its provenance")
    cues = {cue: master(cue, args.sources) for cue in RECIPES}
    cues["freestyle-trick"] = approved
    provenance = {
        "runtime": "Stable Audio 3 Small-SFX MLX", "toolchain": "tools/sfx-models.json",
        "mastering": "landing-feedback-master.py; five new generated sources, trim/filter/level and silent fades; approved trick retained",
        "referenceAudio": None, "format": "stereo 44100 Hz 16-bit PCM",
        "direction": "Crisp physical thump; dim Good tone, brighter Great, fuller Perfect and a subdued descending Miss. Approved trick click unchanged.",
        "approval": "Replacement set generated for user listening; trick click approved, new cues pending listening review.",
        "cues": cues,
    }
    record.write_text(json.dumps(provenance, indent=2) + "\n")
    print("Replaced five cues; approved trick click/config/provenance preserved.")


if __name__ == "__main__":
    main()
