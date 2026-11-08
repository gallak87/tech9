"""Convert the generated shared fire contact recording into one mono loop."""

import argparse
from array import array
import hashlib
import io
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
FINAL_FRAMES = RATE * 9


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convert(source):
    with TemporaryDirectory(prefix="vn-contact-master-") as temporary:
        converted = Path(temporary) / "converted.wav"
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(source),
            "-ac", "1", "-ar", str(RATE),
            "-c:a", "pcm_s16le", str(converted),
        ], check=True)
        with wave.open(str(converted), "rb") as wav:
            samples = array("h", wav.readframes(wav.getnframes()))
        if sys.byteorder != "little":
            samples.byteswap()
    return samples


def fold(samples):
    # Fold the tail across the head. The final frame now leads naturally into
    # the first frame; no encoder padding or a fade-to-silence seam is involved.
    body = list(samples[OVERLAP:-OVERLAP])
    seam = [
        samples[-OVERLAP + i] * math.cos(i / (OVERLAP - 1) * math.pi / 2)
        + samples[i] * math.sin(i / (OVERLAP - 1) * math.pi / 2)
        for i in range(OVERLAP)
    ]
    return body + seam


def wav_bytes(samples):
    pcm = array("h", (round(value) for value in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


def master(source):
    name = "fire-contact"
    samples = convert(source)
    end = FINAL_FRAMES + OVERLAP
    if len(samples) < end:
        raise ValueError("Generate at least 9.12 seconds for a nine-second loop.")
    # Keep the continuous body, avoiding the model's final tail. The 120 ms
    # overlap gives a nine-second loop for four seconds of contact + recovery.
    result = fold(samples[:end])
    # Start on a quiet adjacent-sample crossing within the first 10 ms. This
    # only rotates the complete loop; it does not mute or remove any crackle.
    ordinary_step = sum(abs(result[i] - result[i - 1]) for i in range(1, len(result))) / (len(result) - 1)
    rotation = next((i for i in range(1, RATE // 100) if abs(result[i] - result[i - 1]) < ordinary_step * 0.5), 0)
    result = result[rotation:] + result[:rotation]
    gain = (32767 * 0.5) / max(abs(value) for value in result)
    result = [value * gain for value in result]
    output = ROOT / (name + ".wav")
    output.write_bytes(wav_bytes(result))
    rms = math.sqrt(sum((value / 32768) ** 2 for value in result) / len(result))
    return {
        "config": name + ".json",
        "configSha256": digest(ROOT / (name + ".json")),
        "sourceSha256": digest(source),
        "processing": "New model generation of crisp continuous bonfire crackles; first 9.12 seconds converted to mono 24 kHz, peak-leveled and folded by 120 ms into a nine-second loop; no EQ or compression",
        "sourceFramesAfterConversion": len(samples),
        "trimStartFrame": 0,
        "trimEndFrame": end,
        "overlapFrames": OVERLAP,
        "loopRotationFrames": rotation,
        "overlapCurve": "equal-power cosine/sine tail-to-head, then rotate to the former head endpoint",
        "gain": gain,
        "seconds": len(result) / RATE,
        "bytes": output.stat().st_size,
        "peakDbfs": 20 * math.log10(max(abs(value) for value in result) / 32768),
        "rmsDbfs": 20 * math.log10(rms),
        "sha256": digest(output),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    provenance = {
        "runtime": "Stable Audio 3 Small-SFX MLX",
        "toolchain": "tools/sfx-models.json",
        "referenceAudio": None,
        "format": "mono 24000 Hz 16-bit PCM; exact decoded loop endpoints",
        "rights": "AI-generated output; model weights use the Stability AI Community License and T5Gemma encoder carries Gemma terms. Runtime MIT. See docs/audio/sfx.md.",
        "mastering": "assets/audio/sfx/hazard-contact-edit.py",
        "approval": "Regenerated at the user's request with a clearer continuous wood-crackle prompt; this new take and in-game mix await user audition.",
        "cues": {
            "fire-contact": master(args.source),
        },
    }
    (ROOT / "hazard-contact-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance["cues"], indent=2))


if __name__ == "__main__":
    main()
