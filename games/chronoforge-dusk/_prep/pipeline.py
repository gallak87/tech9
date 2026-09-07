#!/usr/bin/env python3
"""Explicit source inspection, Blender builds, immutable candidates and handoff."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

PREP = Path(__file__).resolve().parent
GAME = PREP.parent / 'game'
sys.path.insert(0, str(PREP / 'tools'))
from glb_check import check as check_glb

BLENDER_VERSION = '5.1.1'
BLENDER_HASH = 'b70da489d7f4'
ROLES = {'idle','walk','run','attack','hurt'}
OUTPUTS = {'runtime/model.glb','runtime/descriptor.json','working/export.blend','inspection.json','reimport.json'}
RECIPES = {'static_blend': ('prop','none'), 'skeletal_blend': ('character','skeletal')}
PREPARATION_RECIPES = {
    'mixamo_upload': ({'editable_master'}, 'exports'),
    'mixamo_restore': ({'reference_master','rigged_download','download_receipt'}, 'sources'),
    'mixamo_clips': ({'rigged_master','download_receipt'}, 'sources'),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, data):
    Path(path).write_text(json.dumps(data, indent=2, sort_keys=True)+'\n')


def inside(root, relative):
    require(isinstance(relative,str) and relative and not Path(relative).is_absolute(), 'Expected relative path')
    path = (root / relative).resolve()
    require(path.is_relative_to(root.resolve()) and path != root.resolve(), 'Path escapes root: '+relative)
    return path


def token(value):
    return isinstance(value,str) and re.fullmatch(r'[a-z0-9][a-z0-9._-]*',value) is not None and '..' not in value


def validate(metadata):
    require(metadata.get('production_format') == 1, 'Unsupported production metadata')
    for field in ('asset_id','revision'):
        require(token(metadata.get(field)), 'Invalid '+field)
    recipe = metadata.get('recipe')
    require(recipe in RECIPES, 'Unknown named recipe; shell commands are not recipes')
    require((metadata.get('kind'),metadata.get('animation_mode')) == RECIPES[recipe], 'Recipe and asset kind/mode disagree')
    require(isinstance(metadata.get('label'),str) and metadata['label'], 'Missing label')
    require(isinstance(metadata.get('placeholder'),bool), 'Explicit placeholder status required')
    require(OUTPUTS <= set(metadata.get('required_outputs',[])), 'Missing required output declarations')
    require(set(metadata['required_outputs']) <= OUTPUTS, 'Unknown required outputs')
    files = metadata.get('source_files',[])
    require(files and sum(s.get('role') == 'editable_master' for s in files) == 1, 'Exactly one editable master required')
    require(len({s['path'] for s in files}) == len(files), 'Duplicate source path')
    for source in files:
        path = inside(PREP,source['path'])
        require(path.is_file() and sha(path) == source['sha256'], 'Missing or changed source: '+str(path))
        if source['role'] == 'editable_master':
            require(path.suffix == '.blend', 'Finish raw acquisitions in an editable Blender master first')
    dims = metadata['dimensions']
    require((dims['forward'],dims['up'],dims['origin']) == ('-Z','+Y','ground'), 'Use the game coordinate contract')
    require(.1 <= dims['height_m'] <= 20 and .05 <= dims['radius_m'] <= 5, 'Invalid runtime dimensions')
    require(metadata.get('provenance',{}).get('origin') and metadata['provenance'].get('attribution'), 'Provenance and attribution required')
    if recipe == 'skeletal_blend':
        require(ROLES <= set(metadata.get('clips',{})), 'Character needs idle, walk, run, attack and hurt')
        require(metadata.get('root_motion',{}).get('operation') == 'remove_root_xy', 'Declare the supported root correction')
        for role, clip in metadata['clips'].items():
            require(isinstance(clip.get('name'),str) and clip['name'] and isinstance(clip.get('loop'),bool), 'Invalid clip '+role)
    else:
        require(not metadata.get('clips') and not metadata.get('attachments'), 'Static source cannot declare character stages')
    for dependency in metadata.get('dependencies',[]):
        verify(inside(PREP,dependency))
    return metadata


def verify(manifest_path):
    manifest_path = Path(manifest_path).resolve()
    manifest = read(manifest_path)
    require(manifest.get('candidate_format') == 1, 'Unknown candidate format')
    for field in ('asset_id','revision'):
        require(token(manifest.get(field)), 'Invalid candidate identity')
    require(manifest.get('files'), 'Empty candidate')
    for name, digest in manifest['files'].items():
        path = inside(manifest_path.parent,name)
        require(path.is_file() and sha(path) == digest, 'Candidate bytes changed: '+str(path))
    actual = {p.relative_to(manifest_path.parent).as_posix() for p in manifest_path.parent.rglob('*') if p.is_file() and p != manifest_path}
    require(actual == set(manifest['files']), 'Candidate file inventory changed')
    return manifest


def toolchain():
    binary = os.environ.get('BLENDER_PATH') or shutil.which('blender')
    require(binary, 'Install Blender 5.1.1 or set BLENDER_PATH')
    version = subprocess.check_output([binary,'--version'],text=True)
    require('Blender '+BLENDER_VERSION+'\n' in version and 'build hash: '+BLENDER_HASH in version, 'Blender pin mismatch')
    return binary, {'blender': BLENDER_VERSION, 'blender_build': BLENDER_HASH, 'python': sys.version.split()[0]}


def inputs(metadata, versions):
    scripts = [PREP/'pipeline.py', *sorted((PREP/'tools').glob('*.py')), PREP/'ASSET_CONTRACT.md']
    return {'metadata': metadata, 'sources': {s['path']:sha(inside(PREP,s['path'])) for s in metadata['source_files']},
            'dependencies': {p:sha(inside(PREP,p)) for p in metadata.get('dependencies',[])},
            'scripts': {p.relative_to(PREP).as_posix():sha(p) for p in scripts}, 'tools': versions, 'runtime_format': 1}


@contextmanager
def build_workspace(prefix):
    """Publish on success; preserve logs and partial outputs on any failure."""
    temporary = PREP / '.build'
    temporary.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=prefix + '-', dir=temporary) as work:
        out = Path(work)
        try:
            yield out
        except Exception as error:
            # The caller's log context has closed before control reaches here,
            # including for subprocess timeouts and post-export validation errors.
            failure = Path(tempfile.mkdtemp(prefix='failed-' + prefix + '-', dir=temporary))
            shutil.copytree(out, failure, dirs_exist_ok=True)
            raise ValueError(f'{error}; diagnostics retained at {failure}') from error


def build(metadata_path):
    metadata_path = Path(metadata_path).resolve()
    metadata = validate(read(metadata_path))
    destination = PREP/'candidates'/metadata['asset_id']/metadata['revision']
    require(not destination.exists(), 'Candidate exists; choose a new metadata revision')
    binary, versions = toolchain()
    identity = inputs(metadata,versions)
    fingerprint = hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
    with build_workspace('candidate-' + metadata['asset_id']) as out:
        (out/'runtime').mkdir()
        write(out/'metadata.json',metadata)
        with (out/'build.log').open('w') as log:
            for stage in ('export','reimport'):
                command = [binary,'--background','--factory-startup','--python-exit-code','1','--python',str(PREP/'tools/blender_stage.py'),'--',stage,str(out/'metadata.json'),str(out)]
                print('Stage:',stage,flush=True)
                result = subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=180)
                require(result.returncode == 0, 'Blender ' + stage + ' stage failed')
        write(out/'structural-checks.json',check_glb(out/'runtime/model.glb',metadata))
        base = f'res://assets/{metadata["asset_id"]}/{metadata["revision"]}/'
        descriptor = {key:metadata[key] for key in ('asset_id','revision','label','kind','animation_mode','placeholder','dimensions')}
        descriptor.update({'format':1, 'model':{'path':base+'model.glb','sha256':sha(out/'runtime/model.glb')}, 'clips':{}, 'attachments':[], 'motion':{}})
        if metadata['kind'] == 'character':
            descriptor['motion'] = {'traversal':'controller','action':'controller','clips':'in_place'}
            descriptor['clips'] = {role:{**clip,'file':base+'model.glb'} for role,clip in metadata['clips'].items()}
        dependencies = {}
        for path in metadata.get('dependencies',[]):
            dep_path = inside(PREP,path)
            dep = verify(dep_path)
            require(dep['asset_id'] not in dependencies, 'Duplicate dependency identity')
            require(read(dep_path.parent/'runtime/descriptor.json')['kind'] == 'prop', 'Only static prop dependencies are supported')
            filename = dep['asset_id']+'.glb'
            shutil.copyfile(dep_path.parent/'runtime/model.glb',out/'runtime'/filename)
            dependencies[dep['asset_id']] = {'path':base+filename,'sha256':sha(out/'runtime'/filename)}
        for attachment in metadata.get('attachments',[]):
            reference = dependencies[attachment['dependency']]
            descriptor['attachments'].append({**{k:v for k,v in attachment.items() if k != 'dependency'}, 'model':reference})
        write(out/'runtime/descriptor.json',descriptor)
        require(all((out/name).is_file() for name in metadata['required_outputs']), 'Required output missing')
        validate(read(metadata_path))
        require(inputs(read(metadata_path),versions) == identity, 'Inputs changed during build; retry with a stable source revision')
        files = {p.relative_to(out).as_posix():sha(p) for p in sorted(out.rglob('*')) if p.is_file()}
        manifest = {'candidate_format':1,'asset_id':metadata['asset_id'],'revision':metadata['revision'],
                    'created_at':datetime.now(timezone.utc).isoformat(), 'structural_status':'ready_for_game_inspection',
                    'visual_status':'awaiting_review','build_fingerprint':fingerprint, 'inputs':identity,'files':files}
        write(out/'manifest.json',manifest)
        destination.parent.mkdir(parents=True,exist_ok=True)
        out.rename(destination)
    verify(destination/'manifest.json')
    print(destination/'manifest.json')


def validate_preparation(metadata):
    require(metadata.get('preparation_format') == 1, 'Unsupported preparation metadata')
    require(token(metadata.get('asset_id')) and token(metadata.get('revision')), 'Invalid preparation identity')
    require(metadata.get('recipe') in PREPARATION_RECIPES, 'Unknown preparation recipe')
    roles, _ = PREPARATION_RECIPES[metadata['recipe']]
    if metadata['recipe'] == 'mixamo_clips':
        clips = metadata.get('clips', {})
        require(clips and set(clips) <= ROLES, 'Declare supported gameplay clip roles')
        require(all(token(name) for name in clips.values()) and len(set(clips.values())) == len(clips),
                'Declare distinct safe source action names')
        roles = roles | {'clip_'+role for role in clips}
    files = metadata.get('source_files', [])
    require(len(files) == len(roles) and {s['role'] for s in files} == roles, 'Wrong preparation source roles')
    require(len({s['path'] for s in files}) == len(files), 'Duplicate preparation source')
    sources = {}
    for source in files:
        path = inside(PREP, source['path'])
        require(path.is_file() and sha(path) == source['sha256'], 'Missing or changed preparation source: '+str(path))
        if source['role'] in {'editable_master','reference_master','rigged_master'}:
            require(path.suffix == '.blend', 'Preparation needs a retained Blender master')
        sources[source['role']] = path
    require(metadata.get('view_from', '+Y') in {'+Y','-Y'}, 'Unsupported editor view direction')
    if metadata['recipe'] == 'mixamo_restore':
        raw, receipt_path = sources['rigged_download'], sources['download_receipt']
        require(raw.suffix.lower() == '.fbx', 'Restore currently supports returned FBX files')
        root = PREP/'assets'/metadata['asset_id']/'downloads'
        require(raw.is_relative_to(root.resolve()) and receipt_path == raw.parent/'receipt.json',
                'Retain the rigged download and receipt before preparation')
        receipt = read(receipt_path)
        require(receipt.get('asset_id') == metadata['asset_id'] and receipt.get('files',{}).get(raw.name) == sha(raw),
                'Retained download does not match its receipt')
    elif metadata['recipe'] == 'mixamo_clips':
        receipt_path = sources['download_receipt']
        receipt = read(receipt_path)
        root = (PREP/'assets'/metadata['asset_id']/'downloads').resolve()
        require(receipt.get('asset_id') == metadata['asset_id'], 'Receipt asset identity mismatch')
        for role in metadata['clips']:
            raw = sources['clip_'+role]
            require(raw.suffix.lower() == '.fbx' and raw.is_relative_to(root)
                    and receipt_path == raw.parent/'receipt.json', 'Retain each clip in the declared download batch')
            require(receipt.get('files',{}).get(raw.name) == sha(raw), 'Clip does not match its receipt')
    return metadata


def prepare(metadata_path):
    metadata_path = Path(metadata_path).resolve()
    metadata = validate_preparation(read(metadata_path))
    _, category = PREPARATION_RECIPES[metadata['recipe']]
    destination = PREP/'assets'/metadata['asset_id']/category/metadata['revision']
    require(not destination.exists(), 'Preparation revision exists; choose a new revision')
    binary, versions = toolchain()
    identity = inputs(metadata, versions)
    with build_workspace('preparation-' + metadata['asset_id']) as out:
        write(out/'metadata.json', metadata)
        with (out/'build.log').open('w') as log:
            command = [binary,'--background','--factory-startup','--python-exit-code','1',
                       '--python',str(PREP/'tools/preparation_stage.py'),'--',str(out/'metadata.json'),str(out)]
            result = subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=180)
        require(result.returncode == 0, 'Blender preparation failed')
        current = validate_preparation(read(metadata_path))
        require(inputs(current, versions) == identity, 'Preparation inputs changed during execution')
        expected = ('master.blend' if category == 'sources' else metadata['asset_id']+'-geometry-only.fbx')
        require((out/expected).is_file() and (out/'preparation.json').is_file(), 'Preparation output missing')
        write(out/'manifest.json', {'preparation_package_format':1, 'asset_id':metadata['asset_id'],
              'revision':metadata['revision'], 'recipe':metadata['recipe'], 'inputs':identity,
              'files':{p.relative_to(out).as_posix():sha(p) for p in out.rglob('*') if p.is_file()},
              'status':'Local preparation complete; runtime candidate and visual acceptance not implied'})
        destination.parent.mkdir(parents=True,exist_ok=True)
        out.rename(destination)
    print(destination/expected)


def handoff(manifest_path, register):
    manifest_path = Path(manifest_path).resolve()
    require(manifest_path.is_relative_to(PREP/'candidates'), 'Handoff requires a local candidate')
    manifest = verify(manifest_path)
    directory = manifest_path.parent
    descriptor = read(directory/'runtime/descriptor.json')
    require(not register or descriptor['kind'] == 'character', 'Character selector cannot register a static prop')
    destination = GAME/'assets'/manifest['asset_id']/manifest['revision']
    destination.parent.mkdir(parents=True,exist_ok=True)
    expected = {p.name:sha(p) for p in (directory/'runtime').iterdir() if p.is_file()}
    if destination.exists():
        for name,digest in expected.items():
            require((destination/name).is_file() and sha(destination/name) == digest, 'Existing runtime revision differs; do not overwrite')
    else:
        with tempfile.TemporaryDirectory(prefix='.handoff-',dir=destination.parent) as staging:
            payload = Path(staging)/'payload'
            shutil.copytree(directory/'runtime',payload)
            payload.rename(destination)
    resource = f'res://assets/{manifest["asset_id"]}/{manifest["revision"]}/descriptor.json'
    if register:
        catalog_path = GAME/'content/candidates.json'
        catalog = read(catalog_path)
        if resource not in catalog:
            catalog.append(resource)
            temporary = catalog_path.with_suffix('.json.tmp')
            write(temporary,catalog)
            temporary.replace(catalog_path)
    event = {'event':'handoff','asset_id':manifest['asset_id'],'revision':manifest['revision'],
             'manifest_sha256':sha(manifest_path),'descriptor':resource,'registered':register,
             'at':datetime.now(timezone.utc).isoformat(), 'acceptance':'not implied'}
    append_history(event)
    print('Delivered',resource,'— run python3 tools/native.py import from Dusk')


def append_history(event):
    with (PREP/'history.jsonl').open('a') as log:
        log.write(json.dumps(event,sort_keys=True)+'\n')


def retain(asset_id, batch, receipt_path, filenames):
    require(token(asset_id) and token(batch), 'Invalid asset ID or download batch')
    receipt = read(receipt_path)
    require(all(receipt.get(k) for k in ('provider','origin','attribution')), 'Receipt needs provider, origin and attribution status')
    paths = [Path(name).resolve() for name in filenames]
    require(paths and all(p.is_file() for p in paths), 'Every download must be a file')
    require(len({p.name for p in paths}) == len(paths) and all(p.name != 'receipt.json' for p in paths), 'Duplicate/reserved download filename')
    destination = PREP/'assets'/asset_id/'downloads'/batch
    require(not destination.exists(), 'Download batch exists; choose a new batch')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.retain-',dir=destination.parent) as staging:
        payload = Path(staging)/'payload'
        payload.mkdir()
        for source in paths:
            shutil.copyfile(source,payload/source.name)
        receipt.update({'asset_id':asset_id,'batch':batch,'retained_at':datetime.now(timezone.utc).isoformat(),
                        'files':{p.name:sha(payload/p.name) for p in paths}})
        write(payload/'receipt.json',receipt)
        payload.rename(destination)
    print('Immutable download batch:',destination)


def record_review(manifest_path, decision, evidence, game_revision):
    manifest = verify(manifest_path)
    evidence_path = inside(PREP.parent,evidence)
    require(evidence_path.is_file(), 'Review needs an existing evidence record')
    append_history({'event':'visual_review','decision':decision,'asset_id':manifest['asset_id'],
                    'revision':manifest['revision'],'manifest_sha256':sha(manifest_path),'game_revision':game_revision,
                    'evidence':evidence,'evidence_sha256':sha(evidence_path), 'at':datetime.now(timezone.utc).isoformat()})
    print('Review history appended; prior accepted records and candidates retained')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    retain_parser = sub.add_parser('retain',help='Copy manual downloads and record their provenance')
    retain_parser.add_argument('--asset-id',required=True)
    retain_parser.add_argument('--batch',required=True)
    retain_parser.add_argument('--receipt',required=True)
    retain_parser.add_argument('files',nargs='+')
    for name in ('inspect','build','prepare'):
        command = sub.add_parser(name)
        command.add_argument('metadata')
    for name in ('verify','handoff','record-review'):
        command = sub.add_parser(name)
        command.add_argument('manifest')
        if name == 'handoff':
            command.add_argument('--register',action='store_true')
        elif name == 'record-review':
            command.add_argument('--decision',required=True,choices=['accepted','rejected'])
            command.add_argument('--evidence',required=True,help='Evidence file relative to Dusk')
            command.add_argument('--game-revision',required=True)
    args = parser.parse_args()
    try:
        if args.command == 'retain':
            retain(args.asset_id,args.batch,args.receipt,args.files)
        elif args.command == 'inspect':
            print(json.dumps(validate(read(args.metadata)),indent=2))
        elif args.command == 'build':
            build(args.metadata)
        elif args.command == 'prepare':
            prepare(args.metadata)
        elif args.command == 'verify':
            manifest = verify(args.manifest)
            print(manifest['asset_id'],manifest['revision'],'verified; visual status:',manifest['visual_status'])
        elif args.command == 'handoff':
            handoff(args.manifest,args.register)
        elif args.command == 'record-review':
            record_review(args.manifest,args.decision,args.evidence,args.game_revision)
    except (ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
        parser.exit(1,'ERROR: '+str(error)+'\n')


if __name__ == '__main__':
    main()
