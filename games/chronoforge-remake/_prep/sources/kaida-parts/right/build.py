#!/usr/bin/env python3
"""Author or inspect Kaida's shared right-view parts using native Aseprite Lua."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
PREP = SOURCE.parents[2]
sys.path.insert(0, str(PREP / 'tools'))
from aseprite import digest, executable, run
from sprites import inspect


def script(path, **params):
    args = [executable(), '--batch']
    for key, value in params.items():
        args += ['--script-param', f'{key}={value}']
    run(args + ['--script', path])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--rebuild', action='store_true', help='replace the source from traced masks; discards cel edits')
    group.add_argument('--review-only', action='store_true', help='inspect/export the saved parts without modifying them')
    args = parser.parse_args()
    master = SOURCE / 'parts.aseprite'
    if master.exists() and not (args.rebuild or args.review_only):
        parser.error('Existing source: use --review-only or deliberately --rebuild.')
    spec = json.loads((SOURCE / 'parts.json').read_text())
    (PREP / '.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-parts-', dir=PREP / '.work') as tmp:
        work = Path(tmp)
        candidate = work / 'parts.aseprite'
        if args.review_only:
            shutil.copyfile(master, candidate)
        else:
            script(SOURCE / 'author.lua', root=SOURCE, output=work, raster=PREP / 'lua/pixel/raster.lua')
        metadata = inspect(candidate)
        assert metadata['frames'] == 1
        assert [l['name'] for l in metadata['layers']] == [p['name'] for p in spec['parts']]
        assert all(l['cels'] == 1 for l in metadata['layers'])
        assert len(metadata['slices']) == len(spec['parts'])
        script(SOURCE / 'review.lua', source=candidate, output=work, spec=SOURCE / 'parts.json')
        validation = json.loads((work / 'validation.json').read_text())
        validation['source_sha256'] = digest(candidate)
        validation['reference_sha256'] = digest((SOURCE / spec['reference']).resolve())
        (work / 'validation.json').write_text(json.dumps(validation, indent=2) + '\n')
        if not args.review_only:
            candidate.replace(master)
            (work / 'parts-report.json').replace(SOURCE / 'parts-report.json')
        output = PREP / 'exports/kaida-parts/right'
        output.mkdir(parents=True, exist_ok=True)
        for path in work.iterdir():
            if path.suffix == '.png' or path.name == 'validation.json':
                path.replace(output / path.name)
        print('PASS: 20 editable parts; isolated previews in', output)


if __name__ == '__main__':
    main()
