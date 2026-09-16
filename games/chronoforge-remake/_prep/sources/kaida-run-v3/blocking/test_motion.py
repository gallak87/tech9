"""Regressions for the motion defects that prompted this proof."""
import copy
import json
from pathlib import Path
import unittest
from motion import generate, verify


class MotionRegression(unittest.TestCase):
    def setUp(self):
        self.design=json.loads((Path(__file__).with_name('design.json')).read_text())
        self.poses=generate(self.design)

    def test_complete_motion(self):
        result=verify(self.design,self.poses)
        self.assertTrue(result['both_legs_alternate'])
        self.assertGreater(result['airborne_frames'],0)

    def test_rejects_frozen_left_leg(self):
        frozen=copy.deepcopy(self.poses['frames'][0]['legs']['left'])
        for p in self.poses['frames']:p['legs']['left']=copy.deepcopy(frozen)
        with self.assertRaises(AssertionError):verify(self.design,self.poses)

    def test_rejects_thigh_detached_from_pelvis(self):
        self.poses['frames'][0]['legs']['right']['joints'][0][0]+=12
        with self.assertRaises(AssertionError):verify(self.design,self.poses)

    def test_rejects_ground_penetration(self):
        self.poses['frames'][0]['legs']['right']['joints'][2][1]+=10
        with self.assertRaises(AssertionError):verify(self.design,self.poses)

    def test_rejects_floating_weapon(self):
        self.poses['frames'][0]['weapon']['hand'][0]+=5
        with self.assertRaises(AssertionError):verify(self.design,self.poses)

    def test_rejects_same_leg_contact_timing(self):
        for p in self.poses['frames']:p['contacts']['left']=copy.deepcopy(p['contacts']['right'])
        with self.assertRaises(AssertionError):verify(self.design,self.poses)


if __name__=='__main__':unittest.main()
