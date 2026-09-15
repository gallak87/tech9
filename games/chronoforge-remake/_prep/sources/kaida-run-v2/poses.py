"""Eight deliberately posed run drawings, with pelvis-owned hip sockets and foot support."""
import json,math,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]/'tools'))
from puppet_math import add,sub,rot,ik2,track,round_tree

def generate(design):
    gait=design['gait'];O=design['origin'];frames=[]
    for i in range(design['frames']):
        t=i/design['frames'];wave=math.cos(math.tau*t)
        bob=track([(0,0),(.25,2),(.50,-.5),(.75,-3.5),(1,0)],(t*2)%1)
        hip_angle=gait['hip_swing_degrees']*wave
        root=[O[0]-2,90+bob]
        torso_angle=-hip_angle*.32
        # Full-body lean is drawn into these anatomical positions, before small counter-rotation.
        def body(p):return add(root,rot(sub(p,[108,90]),torso_angle))
        shoulders={'near':body([110,57]),'far':body([121,60])}
        pose={'duration_ms':design['duration_ms'],'phase':t,'root':root,'hip_angle':hip_angle,'torso_angle':torso_angle,
              'neck':body([123,48]),'shoulders':shoulders,'hips':{},'legs':{},'arms':{},'contacts':{}}
        for side,phase in [('near',t),('far',(t+.5)%1)]:
            hip=add(root,rot([2,3] if side=='near' else [-4,1],hip_angle))
            duty=gait['duty'];planted=phase<duty
            if planted:
                travel=gait['half_stride']*(1-2*phase/duty);lift=0
                toe=track([(0,-6),(.25,0),(.65,0),(1,24)],phase/duty)
            else:
                u=(phase-duty)/(1-duty)
                travel=track([(0,-gait['half_stride']),(.25,-18),(.62,4),(1,gait['half_stride'])],u)
                lift=gait['recovery_lift']*math.sin(math.pi*u)**1.15
                toe=track([(0,24),(.32,55),(.67,-8),(1,-6)],u)
            support=max(rot(p,toe)[1] for p in design['foot_shape'])
            ankle=[O[0]+travel+(-2 if side=='far' else 1),O[1]-lift-support]
            chain=ik2(hip,ankle,gait['upper_leg'],gait['lower_leg'],1)
            pose['hips'][side]=hip
            pose['legs'][side]={'joints':chain,'foot_angle':toe}
            pose['contacts'][side]={'planted':planted,'lift':lift,'support':support,'phase':phase,'ground_y':O[1]-lift}
        for side in ('near','far'):
            shoulder=shoulders[side]
            if side=='near':
                a=12*wave+torso_angle;b=12*wave+torso_angle
                elbow=add(shoulder,rot([-13,8],a));wrist=add(elbow,rot([-8,13],b))
            else:
                a=-14*wave+torso_angle;b=-16*wave+torso_angle
                elbow=add(shoulder,rot([6,15],a));wrist=add(elbow,rot([12,-5],b))
            pose['arms'][side]={'joints':[shoulder,elbow,wrist],'hand_angle':b}
        frames.append(pose)
    return round_tree({'schema':1,'canvas':design['canvas'],'origin':O,'clip':design['clip'],'loop':True,'frames':frames})

if __name__=='__main__':
    (HERE/'poses.json').write_text(json.dumps(generate(json.loads((HERE/'design.json').read_text())),indent=2)+'\n')
