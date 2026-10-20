"""Set up and run Stable Audio 3 Small-SFX locally on Apple Silicon."""

import argparse
from array import array
from contextlib import contextmanager
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import wave

GAME = Path(__file__).resolve().parents[1]
CACHE = GAME / ".audio-model"
ROOT = CACHE / "stable-audio-3"
MLX = ROOT / "optimized/mlx"
PYTHON = MLX / ".venv/bin/python"
LOCK = json.loads((GAME / "tools/sfx-models.json").read_text())
ENV = {
    **os.environ,
    "UV_CACHE_DIR": str(CACHE / "sfx-cache/uv"),
    "UV_PYTHON_INSTALL_DIR": str(CACHE / "sfx-python"),
    "HF_HOME": str(CACHE / "sfx-cache/huggingface"),
    "HF_HUB_OFFLINE": "1",
    "PYTHONUNBUFFERED": "1",
}


def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], env=ENV, check=True, **kwargs)


@contextmanager
def exclusive():
    CACHE.mkdir(parents=True, exist_ok=True)
    with (CACHE / "sfx.lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another SFX setup/render is running; wait for it to finish.")
        yield


def verified(path, spec, checksum=True):
    if not path.is_file() or path.stat().st_size != spec["bytes"]:
        return False
    if not checksum:
        return True
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == spec["sha256"]


def revision():
    result = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "--verify", "HEAD"],
        text=True, capture_output=True,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def download(name, spec):
    target = ROOT / spec["path"]
    if verified(target, spec):
        print(f"Verified {name}", flush=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    if partial.exists() and partial.stat().st_size >= spec["bytes"]:
        if verified(partial, spec):
            partial.replace(target)
            return
        partial.unlink()
    url = f"https://huggingface.co/{LOCK['modelRepo']}/resolve/{LOCK['modelRevision']}/{name}"
    print(f"Downloading {name}", flush=True)
    command = (
        "curl", "--fail", "--location", "--silent", "--show-error",
        "--retry", "3", "--connect-timeout", "30", "--continue-at", "-",
        "--output", partial, url,
    )
    try:
        run(*command)
    except subprocess.CalledProcessError as error:
        if error.returncode != 33:
            raise
        partial.unlink(missing_ok=True)
        run(*command)
    if not verified(partial, spec):
        partial.unlink(missing_ok=True)
        raise SystemExit(f"Checksum mismatch for {name}; rerun setup.")
    partial.replace(target)


def check(checksum=True):
    if revision() != LOCK["runtimeRevision"] or not PYTHON.is_file():
        raise SystemExit("Missing or different SFX runtime; run npm run sfx:setup.")
    for name, spec in LOCK["files"].items():
        if not verified(ROOT / spec["path"], spec, checksum):
            raise SystemExit(f"Missing or damaged {name}; run npm run sfx:setup.")
    run(PYTHON, "-c",
        "import mlx.core as mx, numpy, sentencepiece; "
        "assert mx.metal.is_available(), 'MLX Metal device unavailable'; "
        "print('Small-SFX runtime and Metal device ready.')")


def setup():
    missing = [name for name in ("git", "curl", "uv") if not shutil.which(name)]
    if missing:
        raise SystemExit(f"Install {', '.join(missing)} first; see docs/audio/sfx.md.")
    ROOT.mkdir(parents=True, exist_ok=True)
    if not (ROOT / ".git").exists():
        if any(ROOT.iterdir()):
            raise SystemExit(f"Refusing to initialize over nonempty {ROOT}.")
        run("git", "init", ROOT)
        run("git", "-C", ROOT, "remote", "add", "origin", LOCK["runtimeRepo"])
    head = revision()
    if head and head != LOCK["runtimeRevision"]:
        raise SystemExit(f"Runtime differs from the pin; move {ROOT} aside and rerun setup.")
    if not head:
        run("git", "-C", ROOT, "fetch", "--depth", "1", "origin", LOCK["runtimeRevision"])
        run("git", "-C", ROOT, "checkout", "--detach", LOCK["runtimeRevision"])
    if not PYTHON.is_file():
        run("uv", "venv", "--managed-python", "--python", LOCK["python"], MLX / ".venv")
    actual_python = subprocess.check_output(
        [str(PYTHON), "-c", "import platform; print(platform.python_version())"], text=True,
    ).strip()
    if actual_python != LOCK["python"]:
        raise SystemExit(f"Expected Python {LOCK['python']}; move {MLX / '.venv'} aside and rerun.")
    run("uv", "pip", "sync", "--python", PYTHON, "--require-hashes",
        "--only-binary", ":all:", GAME / "tools/sfx-requirements.txt")
    for name, spec in LOCK["files"].items():
        download(name, spec)
    check(checksum=False)
    print(f"Installed at {ROOT}\nUsage: npm run sfx:generate -- --config path/to/sound.json")


def request(path):
    config = json.loads(path.read_text())
    if not isinstance(config, dict):
        raise ValueError("The config must be a JSON object.")
    allowed = {"prompt", "seconds", "seed", "steps", "cfg", "negative_prompt"}
    if set(config) - allowed:
        raise ValueError(f"Unknown config keys: {', '.join(sorted(set(config) - allowed))}")
    if not isinstance(config.get("prompt"), str) or not config["prompt"].strip():
        raise ValueError("Provide a nonempty prompt in the config.")
    result = {"seconds": 2, "seed": 70931, "steps": 8, "cfg": 1, **config}
    for name, low, high in (("seconds", 0.5, 30), ("seed", 0, 2**31 - 1),
                            ("steps", 1, 64), ("cfg", 1, 5)):
        value = result[name]
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{name} must be between {low} and {high}.")
        if name in ("seed", "steps") and type(value) is not int:
            raise ValueError(f"{name} must be an integer.")
    if "negative_prompt" in result:
        if not isinstance(result["negative_prompt"], str) or result["cfg"] == 1:
            raise ValueError("negative_prompt requires a string and cfg greater than 1.")
    return result


def validate_wav(path, seconds):
    with wave.open(str(path), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (2, 2, 44100):
            raise ValueError("Expected stereo 44.1 kHz, 16-bit PCM.")
        frames = wav.getnframes()
        if abs(frames - round(seconds * 44100)) > 1:
            raise ValueError("Unexpected generated duration.")
        raw = wav.readframes(frames)
    if len(raw) != frames * 4:
        raise ValueError("Truncated WAV.")
    samples = array("h", raw)
    if sys.byteorder != "little":
        samples.byteswap()
    peak = max(abs(value) for value in samples)
    if peak < 32:
        raise ValueError("Generated audio is effectively silent; existing output preserved.")
    clipped = sum(abs(value) >= 32767 for value in samples) / len(samples)
    if clipped > 0.005:
        raise ValueError("Generated audio has excessive clipping; existing output preserved.")
    print(f"Validated {seconds:g}s stereo WAV; peak {20 * math.log10(peak / 32768):.1f} dBFS.")


def generate(args):
    if args.check:
        check()
        return
    if not args.config:
        raise ValueError("Provide --config path/to/sound.json; see docs/audio/sfx.md.")
    config_path = args.config.expanduser().resolve()
    config = request(config_path)
    output = (args.output or config_path.with_suffix(".wav")).expanduser().resolve()
    if output.suffix.lower() != ".wav":
        raise ValueError("Output must be a .wav file.")
    check(checksum=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    # Generate beside the destination, then replace only a validated, complete WAV.
    with TemporaryDirectory(prefix=".sfx-", dir=output.parent) as temporary:
        rendered = Path(temporary) / "render.wav"
        command = [
            PYTHON, MLX / "scripts/sa3_mlx.py", "--dit", "sm-sfx",
            "--decoder", "same-s", "--free-models", "--prompt", config["prompt"],
            "--seconds", config["seconds"], "--seed", config["seed"],
            "--steps", config["steps"], "--cfg", config["cfg"], "--out", rendered,
        ]
        if config.get("negative_prompt"):
            command.extend(["--negative-prompt", config["negative_prompt"]])
        run(*command, cwd=MLX)
        validate_wav(rendered, config["seconds"])
        rendered.replace(output)
    print(f"Saved {output}\nRender and validation: {time.monotonic() - started:.1f}s.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("setup", help="Install the pinned Small-SFX MLX runtime and weights")
    generation = commands.add_parser("generate", help="Render one current sound from its JSON config")
    generation.add_argument("--config", type=Path, help="Current prompt and generation settings")
    generation.add_argument("--output", type=Path, help="WAV destination (default: beside config)")
    generation.add_argument("--check", action="store_true", help="Check install without rendering")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This setup supports native Apple Silicon macOS only.")
    with exclusive():
        setup() if args.command == "setup" else generate(args)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, wave.Error, subprocess.CalledProcessError) as error:
        raise SystemExit(f"SFX: {error}") from error
