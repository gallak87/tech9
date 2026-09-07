"""Preparation metadata must reject stale, escaped and unretained inputs."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pipeline


class PreparationFailures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.raw = self.root/'assets/test/downloads/base/model.fbx'
        self.raw.parent.mkdir(parents=True)
        self.raw.write_bytes(b'retained rig')
        master = self.root/'master.blend'
        master.write_bytes(b'reference source')
        receipt = self.raw.parent/'receipt.json'
        pipeline.write(receipt, {'asset_id':'test','files':{'model.fbx':pipeline.sha(self.raw)}})
        self.meta = {'preparation_format':1,'asset_id':'test','revision':'r1','recipe':'mixamo_restore',
                     'source_files':[{'role':role,'path':p.relative_to(self.root).as_posix(),'sha256':pipeline.sha(p)}
                                     for role,p in [('reference_master',master),('rigged_download',self.raw),('download_receipt',receipt)]]}
        self.patcher = patch.object(pipeline, 'PREP', self.root)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_changed_download_is_rejected_even_if_metadata_is_updated(self):
        self.raw.write_bytes(b'different rig')
        self.meta['source_files'][1]['sha256'] = pipeline.sha(self.raw)
        with self.assertRaisesRegex(ValueError, 'does not match its receipt'):
            pipeline.validate_preparation(self.meta)

    def test_unretained_download_is_rejected(self):
        outside = self.root/'loose.fbx'
        outside.write_bytes(self.raw.read_bytes())
        self.meta['source_files'][1]['path'] = 'loose.fbx'
        with self.assertRaisesRegex(ValueError, 'Retain the rigged download'):
            pipeline.validate_preparation(self.meta)

    def test_changed_reference_and_path_escape_are_rejected(self):
        for path, expected in [('master.blend','changed preparation source'),('../outside.blend','escapes root')]:
            meta = copy.deepcopy(self.meta)
            meta['source_files'][0].update(path=path,sha256='0'*64)
            with self.assertRaisesRegex(ValueError, expected):
                pipeline.validate_preparation(meta)

    def test_unknown_recipe_and_duplicate_roles_are_rejected(self):
        meta = copy.deepcopy(self.meta)
        meta['recipe'] = 'sh arbitrary-command'
        with self.assertRaisesRegex(ValueError, 'Unknown preparation recipe'):
            pipeline.validate_preparation(meta)
        self.meta['source_files'][0]['role'] = 'rigged_download'
        with self.assertRaisesRegex(ValueError, 'Wrong preparation source roles'):
            pipeline.validate_preparation(self.meta)

    def test_existing_revision_is_rejected_before_blender_runs(self):
        destination = self.root/'assets/test/sources/r1'
        destination.mkdir(parents=True)
        (destination/'owner.blend').write_bytes(b'keep this')
        meta_path = self.root/'restore.json'
        pipeline.write(meta_path, self.meta)
        with patch.object(pipeline, 'toolchain', side_effect=AssertionError('Must not start Blender')):
            with self.assertRaisesRegex(ValueError, 'revision exists'):
                pipeline.prepare(meta_path)
        self.assertEqual((destination/'owner.blend').read_bytes(), b'keep this')


if __name__ == '__main__':
    unittest.main()
