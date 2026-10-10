"""Install the pinned Apple Silicon music runtime and its small Q8 model set."""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME / ".audio-model" / "acestep.cpp"
LOCK = json.loads((GAME / "tools/audio-models.json").read_text())


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def verified(path, spec):
    if not path.is_file() or path.stat().st_size != spec["bytes"]:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == spec["sha256"]


def install_model(name, spec, models_from):
    target = ROOT / "models" / name
    if verified(target, spec):
        print(f"Verified {name}", flush=True)
        return
    partial = target.with_name(name + ".part")
    if models_from and verified(models_from / name, spec):
        print(f"Reusing {name}", flush=True)
        shutil.copyfile(models_from / name, partial)
    if not verified(partial, spec):
        if partial.exists() and partial.stat().st_size >= spec["bytes"]:
            partial.unlink()
        url = f"https://huggingface.co/{LOCK['modelRepo']}/resolve/{LOCK['modelRevision']}/{name}"
        print(f"Downloading {name} (resumes if interrupted)", flush=True)
        command = ("curl", "--fail", "--location", "--show-error", "--progress-bar",
                   "--retry", "3", "--connect-timeout", "30", "--continue-at", "-",
                   "--output", partial, url)
        try:
            run(*command)
        except subprocess.CalledProcessError as error:
            if error.returncode != 33:  # Server does not support range requests.
                raise
            partial.unlink(missing_ok=True)
            run(*command)
    if not verified(partial, spec):
        partial.unlink(missing_ok=True)
        raise SystemExit(f"Checksum mismatch for {name}; rerun setup to download it again.")
    partial.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models-from", type=Path,
                        help="Reuse verified files from an existing models directory")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        parser.error("This setup currently supports native Apple Silicon macOS only.")
    missing = [tool for tool in ("git", "cmake", "curl", "clang++") if not shutil.which(tool)]
    if missing:
        parser.error(f"Missing {', '.join(missing)}. Install Xcode command-line tools and CMake; see docs/audio/README.md.")
    sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
    # Some command-line tool installs omit libc++ from clang's default search.
    probe = subprocess.run(["clang++", "-isysroot", sdk, "-x", "c++", "-fsyntax-only", "-"],
                           input="#include <array>\n", text=True, capture_output=True)
    cpp_flags = []
    if probe.returncode:
        headers = Path(sdk) / "usr/include/c++/v1"
        if not (headers / "array").is_file():
            parser.error("The macOS SDK is missing C++ headers; repair the Xcode command-line tools.")
        cpp_flags.append(f'-DCMAKE_CXX_FLAGS=-isystem "{headers}"')
    if args.models_from:
        args.models_from = args.models_from.expanduser().resolve()
        if not args.models_from.is_dir():
            parser.error("--models-from must name an existing models directory")
    ROOT.mkdir(parents=True, exist_ok=True)
    if not (ROOT / ".git").exists():
        if any(ROOT.iterdir()):
            parser.error(f"Refusing to initialize over a nonempty directory: {ROOT}")
        run("git", "init", ROOT)
        run("git", "-C", ROOT, "remote", "add", "origin", LOCK["runtimeRepo"])
    head = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", "HEAD"],
                          capture_output=True, text=True)
    if head.returncode == 0 and head.stdout.strip() != LOCK["runtimeRevision"]:
        parser.error(f"Runtime revision differs from the pin. Move {ROOT} aside and rerun setup.")
    if head.returncode != 0:
        run("git", "-C", ROOT, "fetch", "--depth", "1", "origin", LOCK["runtimeRevision"])
        run("git", "-C", ROOT, "checkout", "--detach", LOCK["runtimeRevision"])
    run("git", "-C", ROOT, "submodule", "update", "--init", "--recursive", "--depth", "1")
    run("cmake", "-S", ROOT, "-B", ROOT / "build", "-DCMAKE_BUILD_TYPE=Release",
        f"-DCMAKE_OSX_SYSROOT={sdk}", *cpp_flags,
        "-DGGML_METAL=ON", "-DGGML_METAL_EMBED_LIBRARY=ON",
        "-DGGML_BLAS=ON", "-DGGML_BLAS_VENDOR=Apple",
        "-DGGML_CUDA=OFF", "-DGGML_VULKAN=OFF")
    run("cmake", "--build", ROOT / "build", "--target", "ace-lm", "ace-synth", "--parallel", "2")
    (ROOT / "models").mkdir(exist_ok=True)
    for name, spec in LOCK["files"].items():
        install_model(name, spec, args.models_from)
    print(f"Ready: {ROOT}\nGenerate with npm run audio:generate (see docs/audio/README.md).", flush=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"Setup stopped (exit {error.returncode}); fix the error above and rerun.") from error
