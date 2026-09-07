"""Failure-path checks against actual exported packages, no provider calls."""
import copy
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pipeline
from glb_check import check, read_glb

PREP = pipeline.PREP
STATIC = PREP/'candidates/diagnostic.grip-probe/r1'
SKIN = PREP/'candidates/diagnostic.skin-probe/r1'


def write_glb(path, doc, binary):
    payload = json.dumps(doc,separators=(',',':')).encode()
    payload += b' ' * (-len(payload)%4)
    binary += b'\0' * (-len(binary)%4)
    data = struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(struct.pack('<4sII',b'glTF',2,len(data)+12)+data)


class PipelineFailures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.meta = pipeline.read(SKIN/'metadata.json')

    def test_changed_candidate_is_rejected(self):
        candidate = self.root/'candidate'
        shutil.copytree(STATIC,candidate)
        (candidate/'runtime/model.glb').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'Candidate bytes changed'):
            pipeline.verify(candidate/'manifest.json')

    def test_extra_candidate_file_is_rejected(self):
        candidate = self.root/'candidate'
        shutil.copytree(STATIC,candidate)
        (candidate/'untracked.txt').write_text('unexpected')
        with self.assertRaisesRegex(ValueError,'inventory changed'):
            pipeline.verify(candidate/'manifest.json')

    def test_changed_source_hash_is_rejected(self):
        meta = pipeline.read(PREP/'assets/diagnostic.grip-probe/asset.json')
        meta['source_files'][0]['sha256'] = '0'*64
        with self.assertRaisesRegex(ValueError,'changed source'):
            pipeline.validate(meta)

    def test_metadata_cannot_select_commands_or_escape_paths(self):
        meta = copy.deepcopy(self.meta)
        meta['recipe'] = 'sh -c echo injected'
        with self.assertRaisesRegex(ValueError,'Unknown named recipe'):
            pipeline.validate(meta)
        with self.assertRaisesRegex(ValueError,'escapes root'):
            pipeline.inside(self.root,'../outside')

    def test_missing_run_and_skin_are_rejected(self):
        original,binary = read_glb(SKIN/'runtime/model.glb')
        for change,expected in [('run','Missing declared'),('skin','No actual skin')]:
            doc = copy.deepcopy(original)
            if change == 'run':
                doc['animations'] = [a for a in doc['animations'] if a['name'] != 'run']
            else:
                doc['skins'] = []
            output = self.root/(change+'.glb')
            write_glb(output,doc,binary)
            with self.assertRaisesRegex(ValueError,expected):
                check(output,self.meta)

    def test_root_travel_is_rejected(self):
        doc,binary = read_glb(SKIN/'runtime/model.glb')
        # Inject a real exported-space translation channel with 1 m horizontal travel.
        view = len(doc['bufferViews'])
        offset = len(binary)
        binary += struct.pack('<2f6f',0,1, 0,0,0, 0,0,1)
        doc['bufferViews'] += [{'buffer':0,'byteOffset':offset,'byteLength':8},{'buffer':0,'byteOffset':offset+8,'byteLength':24}]
        acc = len(doc['accessors'])
        doc['accessors'] += [{'bufferView':view,'componentType':5126,'count':2,'type':'SCALAR'}, {'bufferView':view+1,'componentType':5126,'count':2,'type':'VEC3'}]
        doc['buffers'][0]['byteLength'] = len(binary)
        anim = next(a for a in doc['animations'] if a['name']=='walk')
        sample = len(anim['samplers'])
        anim['samplers'].append({'input':acc,'output':acc+1,'interpolation':'LINEAR'})
        root = next(i for i,n in enumerate(doc['nodes']) if n.get('name')=='Root')
        anim['channels'].append({'sampler':sample,'target':{'node':root,'path':'translation'}})
        output = self.root/'travel.glb'
        write_glb(output,doc,binary)
        with self.assertRaisesRegex(ValueError,'horizontal root travel'):
            check(output,self.meta)

    def test_skin_structure_is_rejected_before_handoff(self):
        original, binary = read_glb(SKIN/'runtime/model.glb')
        for change, expected in [('root','displacement root'), ('hierarchy','top-level skin joint'),
                                 ('joints','Mismatched skin vertex counts'), ('weights','Mismatched skin vertex counts'),
                                 ('binding','Invalid inverse bind matrices'), ('encoding','Invalid skin joint encoding')]:
            with self.subTest(change=change):
                doc = copy.deepcopy(original)
                root = next(i for i,n in enumerate(doc['nodes']) if n.get('name') == 'Root')
                attrs = doc['meshes'][0]['primitives'][0]['attributes']
                if change == 'root':
                    doc['nodes'][root]['name'] = 'LostRoot'
                elif change == 'hierarchy':
                    armature = next(n for n in doc['nodes'] if n.get('name') == 'Rig')
                    armature['children'].remove(root)
                elif change in ('joints','weights'):
                    doc['accessors'][attrs['JOINTS_0' if change == 'joints' else 'WEIGHTS_0']]['count'] -= 1
                elif change == 'binding':
                    doc['accessors'][doc['skins'][0]['inverseBindMatrices']]['count'] -= 1
                else:
                    doc['accessors'][attrs['JOINTS_0']]['componentType'] -= 1  # Same width, signed instead of unsigned.
                output = self.root/(change+'.glb')
                write_glb(output,doc,binary)
                with self.assertRaisesRegex(ValueError,expected):
                    check(output,self.meta)

    def test_invalid_accessor_layout_is_rejected(self):
        original, binary = read_glb(SKIN/'runtime/model.glb')
        for change, expected in [('view','Buffer view out of bounds'), ('offset','Invalid accessor layout'),
                                 ('stride','Invalid accessor layout'), ('count','Invalid accessor layout')]:
            with self.subTest(change=change):
                doc = copy.deepcopy(original)
                acc = doc['accessors'][0]
                view = doc['bufferViews'][acc['bufferView']]
                if change == 'view': view['byteLength'] = len(binary)+1
                if change == 'offset': acc['byteOffset'] = -4
                if change == 'stride': view['byteStride'] = 1
                if change == 'count': acc['count'] = 0
                output = self.root/(change+'.glb')
                write_glb(output,doc,binary)
                with self.assertRaisesRegex(ValueError,expected):
                    check(output,self.meta)

    def test_truncated_chunk_header_has_actionable_error(self):
        raw = bytearray((SKIN/'runtime/model.glb').read_bytes()) + b'1234'
        struct.pack_into('<I',raw,8,len(raw))
        output = self.root/'truncated.glb'
        output.write_bytes(raw)
        with self.assertRaisesRegex(ValueError,'Truncated GLB chunk header'):
            read_glb(output)

    def test_build_failures_retain_logs_without_publishing(self):
        # Exercise both entry points, including a timeout and a check that fails
        # after Blender returned success. Partial output is useful for diagnosis.
        for operation in ('build','prepare'):
            for failure in ('exit','timeout','validation'):
                with self.subTest(operation=operation,failure=failure):
                    root = self.root/(operation+'-'+failure)
                    root.mkdir()
                    metadata = {'asset_id':'fixture','revision':'r1','recipe':'mixamo_upload'}
                    metadata_path = root/'source.json'
                    pipeline.write(metadata_path,metadata)
                    def execute(command, stdout, **kwargs):
                        stdout.write('Blender diagnostic output\n')
                        (Path(command[-1])/'partial.glb').write_bytes(b'partial export')
                        if failure == 'timeout':
                            raise subprocess.TimeoutExpired(command,180)
                        return subprocess.CompletedProcess(command,1 if failure == 'exit' else 0)
                    with patch.object(pipeline,'PREP',root), \
                         patch.object(pipeline,'validate',return_value=metadata), \
                         patch.object(pipeline,'validate_preparation',return_value=metadata), \
                         patch.object(pipeline,'toolchain',return_value=('blender',{})), \
                         patch.object(pipeline,'inputs',return_value={}), \
                         patch.object(pipeline.subprocess,'run',side_effect=execute), \
                         patch.object(pipeline,'check_glb',side_effect=ValueError('Invalid exported skin')):
                        with self.assertRaisesRegex(ValueError,'diagnostics retained at'):
                            getattr(pipeline,operation)(metadata_path)
                    retained = list((root/'.build').iterdir())
                    self.assertEqual(len(retained),1)
                    self.assertTrue(retained[0].name.startswith('failed-'))
                    self.assertIn('Blender diagnostic output',(retained[0]/'build.log').read_text())
                    self.assertEqual((retained[0]/'partial.glb').read_bytes(),b'partial export')
                    self.assertFalse((root/'candidates').exists())
                    self.assertFalse((root/'assets').exists())

    def test_existing_candidate_is_rejected_before_launching_tools(self):
        metadata = {'asset_id':'fixture','revision':'r1'}
        metadata_path = self.root/'source.json'
        pipeline.write(metadata_path,metadata)
        (self.root/'candidates/fixture/r1').mkdir(parents=True)
        with patch.object(pipeline,'PREP',self.root), patch.object(pipeline,'validate',return_value=metadata), \
             patch.object(pipeline,'toolchain') as tools:
            with self.assertRaisesRegex(ValueError,'Candidate exists'):
                pipeline.build(metadata_path)
            tools.assert_not_called()

    def test_handoff_cannot_replace_changed_runtime_revision(self):
        candidate = self.root/'candidates/diagnostic.grip-probe/r1'
        shutil.copytree(STATIC,candidate)
        with patch.object(pipeline,'PREP',self.root), patch.object(pipeline,'GAME',self.root/'game'):
            pipeline.handoff(candidate/'manifest.json',False)
            runtime = self.root/'game/assets/diagnostic.grip-probe/r1/model.glb'
            runtime.write_bytes(b'owner change')
            with self.assertRaisesRegex(ValueError,'do not overwrite'):
                pipeline.handoff(candidate/'manifest.json',False)
            self.assertEqual(runtime.read_bytes(),b'owner change')

    def test_manual_download_retention_is_immutable(self):
        source = self.root/'original.fbx'
        source.write_bytes(b'exact downloaded bytes')
        receipt = self.root/'receipt-input.json'
        pipeline.write(receipt,{'provider':'manual fixture','origin':'test','attribution':'original test bytes'})
        with patch.object(pipeline,'PREP',self.root/'prep'):
            pipeline.retain('kaida','test-r1',receipt,[source])
            kept = self.root/'prep/assets/kaida/downloads/test-r1/original.fbx'
            source.write_bytes(b'later changed download')
            self.assertEqual(kept.read_bytes(),b'exact downloaded bytes')
            with self.assertRaisesRegex(ValueError,'batch exists'):
                pipeline.retain('kaida','test-r1',receipt,[source])


if __name__ == '__main__':
    unittest.main()
