"""Failure-path checks against actual exported packages, no provider calls."""
import copy
import json
from pathlib import Path
import shutil
import struct
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
