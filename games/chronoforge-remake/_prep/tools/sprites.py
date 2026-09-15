#!/usr/bin/env python3
"""Create, rig, inspect and export sprites with the local Aseprite executable."""
import argparse
import json
import math
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile

from aseprite import PREP, digest, executable, run


def lua(script, **params):
    args = [executable(), '--batch']
    for key, value in params.items():
        args += ['--script-param', f'{key}={value}']
    run(args + ['--script', PREP / 'lua' / script])


def asset_dir(name):
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]*', name):
        raise ValueError('Asset id must start with a lowercase letter/digit and use a-z, 0-9, ., _, -.')
    return PREP / 'sources' / name


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def fresh(path, force=False):
    if path.exists() and not force:
        raise ValueError(f'Already exists: {path}. Use --force only to replace a disposable bake.')
    path.parent.mkdir(parents=True, exist_ok=True)


def validate_rig(rig):
    def pair(value):
        return isinstance(value, list) and len(value) == 2 and all(type(n) is int for n in value)
    if rig.get('schema') != 1:
        raise ValueError('Expected rig schema 1')
    canvas = rig.get('canvas', {})
    if any(type(canvas.get(k)) is not int or not 1 <= canvas[k] <= 1024 for k in ('width', 'height')):
        raise ValueError('Rig canvas must contain integer width/height from 1 to 1024')
    if not pair(rig.get('origin')) or not (0 <= rig['origin'][0] < canvas['width'] and 0 <= rig['origin'][1] < canvas['height']):
        raise ValueError('Origin must be an integer pixel coordinate inside the canvas')
    names = set()
    for part in rig.get('parts', []):
        name = part.get('layer')
        if not isinstance(name, str) or not name or name in names or not pair(part.get('pivot')):
            raise ValueError('Each rig part needs a unique layer name and integer pivot')
        if part.get('parent') is not None and part['parent'] not in names:
            raise ValueError('Parents must precede children; missing/cyclic parent for ' + name)
        names.add(name)
    if not names or not rig.get('clips'):
        raise ValueError('Rig needs parts and clips')
    tags = set()
    for clip in rig['clips']:
        name = clip.get('name')
        if not isinstance(name, str) or not name or name in tags or not clip.get('frames'):
            raise ValueError('Each clip needs a unique name and at least one frame')
        tags.add(name)
        for frame in clip['frames']:
            duration = frame.get('duration_ms')
            if type(duration) is not int or not 1 <= duration <= 65535:
                raise ValueError('Frame duration_ms must be an integer from 1 to 65535')
            for part, transform in frame.get('parts', {}).items():
                if part not in names:
                    raise ValueError('Unknown keyed part: ' + part)
                for key, value in transform.items():
                    if key not in ('x', 'y', 'angle') or type(value) not in (int, float) or not math.isfinite(value):
                        raise ValueError('Transforms accept finite x, y, angle values only')
                    if key in ('x', 'y') and int(value) != value:
                        raise ValueError('Translations must use integer pixels')
    return rig


def inspect(source):
    (PREP / '.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=PREP / '.work', prefix='inspect-') as tmp:
        report = Path(tmp) / 'report.json'
        lua('inspect.lua', source=source.resolve(), output=report)
        return json.loads(report.read_text())


def validate_source(report):
    if report['emptyFrames']:
        raise ValueError('Empty animation frames: ' + str(report['emptyFrames']))
    if not report['tags']:
        raise ValueError('Animation needs named tags')
    origins = [s for s in report['slices'] if s['name'] == 'origin']
    if len(origins) != 1 or not origins[0].get('pivot'):
        raise ValueError('Exactly one origin slice with a feet pivot is required')
    pivot = origins[0]['pivot']
    if not (0 <= pivot['x'] < report['width'] and 0 <= pivot['y'] < report['height']):
        raise ValueError('Origin pivot is outside the canvas')
    covered = []
    for tag in report['tags']:
        covered += list(range(tag['from'], tag['to'] + 1))
    if sorted(covered) != list(range(1, report['frames'] + 1)):
        raise ValueError('Tags must cover each frame exactly once')
    return pivot


def bake(source, rig_path, destination, force=False):
    if source.resolve() == destination.resolve():
        raise ValueError('Bake output must differ from the bind source')
    fresh(destination, force)
    rig = validate_rig(json.loads(rig_path.read_text()))
    # Save to a temporary sibling first so a failed script never destroys an edited timeline.
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.bake-') as tmp:
        result = Path(tmp) / 'animation.aseprite'
        lua('bake_rig.lua', source=source.resolve(), rig=rig_path.resolve(), output=result)
        report = inspect(result)
        origin = validate_source(report)
        if [origin['x'], origin['y']] != rig['origin']:
            raise ValueError('Source origin slice differs from the rig origin')
        if report['frames'] != sum(len(c['frames']) for c in rig['clips']):
            raise ValueError('Baked frame count differs from rig')
        result.replace(destination)
    print('Baked editable timeline: ' + str(destination))


def validate_export(data, png, report):
    header = png.read_bytes()[:24]
    if header[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Export is not a PNG')
    size = struct.unpack('>II', header[16:24])
    if size != (data['meta']['size']['w'], data['meta']['size']['h']):
        raise ValueError('PNG and metadata dimensions disagree')
    frames = data['frames']
    if len(frames) != report['frames']:
        raise ValueError('Export dropped animation frames')
    for frame in frames:
        rect = frame['frame']
        if frame['trimmed'] or frame['rotated'] or (rect['w'], rect['h']) != (report['width'], report['height']):
            raise ValueError('Export changed frame registration')
        if rect['x'] < 0 or rect['y'] < 0 or rect['x'] + rect['w'] > size[0] or rect['y'] + rect['h'] > size[1]:
            raise ValueError('Frame is outside exported sheet')
        if frame['duration'] <= 0:
            raise ValueError('Invalid exported duration')
    if len(data['meta'].get('frameTags', [])) != len(report['tags']):
        raise ValueError('Export lost animation tags')
    origins = [s for s in data['meta'].get('slices', []) if s['name'] == 'origin']
    if len(origins) != 1 or not origins[0].get('keys'):
        raise ValueError('Export lost feet pivot')
    expected_pivot = validate_source(report)
    expected_bounds = {'x': 0, 'y': 0, 'w': report['width'], 'h': report['height']}
    for key in origins[0]['keys']:
        if key.get('pivot') != expected_pivot or key.get('bounds') != expected_bounds:
            raise ValueError('Origin must stay fixed on a full-canvas slice across all frames')


def export(source, destination):
    report = inspect(source)
    origin = validate_source(report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.export-') as tmp:
        staging = Path(tmp)
        sheet, metadata = staging / 'sheet.png', staging / 'sheet.json'
        run([executable(), '--batch', '--list-tags', '--list-layers', '--list-slices', source,
             '--sheet-type', 'rows', '--sheet-columns', '8', '--filename-format', '{frame}',
             '--format', 'json-array', '--sheet', sheet, '--data', metadata])
        data = json.loads(metadata.read_text())
        validate_export(data, sheet, report)
        data['meta']['image'] = 'sheet.png'
        write_json(metadata, data)
        write_json(staging / 'receipt.json', {'source': source.resolve().relative_to(PREP).as_posix(),
                   'source_sha256': digest(source), 'sheet_sha256': digest(sheet),
                   'canvas': {'width': report['width'], 'height': report['height']},
                   'frames': report['frames'], 'origin': origin, 'tags': report['tags'],
                   'status': 'draft; runtime integration requires explicit mapping'})
        destination.mkdir(exist_ok=True)
        for name in ('sheet.png', 'sheet.json', 'receipt.json'):
            (staging / name).replace(destination / name)
    print('Exported validated draft: ' + str(destination))


def smoke():
    root = PREP / '.work' / 'smoke'
    root.mkdir(parents=True, exist_ok=True)
    (root / 'passed.json').unlink(missing_ok=True)
    source, animation = root / 'master.aseprite', root / 'animation.aseprite'
    source.unlink(missing_ok=True)
    lua('new_sprite.lua', output=source, fixture='true')
    rig = PREP / 'templates/humanoid.rig.json'
    bake(source, rig, animation, force=True)
    export(animation, root / 'export')
    report = inspect(animation)
    if report['frames'] != 8 or len(report['layers']) != 8:
        raise ValueError('Smoke fixture did not retain its eight layers/frames')
    if any(layer['cels'] != 8 for layer in report['layers'] if layer['name'] != 'fx'):
        raise ValueError('Rig failed to bake all part cels')
    proof = root / 'rig-assertions.txt'
    proof.unlink(missing_ok=True)
    lua('verify_smoke.lua', source=animation, output=proof)
    if proof.read_text() != 'passed':
        raise ValueError('Rig pixel assertions failed')
    # A second export must reproduce both bytes and metadata after save/reopen.
    export(animation, root / 'repeat')
    for name in ('sheet.png', 'sheet.json'):
        if (root / 'export' / name).read_bytes() != (root / 'repeat' / name).read_bytes():
            raise ValueError('Repeated exports differ: ' + name)
    write_json(root / 'passed.json', {'result': 'passed', 'frames': 8, 'layers': 8,
               'checks': ['Lua', 'layered source', 'parented rig', 'tags', 'durations', 'feet pivot',
                          'planted feet', 'weapon parenting', 'PNG/JSON export', 'save/reopen', 'repeatable exports']})
    print('PASS: local Aseprite author → rig → save/reopen → export (8 frames, 8 layers).')
    print('Fixture to open: ' + str(animation))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('new', help='create an empty layered bind source and example rig')
    p.add_argument('asset')
    p = commands.add_parser('bake', help='bake master.aseprite + rig.json to editable animation.aseprite')
    p.add_argument('asset')
    p.add_argument('--force', action='store_true', help='replace the existing animation; loses manual timeline edits')
    p = commands.add_parser('export', help='validate animation and export draft PNG/JSON with fixed cells')
    p.add_argument('asset')
    p = commands.add_parser('inspect', help='inspect an Aseprite document')
    p.add_argument('source', type=Path)
    commands.add_parser('smoke', help='exercise the complete workflow using a local diagnostic fixture')
    args = parser.parse_args()
    if args.command == 'smoke':
        smoke()
    elif args.command == 'inspect':
        print(json.dumps(inspect(args.source), indent=2))
    else:
        root = asset_dir(args.asset)
        if args.command == 'new':
            source = root / 'master.aseprite'
            if root.exists():
                raise ValueError('Asset folder already exists: ' + str(root))
            fresh(source)
            lua('new_sprite.lua', output=source)
            if not source.exists():
                raise ValueError('Aseprite failed to create source')
            shutil.copyfile(PREP / 'templates/humanoid.rig.json', root / 'rig.json')
            print('Created ' + str(source) + '; draw the bind pose, then adjust rig.json pivots/keyframes.')
        elif args.command == 'bake':
            bake(root / 'master.aseprite', root / 'rig.json', root / 'animation.aseprite', args.force)
        elif args.command == 'export':
            export(root / 'animation.aseprite', PREP / 'exports' / args.asset)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f'Sprites: {error}', file=sys.stderr)
        sys.exit(1)
