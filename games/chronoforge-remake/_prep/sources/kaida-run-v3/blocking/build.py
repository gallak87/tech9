#!/usr/bin/env python3
"""Build the Kaida motion proof with the local Aseprite; no desktop launch."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE=Path(__file__).resolve().parent
PREP=SOURCE.parents[2]
sys.path.insert(0,str(PREP/'tools'))
from aseprite import digest, executable, run
from sprites import inspect, validate_source
from motion import generate, verify


def script(path, **params):
    args=[executable(),'--batch']
    for key,value in params.items():args+=['--script-param',f'{key}={value}']
    run(args+['--script',path])


def write(path,data):path.write_text(json.dumps(data,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--rebuild',action='store_true',help='replace the motion source from its recipe')
    group.add_argument('--review-only',action='store_true',help='export the saved source, preserving cel edits')
    args=parser.parse_args()
    source=SOURCE/'skeleton.aseprite';saved_poses=SOURCE/'poses.json'
    if source.exists() and not (args.rebuild or args.review_only):
        parser.error('Existing source: use --review-only or deliberately --rebuild.')
    d=json.loads((SOURCE/'design.json').read_text())
    (PREP/'.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-v3-',dir=PREP/'.work') as tmp:
        work=Path(tmp);candidate=work/'skeleton.aseprite';pose_file=work/'poses.json'
        poses=json.loads(saved_poses.read_text()) if args.review_only else generate(d)
        checks=verify(d,poses);write(pose_file,poses)
        if args.review_only:shutil.copyfile(source,candidate)
        else:script(SOURCE/'draw.lua',root=SOURCE,output=candidate,poses=pose_file,raster=PREP/'lua/pixel/raster.lua')
        report=inspect(candidate);origin=validate_source(report)
        assert report['frames']==d['frames'] and [report['width'],report['height']]==d['canvas']
        assert [origin['x'],origin['y']]==d['origin']
        assert all(l['cels']==d['frames'] for l in report['layers'])
        script(PREP/'lua/pixel/review.lua',source=candidate,output=work,scale=1)
        assert json.loads((work/'reviewed.json').read_text()) is True
        assert b'NETSCAPE2.0\x03\x01\x00\x00\x00' in (work/'running.gif').read_bytes()
        if not args.review_only:
            candidate.replace(source);pose_file.replace(saved_poses)
        checks.update({'stage':'skeleton motion guide; not character art','source_sha256':digest(source),
                       'gif_roundtrip_pixels_and_timing_equal':True,'gif_loops':True})
        write(work/'validation.json',checks)
        destination=PREP/'exports/kaida-run-v3/skeleton';destination.mkdir(parents=True,exist_ok=True)
        for p in work.iterdir():
            if p.suffix in ('.gif','.png') or p.name=='validation.json':p.replace(destination/p.name)
        print('PASS:',destination/'running.gif')


if __name__=='__main__':main()
