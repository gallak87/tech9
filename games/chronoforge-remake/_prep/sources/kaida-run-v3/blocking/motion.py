"""A right-facing run with constant bone lengths and alternating foot contacts."""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'tools'))
from puppet_math import add, ik2, length, rot, round_tree, sub, track


def pose(d, phase):
    t = phase % 1
    wave = math.cos(math.tau * t)
    root = [d['origin'][0], track([(0,355),(.125,378),(.28,352),(.41,332),(.5,355),(.625,378),(.78,352),(.91,332),(1,355)], t)]
    # Lift the body without changing its lean or the vertical foot tracks.
    # Percentage is measured against the original pelvis-to-ground height.
    pelvis_lift=(d['origin'][1]-d['reference_pelvis'][1])*d['pelvis_raise_fraction']
    root[1]-=pelvis_lift
    hip_angle = 8 * wave
    torso_angle = -3 * wave
    body = lambda p: add(root, rot(p, torso_angle))
    p = {'phase':t, 'duration_ms':d['duration_ms'], 'root':root,
         'hip_angle':hip_angle, 'torso_angle':torso_angle,
         'neck':body([105,-124]), 'head':body([122,-174]),
         'hips':{}, 'legs':{}, 'arms':{}, 'contacts':{}}
    for side, leg_phase in [('right',t),('left',(t+.5)%1)]:
        hip = add(root, rot([8*wave,12] if side=='right' else [-12*wave,16], hip_angle))
        stance = leg_phase < d['stance_end']
        if stance:
            u = leg_phase / d['stance_end']
            x = d['stance_front'] + (d['stance_back']-d['stance_front'])*u
            lift = 0
            angle = track([(0,-18),(.24,0),(.65,0),(1,42)],u)
        else:
            x = track([(.32,-125),(.42,-200),(.52,-185),(.65,-100),(.78,50),(.91,164),(1,200)],leg_phase)
            lift = track([(.32,0),(.42,62),(.52,120),(.65,137),(.78,127),(.91,66),(1,0)],leg_phase)
            angle = track([(.32,42),(.45,82),(.60,75),(.76,12),(.90,-24),(1,-18)],leg_phase)
        support = max(rot(v,angle)[1] for v in d['foot_shape'])
        ankle = [d['origin'][0]+x*d['stride_scale'], d['origin'][1]-lift-support]
        p['hips'][side]=hip
        p['legs'][side]={'joints':ik2(hip,ankle,*d['leg_lengths'],1),'foot_angle':angle}
        p['contacts'][side]={'phase':leg_phase,'planted':stance,'lift':lift,'lowest_y':d['origin'][1]-lift}
        if side=='right':
            shoulder=body([62-22*wave,-114])
            upper,lower=86,80
            # Fold the elbow before bringing the upper arm through. Dropping
            # the whole arm first swings a gripped sword through the floor.
            a=track([(0,168),(.15,170),(.35,122),(.5,100),(1,32)],(1-wave)/2)
            b=track([(0,140),(.25,40),(.5,-35),(1,-15)],(1-wave)/2)
        else:
            shoulder=body([72+40*wave,-115+19*wave])
            upper,lower=75,70
            a=110-55*wave
            b=track([(0,140),(.25,35),(.5,-45),(1,-40)],(1+wave)/2)
        elbow=add(shoulder,rot([upper,0],a))
        wrist=add(elbow,rot([lower,0],b))
        bend=track([(0,15),(.25,-20),(.5,-20),(1,-40)],(1-wave)/2) if side=='right' else 0
        hand_angle=b+bend
        grip=add(wrist,rot([12,0],hand_angle))
        p['arms'][side]={'joints':[shoulder,elbow,wrist],'lengths':[upper,lower],
                         'forearm_angle':b,'wrist_bend':bend,'hand_angle':hand_angle,'grip':grip}
    right=p['arms']['right']
    p['weapon']={'hand':right['grip'], 'angle':right['hand_angle'], 'length':208}
    p['weapon']['tip']=add(p['weapon']['hand'],rot([p['weapon']['length'],0],p['weapon']['angle']))
    return round_tree(p)


def generate(d):
    return {'canvas':d['canvas'],'origin':d['origin'],'clip':d['clip'],'frames':[pose(d,i/d['frames']) for i in range(d['frames'])]}


def verify(d, data):
    frames=data['frames'];n=len(frames)
    assert n==d['frames'] and n%2==0
    stance={side:[] for side in ('right','left')}
    for p in frames:
        assert not all(c['planted'] for c in p['contacts'].values()),'Run has double support'
        for side in stance:
            j=p['legs'][side]['joints'];c=p['contacts'][side]
            assert j[0]==p['hips'][side], 'Detached thigh'
            for a,b,L in zip(j,j[1:],d['leg_lengths']):
                assert abs(length(sub(b,a))-L)<.00001,'Leg length changes'
            a=p['arms'][side]
            for x,y,L in zip(a['joints'],a['joints'][1:],a['lengths']):
                assert abs(length(sub(y,x))-L)<.00001,'Arm length changes'
            bottom=j[2][1]+max(rot(v,p['legs'][side]['foot_angle'])[1] for v in d['foot_shape'])
            assert abs(bottom-c['lowest_y'])<.00001,'Foot/ground disagreement'
            assert bottom<=d['origin'][1]+.00001,'Foot penetrates ground'
            if c['planted']: assert abs(bottom-d['origin'][1])<.00001
            stance[side].append(c['planted'])
        arm=p['arms']['right']
        assert p['weapon']['hand']==arm['grip'], 'Detached sword grip'
        grip=add(arm['joints'][2],rot([12,0],arm['hand_angle']))
        assert length(sub(grip,arm['grip']))<.00001,'Hand detached from wrist'
        assert abs(arm['hand_angle']-arm['forearm_angle']-arm['wrist_bend'])<.00001,'Independent hand rotation'
        assert p['weapon']['angle']==arm['hand_angle'],'Weapon ignores wrist rotation'
        assert -40.00001<=arm['wrist_bend']<=15.00001,'Excessive wrist bend'
        for v in (p['head'],p['weapon']['tip']):
            assert 8<v[0]<d['canvas'][0]-8 and 8<v[1]<d['canvas'][1]-8,'Off-canvas guide'
        assert p['weapon']['tip'][1]<d['origin'][1]-8,'Sword hits ground'
    assert any(not any(c['planted'] for c in p['contacts'].values()) for p in frames),'No flight phase'
    assert stance['right']==stance['left'][n//2:]+stance['left'][:n//2], 'Feet fail to alternate'
    assert 2<=sum(stance['right'])<n//2
    for side in stance:
        assert max(p['contacts'][side]['lift'] for p in frames)>120,'Missing recovery lift'
        contacts=[p for p in frames if p['contacts'][side]['planted']]
        contacts.sort(key=lambda p:p['contacts'][side]['phase'])
        speed=(d['stance_back']-d['stance_front'])*d['stride_scale']/d['stance_end']
        for a,b in zip(contacts,contacts[1:]):
            dx=b['legs'][side]['joints'][2][0]-a['legs'][side]['joints'][2][0]
            dt=b['contacts'][side]['phase']-a['contacts'][side]['phase']
            assert abs(dx-speed*dt)<.00001,'Stance foot speed changes'
    assert pose(d,0)==pose(d,1),'Loop endpoint mismatch'
    for phase in (.25,.75):
        passing=pose(d,phase)
        assert passing['weapon']['tip'][1]<passing['weapon']['hand'][1],'Sword points down during passing'
    # Also exercise the continuous guide between exported frames to catch unreachable IK.
    for i in range(256):
        between=pose(d,i/256)
        assert between['weapon']['tip'][1]<d['origin'][1]-8,'Sword hits ground between frames'
    return {'result':'passed','frames':n,'stance_frames_per_leg':sum(stance['right']),
            'airborne_frames':sum(not any(c['planted'] for c in p['contacts'].values()) for p in frames),
            'constant_limb_lengths':True,'both_legs_alternate':True,'grip_attached':True,
            'fixed_ground':True,'continuous_guide_samples':256,'loop_endpoint_equal':True,
            'weapon_inherits_hand_rotation':True,'passing_blade_points_up':True,
            'pelvis_lift_px':(d['origin'][1]-d['reference_pelvis'][1])*d['pelvis_raise_fraction'],
            'horizontal_stride_scale':d['stride_scale']}
