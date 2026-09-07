#!/usr/bin/env python3
"""Encode the dedicated native capture's exact frame inventory as animated WebP.
Run after `python3 tools/native.py capture-environment`. Pillow is required only
for this evidence artifact, not for the game, asset preparation or export.
"""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
DATA=Path.home()/'Library/Application Support/Godot/app_userdata/Chronoforge Dusk'
report=json.loads((DATA/'test_environment_motion.json').read_text())
assert report['failures']==0 and not report['identity']['test_interference']
times=report['observations']['frame_times_ms']
frames=[Image.open(DATA/'environment-motion'/f'frame-{i:04d}.png').convert('RGB') for i in range(len(times))]
durations=[max(50,min(500,b-a)) for a,b in zip(times,times[1:])]+[700]
out=ROOT/'evidence/environment-06/coastal-traversal.webp'
frames[0].save(out,save_all=True,append_images=frames[1:],duration=durations,loop=0,quality=77,method=4)
print(out,len(frames),'frames',out.stat().st_size,'bytes')
