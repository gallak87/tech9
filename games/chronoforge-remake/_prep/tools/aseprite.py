#!/usr/bin/env python3
"""Pinned, project-local Aseprite build and launcher; Python 3.9+, no pip deps."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import zipfile

PREP = Path(__file__).resolve().parents[1]
LOCAL = PREP / '.local'
LOCK = json.loads((PREP / 'aseprite.lock.json').read_text())


def child_env():
    profile = LOCAL / 'profile'
    profile.mkdir(parents=True, exist_ok=True)
    return {**os.environ, 'ASEPRITE_USER_FOLDER': str(profile)}


def run(args, **kwargs):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    kwargs.setdefault('env', child_env())
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def output(args):
    return subprocess.check_output(list(map(str, args)), text=True, env=child_env()).strip()


def host_key(system=None, machine=None):
    system = system or platform.system()
    machine = (machine or platform.machine()).lower()
    machine = {'amd64': 'x86_64', 'aarch64': 'arm64'}.get(machine, machine)
    key = f'{system}-{machine}'
    if key not in LOCK['skia']['assets']:
        raise RuntimeError(f'Unsupported host {key}. Supported: ' + ', '.join(LOCK['skia']['assets']))
    return key


def paths():
    key = host_key()
    source = LOCAL / ('aseprite-' + LOCK['source']['tag'])
    build = LOCAL / ('build-' + LOCK['source']['tag'] + '-' + key)
    skia = LOCAL / ('skia-' + LOCK['skia']['tag'] + '-' + key)
    binary = build / 'bin' / ('aseprite.exe' if key.startswith('Windows') else 'aseprite')
    return key, source, build, skia, binary


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def prerequisites(key):
    required = ['git', 'curl', 'cmake', 'ninja']
    if key.startswith('Darwin'):
        required += ['xcrun', 'clang', 'clang++']
    elif key.startswith('Linux'):
        required += ['clang', 'clang++', 'pkg-config']
    else:
        required += ['cl']
    missing = [name for name in required if not shutil.which(name)]
    if missing:
        raise RuntimeError('Missing tools: ' + ', '.join(missing) + '. See _prep/README.md prerequisites.')
    if key.startswith('Darwin'):
        output(['xcrun', '--sdk', 'macosx', '--show-sdk-path'])
    elif key.startswith('Linux'):
        run(['pkg-config', '--exists', 'x11', 'xcursor', 'xi', 'xrandr', 'gl', 'fontconfig'])
    elif os.environ.get('VSCMD_ARG_TGT_ARCH') != 'x64':
        raise RuntimeError('Run from the VS 2022 x64 Native Tools Command Prompt (see README).')


@contextlib.contextmanager
def setup_lock():
    LOCAL.mkdir(parents=True, exist_ok=True)
    path = LOCAL / 'setup.lock'
    try:
        stream = path.open('x')
    except FileExistsError:
        raise RuntimeError(f'Setup already running, or interrupted: {path}. '
                           'If that process has exited, remove this lock and rerun.') from None
    try:
        with stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def prepare_source(source):
    if not source.exists():
        run(['git', 'clone', '--branch', LOCK['source']['tag'], '--depth', '1',
             LOCK['source']['url'], source])
    if not (source / '.git').exists():
        raise RuntimeError(f'Incomplete source directory: {source}. Move it aside and rerun setup.')
    actual = output(['git', '-C', source, 'rev-parse', 'HEAD'])
    if actual != LOCK['source']['commit']:
        raise RuntimeError(f'Source revision mismatch: {actual}. Move {source} aside; setup will clone the pin.')
    if output(['git', '-C', source, 'status', '--porcelain', '--untracked-files=no', '--ignore-submodules=all']):
        raise RuntimeError(f'Local source edits found in {source}; preserve them before rebuilding.')
    run(['git', '-C', source, 'submodule', 'update', '--init', '--recursive', '--depth', '1'])
    if output(['git', '-C', source, 'status', '--porcelain', '--untracked-files=no']):
        raise RuntimeError('Local submodule edits found; preserve them before rebuilding.')
    status = output(['git', '-C', source, 'submodule', 'status', '--recursive'])
    if any(line.startswith(('-', '+', 'U')) for line in status.splitlines()):
        raise RuntimeError('Submodule revisions differ from the pinned source.')
    if (source / 'laf/misc/skia-tag.txt').read_text().strip() != LOCK['skia']['tag']:
        raise RuntimeError('Skia lock does not match this Aseprite source.')


def extract_zip(archive, destination):
    with zipfile.ZipFile(archive) as zf:
        root = destination.resolve()
        for member in zf.infolist():
            target = (root / member.filename).resolve()
            if not target.is_relative_to(root):
                raise RuntimeError('Unsafe path in Skia archive: ' + member.filename)
        zf.extractall(destination)


def prepare_skia(key, skia):
    asset = LOCK['skia']['assets'][key]
    archive = LOCAL / 'downloads' / asset['file']
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        part = archive.with_suffix('.zip.part')
        run(['curl', '--fail', '--location', '--retry', '3', '--connect-timeout', '30',
             '--output', part, LOCK['skia']['base_url'] + asset['file']])
        if digest(part) != asset['sha256']:
            part.unlink()
            raise RuntimeError('Downloaded Skia checksum mismatch; rerun to retry.')
        part.replace(archive)
    if digest(archive) != asset['sha256']:
        raise RuntimeError(f'Skia checksum mismatch: {archive}. Remove that archive and rerun.')
    marker = skia / '.verified-sha256'
    libdir = skia / 'out' / ('Release-' + asset['arch'])
    library = libdir / ('skia.lib' if key.startswith('Windows') else 'libskia.a')
    if not marker.exists() or marker.read_text() != asset['sha256'] or not library.exists():
        staging = skia.with_name(skia.name + '.extracting')
        if staging.exists():
            shutil.rmtree(staging)
        extract_zip(archive, staging)
        if skia.exists():
            shutil.rmtree(skia)
        staging.replace(skia)
        marker.write_text(asset['sha256'])
    if not library.exists():
        raise RuntimeError(f'Skia library missing after extraction: {library}')
    return libdir, library


def cmake_args(key, source, build, skia, libdir, library):
    args = ['cmake', '-S', source, '-B', build, '-G', 'Ninja',
            '-DCMAKE_BUILD_TYPE=RelWithDebInfo', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
            '-DLAF_BACKEND=skia', f'-DSKIA_DIR={skia}', f'-DSKIA_LIBRARY_DIR={libdir}',
            f'-DSKIA_LIBRARY={library}', '-DENABLE_SCRIPTING=ON',
            '-DENABLE_NEWS=OFF', '-DENABLE_UPDATER=OFF', '-DENABLE_CCACHE=OFF']
    if key.startswith('Darwin'):
        arch = key.split('-', 1)[1]
        sdk = output(['xcrun', '--sdk', 'macosx', '--show-sdk-path'])
        compiler = output(['xcrun', '--find', 'clang++'])
        probe = [compiler, '-isysroot', sdk, '-std=c++17', '-x', 'c++', '-fsyntax-only', '-']
        code = '#include <sstream>\nint main() { std::stringstream s; }\n'
        result = subprocess.run(probe, input=code, text=True, capture_output=True)
        flags = ''
        if result.returncode:
            headers = Path(sdk) / 'usr/include/c++/v1'
            fallback = subprocess.run(probe[:-1] + ['-isystem', str(headers), '-'],
                                      input=code, text=True, capture_output=True)
            if fallback.returncode:
                raise RuntimeError('Apple C++ compiler probe failed. Repair/install Command Line Tools.\n' + fallback.stderr)
            print('Using SDK libc++ headers (compiler default include path is incomplete).', flush=True)
            flags = f'-isystem "{headers}"'
        args += [f'-DCMAKE_OSX_ARCHITECTURES={arch}',
                 '-DCMAKE_OSX_SYSROOT=' + sdk,
                 '-DCMAKE_OSX_DEPLOYMENT_TARGET=' + ('11.0' if arch == 'arm64' else '10.14'),
                 '-DCMAKE_C_COMPILER=' + output(['xcrun', '--find', 'clang']),
                 '-DCMAKE_CXX_COMPILER=' + compiler,
                 '-DCMAKE_CXX_FLAGS=' + flags, '-DCMAKE_OBJCXX_FLAGS=' + flags]
        if arch == 'arm64':
            args += ['-DPNG_ARM_NEON=on']
    elif key.startswith('Linux'):
        args += ['-DCMAKE_C_COMPILER=clang', '-DCMAKE_CXX_COMPILER=clang++',
                 '-DCMAKE_CXX_FLAGS=-stdlib=libstdc++', '-DCMAKE_EXE_LINKER_FLAGS=-stdlib=libstdc++']
    return args


def setup(jobs):
    key, source, build, skia, binary = paths()
    prerequisites(key)
    with setup_lock():
        prepare_source(source)
        libdir, library = prepare_skia(key, skia)
        run(cmake_args(key, source, build, skia, libdir, library))
        run(['cmake', '--build', build, '--target', 'aseprite', '--parallel', str(jobs)])
        version = output([binary, '--version'])
        receipt = {'host': key, 'source_commit': LOCK['source']['commit'],
                   'skia_sha256': LOCK['skia']['assets'][key]['sha256'], 'version': version,
                   'binary': str(binary.relative_to(PREP)), 'cmake': output(['cmake', '--version']).splitlines()[0]}
        (LOCAL / 'build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'Built {version}. Next: python3 _prep/tools/sprites.py smoke', flush=True)


def executable():
    binary = paths()[-1]
    if not binary.exists():
        raise RuntimeError('Aseprite is not built for this host. Run: python3 _prep/tools/aseprite.py setup')
    return binary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    command = commands.add_parser('setup', help='fetch pinned sources, verify Skia, and build locally')
    command.add_argument('--jobs', type=int, default=min(8, os.cpu_count() or 2))
    commands.add_parser('doctor', help='check prerequisites and local build')
    commands.add_parser('path', help='print this host\'s executable path')
    command = commands.add_parser('run', help='forward arguments to Aseprite (use -- before flags)')
    command.add_argument('args', nargs=argparse.REMAINDER)
    command = commands.add_parser('open', help='launch the local editor')
    command.add_argument('files', nargs='*')
    args = parser.parse_args()
    if args.command == 'setup':
        if args.jobs < 1:
            parser.error('--jobs must be positive')
        setup(args.jobs)
    elif args.command == 'doctor':
        prerequisites(host_key())
        print('Prerequisites OK for ' + host_key())
        print(output([executable(), '--version']))
    elif args.command == 'path':
        print(executable())
    elif args.command == 'run':
        forwarded = args.args[1:] if args.args[:1] == ['--'] else args.args
        run([executable(), *forwarded])
    elif args.command == 'open':
        binary = executable()
        files = [str(Path(f).resolve()) for f in args.files]
        if platform.system() == 'Darwin':
            run(['open', '-a', binary.parent / 'aseprite.app',
                 '--env', 'ASEPRITE_USER_FOLDER=' + str(LOCAL / 'profile'), *files])
        else:
            subprocess.Popen([str(binary), *files], start_new_session=True, env=child_env())
        print('Opened local Aseprite.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Aseprite: {error}', file=sys.stderr)
        sys.exit(1)
