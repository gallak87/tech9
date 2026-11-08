"""Master the two generated contact textures into small, seamless mono loops."""

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
RATE = 24000
OVERLAP = 2880
RECIPES = {
    "helion-fire-contact": {
        "start": 0.15,
        "end": 2.1,
        "filters": "highpass=f=120,lowpass=f=6500,acompressor=threshold=0.02:ratio=3.5:attack=4:release=80:makeup=2",
    },
    "cindercoil-lava-contact": {
        "start": 0.25,
        "end": 2.7,
        "filters": "highpass=f=90,lowpass=f=5200,acompressor=threshold=0.03:ratio=3:attack=5:release=100:makeup=1.6",
    },
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def master(name, source):
    recipe = RECIPES[name]
    with TemporaryDirectory(prefix="vn-contact-master-") as temporary:
        filtered = Path(temporary) / "filtered.wav"
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(source),
            "-af", recipe["filters"], "-ac", "1", "-ar", str(RATE),
            "-c:a", "pcm_s16le", str(filtered),
        ], check=True)
        with wave.open(str(filtered), "rb") as wav:
            samples = array("h", wav.readframes(wav.getnframes()))
        if sys.byteorder != "little":
            samples.byteswap()
    start = round(recipe["start"] * RATE)
    end = round(recipe["end"] * RATE)
    samples = samples[start:end]
    # Fold the tail across the head. The final frame now leads naturally into
    # the first frame; no encoder padding or a fade-to-silence seam is involved.
    body = list(samples[OVERLAP:-OVERLAP])
    seam = [
        samples[-OVERLAP + i] * math.cos(i / (OVERLAP - 1) * math.pi / 2)
        + samples[i] * math.sin(i / (OVERLAP - 1) * math.pi / 2)
        for i in range(OVERLAP)
    ]
    result = body + seam
    gain = (32767 * 0.5) / max(abs(value) for value in result)
    pcm = array("h", (round(value * gain) for value in result))
    if sys.byteorder != "little":
        pcm.byteswap()
    output = ROOT / (name + ".wav")
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    rms = math.sqrt(sum((value * gain / 32768) ** 2 for value in result) / len(result))
    return {
        "config": name + ".json",
        "configSha256": digest(ROOT / (name + ".json")),
        "sourceSha256": digest(source),
        "filters": recipe["filters"],
        "trimStartFrame": start,
        "trimEndFrame": end,
        "overlapFrames": OVERLAP,
        "overlapCurve": "equal-power cosine/sine tail-to-head, then rotate to the former head endpoint",
        "gain": gain,
        "seconds": len(result) / RATE,
        "bytes": output.stat().st_size,
        "peakDbfs": 20 * math.log10(max(abs(value * gain) for value in result) / 32768),
        "rmsDbfs": 20 * math.log10(rms),
        "sha256": digest(output),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fire", type=Path, required=True)
    parser.add_argument("--lava", type=Path, required=True)
    args = parser.parse_args()
    provenance = {
        "runtime": "Stable Audio 3 Small-SFX MLX",
        "toolchain": "tools/sfx-models.json",
        "referenceAudio": None,
        "format": "mono 24000 Hz 16-bit PCM; exact decoded loop endpoints",
        "rights": "AI-generated output; model weights use the Stability AI Community License and T5Gemma encoder carries Gemma terms. Runtime MIT. See docs/audio/sfx.md.",
        "mastering": "assets/audio/sfx/hazard-contact-edit.py",
        "approval": "Generated and integrated for in-game audition; no claim of user listening approval.",
        "cues": {
            "helion-fire-contact": master("helion-fire-contact", args.fire),
            "cindercoil-lava-contact": master("cindercoil-lava-contact", args.lava),
        },
    }
    (ROOT / "hazard-contact-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance["cues"], indent=2))


if __name__ == "__main__":
    main()
