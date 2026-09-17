#!/usr/bin/env python3
"""Bake or re-export the detailed right-facing Kaida run. Never opens the editor."""
import argparse
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
PREP = SOURCE.parents[1]
PARTS = PREP / 'sources/kaida-parts/right'
BLOCKING = PREP / 'sources/kaida-run-v3/blocking'
sys.path[:0] = [str(PREP / 'tools'), str(BLOCKING)]
from aseprite import digest, executable, run
from sprites import export, inspect, validate_source
from motion import verify


def script(path, **params):
    args = [executable(), '--batch']
    for key, value in params.items():
        args += ['--script-param', f'{key}={value}']
    run(args + ['--script', path])


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def verify_art_poses(poses, motion, design):
    assert len(poses['frames']) == len(motion['frames'])
    for art, guide in zip(poses['frames'], motion['frames']):
        assert art['grip'] == guide['weapon']['hand']
        assert art['hand_angle'] == guide['arms']['right']['hand_angle']
        for side in ('left', 'right'):
            joints = art['legs'][side]
            fabric = art['hip_fabric'][side]
            assert math.dist(fabric['root'], joints[0]) < 1e-6
            fabric_vector = [b-a for a, b in zip(fabric['root'], fabric['seam'])]
            thigh_vector = [b-a for a, b in zip(joints[0], joints[1])]
            alignment = sum(a*b for a, b in zip(fabric_vector, thigh_vector)) / (math.hypot(*fabric_vector)*math.hypot(*thigh_vector))
            assert alignment > .998, 'Painted hip fabric stays in the wrong stride'
            assert joints[0] == guide['hips'][side], 'Art changed hip position'
            assert joints[2][0] == guide['legs'][side]['joints'][2][0], 'Art changed stance travel'
            for a, b, length in zip(joints, joints[1:], design['leg_lengths']):
                assert abs(math.dist(a, b) - length) < 1e-6, 'Detailed limb changes length'
            assert art['foot_bottom'][side] == math.floor(guide['contacts'][side]['lowest_y'] + .5)
    right_leads, left_leads = poses['frames'][0]['hip_fabric']['right'], poses['frames'][8]['hip_fabric']['right']
    assert right_leads['seam'][0] - right_leads['root'][0] > 10
    assert left_leads['seam'][0] - left_leads['root'][0] < -5, 'Near hip fabric still points forward with the near leg back'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--rebuild', action='store_true', help='replace timeline from saved shared parts and motion; discards cel edits')
    group.add_argument('--review-only', action='store_true', help='export the saved timeline, preserving all cel edits')
    args = parser.parse_args()
    source = SOURCE / 'animation.aseprite'
    if source.exists() and not (args.rebuild or args.review_only):
        parser.error('Existing source: use --review-only or deliberately --rebuild.')
    if not (PARTS / 'parts.aseprite').exists():
        parser.error('Build the shared parts first: python3 _prep/sources/kaida-parts/right/build.py')
    design, motion = read(BLOCKING / 'design.json'), read(BLOCKING / 'poses.json')
    inputs = [PARTS / 'parts.aseprite', PARTS / 'parts.json', BLOCKING / 'design.json',
              BLOCKING / 'poses.json', SOURCE / 'render.lua', SOURCE / 'review.lua',
              SOURCE / 'verify.lua', PREP / 'lua/pixel/raster.lua']
    input_hashes = {str(p.relative_to(PREP)): digest(p) for p in inputs}
    previous = read(SOURCE / 'validation.json') if args.review_only and (SOURCE / 'validation.json').exists() else {}
    checks = verify(design, motion)
    (PREP / '.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-r1-', dir=PREP / '.work') as tmp:
        work = Path(tmp)
        candidate, pose_file = work / 'animation.aseprite', work / 'art-poses.json'
        if args.review_only:
            shutil.copyfile(source, candidate)
            shutil.copyfile(SOURCE / 'art-poses.json', pose_file)
        else:
            script(SOURCE / 'render.lua', output=work, parts=PARTS / 'parts.json',
                   master=PARTS / 'parts.aseprite', poses=BLOCKING / 'poses.json',
                   design=BLOCKING / 'design.json', raster=PREP / 'lua/pixel/raster.lua')
        art = read(pose_file)
        verify_art_poses(art, motion, design)
        metadata = inspect(candidate)
        origin = validate_source(metadata)
        assert [origin['x'], origin['y']] == design['origin']
        assert [metadata['width'], metadata['height']] == design['canvas']
        assert metadata['frames'] == 16
        assert [l['name'] for l in metadata['layers']] == [p['name'] for p in read(PARTS / 'parts.json')['parts']]
        assert all(l['cels'] == 16 for l in metadata['layers'])
        assert [t['name'] for t in metadata['tags']] == ['run.right']
        script(SOURCE / 'verify.lua', source=candidate, poses=pose_file,
               motion=BLOCKING / 'poses.json', output=work / 'pixel-check.json')
        script(SOURCE / 'review.lua', source=candidate, output=work)
        assert b'NETSCAPE2.0\x03\x01\x00\x00\x00' in (work / 'running.gif').read_bytes(), 'GIF does not loop'
        export(candidate, work / 'atlas')
        pixels, preview = read(work / 'pixel-check.json'), read(work / 'review.json')
        assert input_hashes == {str(p.relative_to(PREP)): digest(p) for p in inputs}, 'Inputs changed during build; rerun from saved files'
        checks.update({
            'revision': 'r1', 'status': 'hip attachment correction; awaiting user visual review',
            'alpha_approved': False, 'runtime_integrated': False,
            'canvas': design['canvas'], 'origin': design['origin'], 'layers': len(metadata['layers']),
            'source_sha256': digest(candidate), 'gif_sha256': digest(work / 'running.gif'),
            'inputs': previous.get('inputs', input_hashes) if args.review_only else input_hashes,
            'checked_with_inputs': input_hashes,
            'saved_source_matches_last_build': digest(candidate) == previous.get('source_sha256') if args.review_only else True,
            'saved_cels_checked': len(pixels['cel_components']),
            'joint_overlap_checks': pixels['overlap_checks'],
            'all_parts_and_composites_connected': True, 'no_clipping': True,
            'actual_boot_contacts_checked': len(pixels['foot_bottoms']),
            'hip_fabric_tracks_thighs': True, 'hip_fabric_pixel_checks': pixels['hip_fabric_checks'],
            'visible_near_hip_extremes_checked': pixels['visible_hip_extremes'],
            'sampling_specks_removed': sum(sum(f['sampling_specks_removed'].values()) for f in art['frames']),
            'gif_loops': True, 'preview': preview,
        })
        if not args.review_only:
            candidate.replace(source)
            write(SOURCE / 'art-poses.json', art)
            write(SOURCE / 'validation.json', checks)
        write(work / 'validation.json', checks)
        receipt = read(work / 'atlas/receipt.json')
        receipt['source'] = str(source.relative_to(PREP))
        write(work / 'atlas/receipt.json', receipt)
        output = PREP / 'exports/kaida-run-r1'
        output.mkdir(parents=True, exist_ok=True)
        for p in work.iterdir():
            if p.suffix in ('.gif', '.png') or p.name in ('validation.json', 'pixel-check.json', 'review.json'):
                p.replace(output / p.name)
        for p in (work / 'atlas').iterdir():
            p.replace(output / p.name)
        print('PASS: detailed run.right r1;', output / 'running.gif')


if __name__ == '__main__':
    main()
