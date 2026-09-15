"""Regression checks for portability, unsafe inputs, and export registration."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import aseprite
import sprites


class BuildTests(unittest.TestCase):
    def test_platform_selection(self):
        for system, machine, expected in [('Darwin', 'arm64', 'Darwin-arm64'),
                                          ('Darwin', 'x86_64', 'Darwin-x86_64'),
                                          ('Linux', 'x86_64', 'Linux-x86_64'),
                                          ('Windows', 'AMD64', 'Windows-x86_64')]:
            self.assertEqual(aseprite.host_key(system, machine), expected)
        with self.assertRaisesRegex(RuntimeError, 'Unsupported host'):
            aseprite.host_key('Linux', 'aarch64')

    def test_archives_are_all_pinned(self):
        self.assertRegex(aseprite.LOCK['source']['commit'], r'^[0-9a-f]{40}$')
        for asset in aseprite.LOCK['skia']['assets'].values():
            self.assertRegex(asset['sha256'], r'^[0-9a-f]{64}$')

    def test_reject_archive_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'bad.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                output.writestr('../escaped.txt', 'bad')
            with self.assertRaisesRegex(RuntimeError, 'Unsafe path'):
                aseprite.extract_zip(archive, root / 'skia')
            self.assertFalse((root / 'escaped.txt').exists())

    def test_extract_normal_archive_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='aseprite path ') as directory:
            root = Path(directory)
            archive = root / 'valid.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                output.writestr('out/Release-x64/libskia.a', 'test')
            aseprite.extract_zip(archive, root / 'skia')
            self.assertEqual((root / 'skia/out/Release-x64/libskia.a').read_text(), 'test')

    def test_corrupt_download_fails_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(aseprite, 'LOCAL', Path(directory)):
            downloads = Path(directory) / 'downloads'
            downloads.mkdir()
            asset = aseprite.LOCK['skia']['assets']['Darwin-arm64']
            (downloads / asset['file']).write_bytes(b'corrupt')
            with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                aseprite.prepare_skia('Darwin-arm64', Path(directory) / 'skia')
            self.assertFalse((Path(directory) / 'skia').exists())

    def test_concurrent_setup_fails_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(aseprite, 'LOCAL', Path(directory)):
            with aseprite.setup_lock():
                with self.assertRaisesRegex(RuntimeError, 'Setup already running'):
                    with aseprite.setup_lock():
                        pass
            self.assertFalse((Path(directory) / 'setup.lock').exists())


class SpriteTests(unittest.TestCase):
    def setUp(self):
        self.rig = json.loads((aseprite.PREP / 'templates/humanoid.rig.json').read_text())

    def test_valid_template(self):
        sprites.validate_rig(self.rig)

    def test_missing_or_cyclic_parent(self):
        self.rig['parts'][0]['parent'] = 'head'
        with self.assertRaisesRegex(ValueError, 'Parents must precede'):
            sprites.validate_rig(self.rig)

    def test_typo_in_keyed_layer(self):
        self.rig['clips'][0]['frames'][0]['parts']['arm.typo'] = {'x': 1}
        with self.assertRaisesRegex(ValueError, 'Unknown keyed part'):
            sprites.validate_rig(self.rig)

    def test_reject_fractional_translation_and_invalid_duration(self):
        frame = self.rig['clips'][0]['frames'][0]
        frame['parts'] = {'torso': {'x': 0.5}}
        with self.assertRaisesRegex(ValueError, 'integer pixels'):
            sprites.validate_rig(self.rig)
        frame['parts'] = {}
        frame['duration_ms'] = 0
        with self.assertRaisesRegex(ValueError, 'duration_ms'):
            sprites.validate_rig(self.rig)

    def test_asset_path_cannot_escape(self):
        for name in ['../kaida', '/tmp/kaida', 'a/b', 'a\\b', '..']:
            with self.assertRaises(ValueError):
                sprites.asset_dir(name)

    def test_bake_preserves_existing_timeline(self):
        with tempfile.TemporaryDirectory() as directory:
            timeline = Path(directory) / 'animation.aseprite'
            timeline.write_bytes(b'hand-edited')
            with self.assertRaisesRegex(ValueError, 'Already exists'):
                sprites.bake(Path(directory) / 'master.aseprite', Path('unused.json'), timeline)
            self.assertEqual(timeline.read_bytes(), b'hand-edited')

    def test_bake_cannot_overwrite_master_even_with_force(self):
        with self.assertRaisesRegex(ValueError, 'differ from'):
            sprites.bake(Path('master.aseprite'), Path('unused.json'), Path('master.aseprite'), True)

    def test_registration_validation(self):
        report = {'width': 64, 'height': 80, 'frames': 2, 'emptyFrames': [],
                  'tags': [{'name': 'idle.right', 'from': 1, 'to': 2}],
                  'slices': [{'name': 'origin', 'pivot': {'x': 32, 'y': 72}}]}
        self.assertEqual(sprites.validate_source(report), {'x': 32, 'y': 72})
        for field, value in [('emptyFrames', [2]), ('tags', []), ('slices', [])]:
            bad = copy.deepcopy(report)
            bad[field] = value
            with self.assertRaises(ValueError):
                sprites.validate_source(bad)
        report['tags'].append({'name': 'other', 'from': 2, 'to': 2})
        with self.assertRaisesRegex(ValueError, 'exactly once'):
            sprites.validate_source(report)


if __name__ == '__main__':
    unittest.main()
