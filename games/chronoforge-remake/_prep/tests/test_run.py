"""Regressions for the rejected run's failure modes and the saved-pixel checks."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PREP = Path(__file__).resolve().parents[1]
SOURCE = PREP / 'sources/kaida-run-v2'
sys.path.insert(0, str(SOURCE))
sys.path.insert(0, str(PREP / 'tools'))
from aseprite import child_env, digest, executable
from puppet_math import ik2
spec = importlib.util.spec_from_file_location('kaida_run_build', SOURCE / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class MotionTests(unittest.TestCase):
    def setUp(self):
        self.design = json.loads((SOURCE / 'design.json').read_text())
        self.poses = json.loads((SOURCE / 'poses.json').read_text())

    def test_authored_motion(self):
        build.verify_motion(self.design, self.poses)

    def test_rejects_one_leg_permanently_planted(self):
        for frame in self.poses['frames']:
            frame['contacts']['far']['planted'] = True
        with self.assertRaises(ValueError):
            build.verify_motion(self.design, self.poses)

    def test_rejects_thigh_offset_from_hips(self):
        frame = self.poses['frames'][0]
        for point in frame['legs']['near']['joints']:
            point[0] += 3
        with self.assertRaisesRegex(ValueError, 'Hip socket detached'):
            build.verify_motion(self.design, self.poses)

    def test_rejects_boot_rotated_without_ground_correction(self):
        self.poses['frames'][0]['legs']['near']['foot_angle'] = 30
        with self.assertRaisesRegex(ValueError, 'foot support'):
            build.verify_motion(self.design, self.poses)

    def test_unreachable_chain_fails_instead_of_stretching(self):
        with self.assertRaisesRegex(ValueError, 'Unreachable'):
            ik2([0, 0], [100, 0], 23, 27)


class SavedPixelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.binary = executable()
        except RuntimeError:
            raise unittest.SkipTest('Build local Aseprite to run saved-pixel regression checks')

    def call(self, script, **params):
        args = [str(self.binary), '--batch']
        for key, value in params.items():
            args += ['--script-param', f'{key}={value}']
        return subprocess.run(args + ['--script', str(script)], env=child_env(), capture_output=True, text=True)

    def rejected_pixels(self, mode, reason):
        (PREP / '.work').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=PREP / '.work', prefix='run-negative-') as tmp:
            work = Path(tmp)
            mutate = work / 'mutate.lua'
            mutate.write_text('''
local s=assert(app.open(app.params.source));local l
for _,layer in ipairs(s.layers) do if layer.name==(app.params.mode=='foot' and 'leg.near' or 'head') then l=layer end end
local c=assert(l:cel(1))
if app.params.mode=='foot' then c.position=Point(c.position.x,c.position.y+4)
else
 local im=Image(s.width,s.height,ColorMode.RGB);im:drawImage(c.image,c.position)
 local color=app.params.mode=='fringe' and app.pixelColor.rgba(255,255,255,100) or app.pixelColor.rgba(181,52,99,255)
 im:drawPixel(5,5,color);s:deleteCel(c);s:newCel(l,1,im,Point(0,0))
end
assert(s:saveAs(app.params.output));s:close()
''')
            candidate = work / 'bad.aseprite'
            self.call(mutate, source=SOURCE / 'animation.aseprite', output=candidate, mode=mode)
            self.assertTrue(candidate.is_file())
            report = work / 'result.json'
            response = self.call(SOURCE / 'verify.lua', source=candidate, design=SOURCE / 'design.json',
                                 poses=SOURCE / 'poses.json', output=report)
            self.assertFalse(report.exists(), 'Corrupt source passed verification')
            self.assertIn(reason, response.stdout + response.stderr)

    def test_rejects_detached_hair_pixel(self):
        self.rejected_pixels('stray', 'Detached pixels')

    def test_rejects_white_alpha_fringe(self):
        self.rejected_pixels('fringe', 'Unexpected alpha fringe')

    def test_rejects_rendered_foot_below_ground(self):
        self.rejected_pixels('foot', 'Rendered boot misses')

    def test_default_command_preserves_edited_timeline(self):
        timeline = SOURCE / 'animation.aseprite'
        before = digest(timeline)
        result = subprocess.run([sys.executable, str(SOURCE / 'build.py')], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Authored timeline exists', result.stderr)
        self.assertEqual(digest(timeline), before)


if __name__ == '__main__':
    unittest.main()
