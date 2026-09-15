#!/usr/bin/env python3
"""Build/review all Kaida movement clips locally through Aseprite, without desktop UI."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

SOURCE=Path(__file__).resolve().parent
PREP=SOURCE.parents[1]
GAME=PREP.parent
sys.path.insert(0,str(PREP/'tools'))
from aseprite import digest, executable, run
from sprites import export
from poses import generate, STATES

DOCUMENTS=['master-right.aseprite','master-down.aseprite','master-up.aseprite','animation.aseprite','rig.json']

def script(name,**params):
    cmd=[executable(),'--batch']
    for key,value in params.items():cmd+=['--script-param',f'{key}={value}']
    run(cmd+['--script',SOURCE/name])

def verify_motion(rig):
    expected={state+'.'+view for state in STATES for view in ('right','left','down','up')}
    if {clip['name'] for clip in rig['clips']}!=expected:raise ValueError('Incomplete runtime pose/direction coverage')
    for clip in rig['clips']:
        if clip['name'].startswith('run.'):
            sides={side:[f['contacts'][side] for f in clip['frames']] for side in ('near','far')}
            for side,contacts in sides.items():
                if sum(c['planted'] for c in contacts)!=5:raise ValueError('Expected five contact poses for each run leg')
                if max(c['ankle'][1] for c in contacts)-min(c['ankle'][1] for c in contacts)<20:
                    raise ValueError('Recovery foot does not lift')
            for i,near in enumerate(sides['near']):
                if near['planted']!=sides['far'][(i+6)%12]['planted']:raise ValueError('Legs do not alternate by half a cycle')
        for frame in clip['frames']:
            if frame['duration_ms']%10:raise ValueError('Use timings representable exactly in the GIF review')
    return True

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--replace',action='store_true',help='regenerate masters/rig/timeline; deliberately discards manual edits')
    group.add_argument('--review-only',action='store_true',help='verify and export saved masters/timeline without rebaking')
    group.add_argument('--bake-only',action='store_true',help='deliberately replace timeline using saved masters and rig.json')
    args=parser.parse_args()
    spec=json.loads((SOURCE/'parts.json').read_text())
    if digest(GAME/spec['reference'])!=spec['sha256']:raise ValueError('Reference changed; inspect masks before rebuilding')
    (PREP/'.work').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kaida-full-',dir=PREP/'.work') as tmp:
        work=Path(tmp)
        if args.review_only:
            for name in DOCUMENTS:shutil.copyfile(SOURCE/name,work/name)
        else:
            if not (args.replace or args.bake_only) and any((SOURCE/name).exists() for name in DOCUMENTS):
                raise ValueError('Authored documents exist. Choose --review-only, --bake-only, or --replace deliberately.')
            if args.bake_only:
                for name in DOCUMENTS:
                    if name!='animation.aseprite':shutil.copyfile(SOURCE/name,work/name)
            else:
                script('author.lua',root=GAME,output=work)
                (work/'rig.json').write_text(json.dumps(generate(spec),separators=(',',':'))+'\n')
            script('bake.lua',source=work,output=work)
        rig=json.loads((work/'rig.json').read_text());verify_motion(rig)
        script('verify.lua',source=work,output=work/'validation.json')
        result=json.loads((work/'validation.json').read_text())
        if result['result']!='passed':raise ValueError('Sprite validation failed')
        if not args.review_only:
            for name in DOCUMENTS:shutil.copyfile(work/name,SOURCE/name)
        destination=PREP/'exports'/'kaida-full-set'
        export(SOURCE/'animation.aseprite',destination)
        script('review.lua',source=SOURCE/'animation.aseprite',output=destination)
        required=['all-movements.png','run.right.gif','running.gif','run-onion.png','review.json']+[c['name']+'.gif' for c in rig['clips']]
        if any(not (destination/name).is_file() for name in required):raise ValueError('Missing review output')
        result['reference_sha256']=spec['sha256']
        result['documents']={name:digest(SOURCE/name) for name in DOCUMENTS}
        result['status']='Review draft. Game assets and renderer are unchanged.'
        (destination/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
        print(f"PASS: {result['tags']} clips / {result['frames']} frames. Running GIF: {destination/'running.gif'}")

if __name__=='__main__':main()
