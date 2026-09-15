#!/usr/bin/env python3
"""Reproduce the Kaida cutout idle using the locally built Aseprite, without UI."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
PREP = SOURCE.parents[1]
GAME = PREP.parent
sys.path.insert(0, str(PREP / 'tools'))
from aseprite import digest, executable, run
from sprites import bake, export


def script(name, **params):
    command = [executable(), '--batch']
    for key, value in params.items():
        command += ['--script-param', f'{key}={value}']
    run(command + ['--script', SOURCE / name])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replace', action='store_true', help='regenerate and replace committed source documents; loses manual edits')
    parser.add_argument('--review-only', action='store_true', help='validate and export the saved documents without rebaking')
    args = parser.parse_args()
    if args.replace and args.review_only:
        parser.error('Choose --replace or --review-only')
    spec = json.loads((SOURCE / 'parts.json').read_text())
    reference = GAME / spec['reference']
    if digest(reference) != spec['sha256']:
        raise ValueError('The approved reference changed; inspect it and update the masks deliberately.')
    master, animation = SOURCE / 'master.aseprite', SOURCE / 'animation.aseprite'
    work = PREP / '.work'
    work.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-poc-', dir=work) as temp:
        staging = Path(temp)
        if not args.review_only:
            if not args.replace and (master.exists() or animation.exists()):
                raise ValueError('Source documents already exist. Use --review-only, or --replace to deliberately rebuild.')
            script('author.lua', root=GAME, output=staging)
            bake(staging / 'master.aseprite', SOURCE / 'rig.json', staging / 'animation.aseprite')
            script('verify.lua', master=staging / 'master.aseprite', animation=staging / 'animation.aseprite', output=staging / 'validation.json')
            result = json.loads((staging / 'validation.json').read_text())
            if result['result'] != 'passed':
                raise ValueError('Rig verification failed')
            shutil.copyfile(staging / 'master.aseprite', master)
            shutil.copyfile(staging / 'animation.aseprite', animation)
        else:
            script('verify.lua', master=master, animation=animation, output=staging / 'validation.json')
            result = json.loads((staging / 'validation.json').read_text())
            if result['result'] != 'passed':
                raise ValueError('Rig verification failed')
        destination = PREP / 'exports' / 'kaida-idle-poc'
        export(animation, destination)
        script('review.lua', source=animation, rig=SOURCE / 'rig.json', output=destination)
        required = ['idle.gif', 'contact-sheet.png', 'standing.png', 'rest-and-inhale.png', 'onion.png', 'rig-guides.png', 'parts.png']
        if any(not (destination / name).is_file() for name in required):
            raise ValueError('Aseprite did not produce all review files')
        result['reference_sha256'] = spec['sha256']
        result['master_sha256'] = digest(master)
        result['animation_sha256'] = digest(animation)
        (destination / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
        print('PASS: Kaida idle proof of concept. Preview: ' + str(destination / 'idle.gif'))


if __name__ == '__main__':
    main()
