#!/usr/bin/env python3
"""Pinned local Godot import, export and test entry points (Python stdlib)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'game'
CACHE = ROOT / '.tools'
APP = ROOT / 'dist/Chronoforge Dusk.app'
VERSION = '4.6.3.stable.official.7d41c59c4'
TEMPLATE_SHA256 = '700a5759952b2260b7d894dc9bc4908d99ce9abe2964a76c6d2bddd4af4738b2'
URL = 'https://github.com/godotengine/godot-builds/releases/download/4.6.3-stable/Godot_v4.6.3-stable_export_templates.tpz'
USER_DATA = Path.home() / 'Library/Application Support/Godot/app_userdata/Chronoforge Dusk'


def run(args, timeout=180):
    print('+', ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=GAME, check=True, timeout=timeout)


def engine():
    binary = os.environ.get('GODOT_PATH', shutil.which('godot') or '/Applications/Godot.app/Contents/MacOS/Godot')
    actual = subprocess.check_output([binary, '--version'], text=True).strip()
    if actual != VERSION:
        raise SystemExit(f'Expected Godot {VERSION}; found {actual}. Set GODOT_PATH to the pinned editor.')
    return binary


def setup():
    CACHE.mkdir(exist_ok=True)
    template = CACHE / 'macos.zip'
    if not template.exists():
        archive = CACHE / 'Godot_v4.6.3-stable_export_templates.tpz'
        if not archive.exists():
            print('Downloading official matching export templates (~1.2 GB)…', flush=True)
            partial = archive.with_suffix('.download')
            urllib.request.urlretrieve(URL, partial)
            partial.replace(archive)
        with zipfile.ZipFile(archive) as source:
            if source.read('templates/version.txt').decode().strip() != '4.6.3.stable':
                raise SystemExit('Template archive version mismatch')
            template.write_bytes(source.read('templates/macos.zip'))
    if hashlib.sha256(template.read_bytes()).hexdigest() != TEMPLATE_SHA256:
        raise SystemExit('macos.zip checksum mismatch; restore the official pinned archive')
    print('Godot 4.6.3 macOS template verified; retained outside res://')


def build_identity():
    commit = subprocess.check_output(['git', 'rev-parse', '--short=12', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = subprocess.check_output(['git', 'status', '--porcelain', '--', 'game'], cwd=ROOT, text=True).strip()
    # Content digest identifies the actual tested source even before a checkpoint commit.
    digest = hashlib.sha256()
    for source in sorted(GAME.rglob('*')):
        if source.is_file() and '.godot' not in source.parts and source.name != 'build_info.json':
            digest.update(source.relative_to(GAME).as_posix().encode())
            digest.update(source.read_bytes())
    (GAME / 'content/build_info.json').write_text(json.dumps({'revision': commit + ('+dirty' if dirty else ''), 'source_sha256': digest.hexdigest(), 'engine': VERSION}, indent=2) + '\n')


def verify_test_report(path, run_id, source_sha256, native_export):
    """An early app exit must never pass by reusing an older test report."""
    if not path.is_file():
        raise SystemExit(f'Incomplete native test: no report at {path}')
    report = json.loads(path.read_text())
    identity = report.get('identity', {})
    if (identity.get('test_run_id') != run_id
            or identity.get('source_sha256') != source_sha256
            or identity.get('native_export') != native_export
            or identity.get('test_interference', True)
            or not report.get('checks')
            or report.get('failures') != 0
            or not all(check.get('pass') is True for check in report['checks'])):
        raise SystemExit(f'Incomplete, interrupted, mismatched or failed native test: {path}')
    print(f'Fresh report verified: {path.name}, {len(report["checks"])} checks, run {run_id}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['setup', 'import', 'run', 'export', 'test', 'test-editor', 'test-foundation', 'test-foundation-editor', 'test-environment', 'test-environment-editor', 'capture-environment'])
    args = parser.parse_args()
    godot = engine()
    if args.command == 'setup':
        setup()
        return
    if args.command in ('import', 'export', 'capture-environment') or args.command.startswith('test'):
        run([godot, '--headless', '--editor', '--path', GAME, '--import', '--quit'])
        build_identity()
    if args.command == 'run':
        run([godot, '--path', GAME], timeout=None)
    if args.command in ('export', 'test', 'test-foundation', 'test-environment', 'capture-environment'):
        setup()
        APP.parent.mkdir(exist_ok=True)
        run([godot, '--headless', '--path', GAME, '--export-release', 'macOS', APP])
        run(['codesign', '--verify', '--deep', '--strict', APP])
        print('Native application:', APP)
    if args.command.startswith('test') or args.command == 'capture-environment':
        native = not args.command.endswith('-editor')
        binary = APP / 'Contents/MacOS/Chronoforge Dusk' if native else godot
        prefix = [binary] if native else [binary, '--path', GAME]
        run_id = uuid.uuid4().hex
        source_sha256 = json.loads((GAME / 'content/build_info.json').read_text())['source_sha256']
        phases = [('self-test', 'foundation'), ('verify-restart', 'restart')] if 'foundation' in args.command else [('kaida-test', 'kaida'), ('kaida-restart', 'kaida_restart')]
        if 'environment' in args.command:
            phases = [('environment-test', 'environment'), ('environment-restart', 'environment_restart')]
        if args.command == 'capture-environment':
            phases = [('environment-motion', 'environment_motion')]
        for flag, label in phases:
            run([*prefix, '--always-on-top', '--resolution', '1440x810', '--', '--' + flag, '--test-run-id=' + run_id], timeout=300 if 'environment' in args.command else 180)
            verify_test_report(USER_DATA / f'test_{label}.json', run_id, source_sha256, native)


if __name__ == '__main__':
    main()
