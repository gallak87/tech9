#!/usr/bin/env python3
"""Author or re-export the single Kaida run proof through the local Aseprite build."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE = Path(__file__).resolve().parent
PREP = SOURCE.parents[1]
sys.path.insert(0, str(PREP / 'tools'))
from aseprite import digest, executable, run
from sprites import export, inspect, validate_source
from puppet_math import length, sub, rot
from poses import generate


def script(path, **params):
    args = [executable(), '--batch']
    for key, value in params.items():
        args += ['--script-param', f'{key}={value}']
    run(args + ['--script', path])


def write(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def verify_motion(design, poses):
    frames = poses['frames']
    if (poses['clip'], poses['canvas'], poses['origin'], len(frames)) != (
        design['clip'], design['canvas'], design['origin'], design['frames']
    ):
        raise ValueError('Pose metadata differs from the drawing design')
    if len(frames) % 2:
        raise ValueError('This two-legged run needs an even frame count')
    gait = design['gait']
    planted = {side: [] for side in ('near', 'far')}
    for frame in frames:
        if frame['duration_ms'] != design['duration_ms'] or frame['duration_ms'] % 10:
            raise ValueError('Unexpected timing or timing not exactly representable in GIF')
        for side in planted:
            leg = frame['legs'][side]
            chain = leg['joints']
            expected = [gait['upper_leg'], gait['lower_leg']]
            if any(abs(length(sub(b, a)) - bone) > .0001 for a, b, bone in zip(chain, chain[1:], expected)):
                raise ValueError('Leg length changes')
            offset = [2, 3] if side == 'near' else [-4, 1]
            target = rot(offset, frame['hip_angle'])
            if length(sub(sub(chain[0], frame['root']), target)) > .0001:
                raise ValueError('Hip socket detached from pelvis')
            if chain[0] != frame['hips'][side]:
                raise ValueError('Thigh and hip disagree')
            if frame['arms'][side]['joints'][0] != frame['shoulders'][side]:
                raise ValueError('Arm detached from shoulder')
            contact = frame['contacts'][side]
            support = max(rot(p, leg['foot_angle'])[1] for p in design['foot_shape'])
            if abs(chain[2][1] + support - contact['ground_y']) > .0001:
                raise ValueError('Boot shape and foot support disagree')
            if abs(contact['ground_y'] + contact['lift'] - design['origin'][1]) > .0001:
                raise ValueError('Changed ground registration')
            if contact['planted'] and (contact['lift'] != 0 or contact['ground_y'] != design['origin'][1]):
                raise ValueError('Planted foot lifts or penetrates ground')
            planted[side].append(contact['planted'])
    half = len(frames) // 2
    if any(planted['near'][i] != planted['far'][(i + half) % len(frames)] for i in range(len(frames))):
        raise ValueError('Feet do not alternate by half a cycle')
    if any(all(f['contacts'][side]['planted'] for side in planted) for f in frames):
        raise ValueError('Run contains double support')
    if not any(not any(f['contacts'][side]['planted'] for side in planted) for f in frames):
        raise ValueError('Run has no flight phase')
    for side in planted:
        if not 1 <= sum(planted[side]) < half:
            raise ValueError('Missing stance or recovery')
        if max(f['contacts'][side]['lift'] for f in frames) < 20:
            raise ValueError('Recovery foot does not lift enough')
    if max(f['hip_angle'] for f in frames) - min(f['hip_angle'] for f in frames) < 10:
        raise ValueError('Pelvis does not rotate')


def validate(source, pose_file, work):
    d = json.loads((SOURCE / 'design.json').read_text())
    poses = json.loads(pose_file.read_text())
    verify_motion(d, poses)
    report = inspect(source)
    origin = validate_source(report)
    if [origin['x'], origin['y']] != d['origin']:
        raise ValueError('Saved source has the wrong origin')
    script(SOURCE / 'verify.lua', source=source, design=SOURCE / 'design.json', poses=pose_file,
           output=work / 'pixel-check.json')
    result = json.loads((work / 'pixel-check.json').read_text())
    if result.get('result') != 'passed':
        raise ValueError('Saved pixel verification failed')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--rebuild', action='store_true', help='replace the saved timeline from the drawing recipe; discards manual cel edits')
    mode.add_argument('--review-only', action='store_true', help='validate/export the saved timeline; preserve all cel edits')
    args = parser.parse_args()
    timeline = SOURCE / 'animation.aseprite'
    pose_file = SOURCE / 'poses.json'
    if timeline.exists() and not (args.rebuild or args.review_only):
        parser.error('Authored timeline exists. Choose --review-only or deliberately use --rebuild.')
    d = json.loads((SOURCE / 'design.json').read_text())
    expected_refs = json.loads((SOURCE / 'references.json').read_text())
    for ref in expected_refs:
        if digest(SOURCE / ref['path']) != ref['sha256']:
            raise ValueError('Visual reference changed: inspect it and update references.json deliberately')
    (PREP / '.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-run-', dir=PREP / '.work') as tmp:
        work = Path(tmp)
        candidate = work / 'animation.aseprite'
        candidate_poses = work / 'poses.json'
        if args.review_only:
            shutil.copyfile(timeline, candidate)
            shutil.copyfile(pose_file, candidate_poses)
        else:
            write(candidate_poses, generate(d))
            verify_motion(d, json.loads(candidate_poses.read_text()))
            script(SOURCE / 'draw.lua', root=SOURCE, output=work, poses=candidate_poses,
                   raster=PREP / 'lua/pixel/raster.lua')
            if json.loads((work / 'drawn.json').read_text())['frames'] != d['frames']:
                raise ValueError('Drawing did not complete')
        checks = validate(candidate, candidate_poses, work)
        review = work / 'review'
        review.mkdir()
        export(candidate, review)
        script(PREP / 'lua/pixel/review.lua', source=candidate, output=review, scale=3)
        if json.loads((review / 'reviewed.json').read_text()) is not True:
            raise ValueError('Review did not complete')
        gif = (review / 'running.gif').read_bytes()
        loop_marker = b'NETSCAPE2.0\x03\x01\x00\x00\x00'
        if loop_marker not in gif:
            raise ValueError('GIF is not configured to loop indefinitely')
        # Reopen and re-export once: verify stable atlas pixels and registration metadata.
        repeat = work / 'repeat'
        export(candidate, repeat)
        for name in ('sheet.png', 'sheet.json'):
            if (review / name).read_bytes() != (repeat / name).read_bytes():
                raise ValueError('Non-deterministic export: ' + name)
        if not args.review_only:
            candidate.replace(timeline)
            candidate_poses.replace(pose_file)
        # Receipts name the durable source, not the temporary validation copy.
        receipt = json.loads((review / 'receipt.json').read_text())
        receipt['source'] = timeline.relative_to(PREP).as_posix()
        receipt['source_sha256'] = digest(timeline)
        write(review / 'receipt.json', receipt)
        recipes = ['design.json', 'poses.py', 'poses.json', 'draw.lua', 'build.py', 'verify.lua', 'references.json',
                   '../../lua/pixel/raster.lua', '../../lua/pixel/review.lua', '../../tools/puppet_math.py']
        checks.update({
            'status': 'Run-only art proof; awaiting visual approval. No runtime integration.',
            'method': d['method'], 'source_sha256': digest(timeline),
            'recipes': {p: digest(SOURCE / p) for p in recipes}, 'references': expected_refs,
            'repeat_export_identical': True, 'gif_roundtrip_pixels_and_timing_identical': True, 'gif_loops': True,
        })
        write(review / 'validation.json', checks)
        destination = PREP / 'exports' / d['id']
        destination.mkdir(parents=True, exist_ok=True)
        for file in review.iterdir():
            file.replace(destination / file.name)
        print(f'PASS: {d["frames"]} frames, {len(d["layer_order"])} layers. Review: {destination / "running.gif"}')


if __name__ == '__main__':
    main()
