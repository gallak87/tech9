"""Deterministic animation poses, with two-bone leg IK and explicit foot contacts.

All coordinates are fixed-canvas pixels. Source pixels are transformed in Aseprite;
this module only authors motion and registration metadata.
"""
import json
import math
from pathlib import Path

HERE=Path(__file__).resolve().parent
STATES={'idle':(12,100,True),'walk':(12,80,True),'run':(12,60,True),
        'attack':(10,70,False),'cast':(10,90,False),'hurt':(6,70,False),
        'defend':(8,100,True),'victory':(10,100,True),'down':(8,110,False)}

def add(a,b): return [a[0]+b[0],a[1]+b[1]]
def sub(a,b): return [a[0]-b[0],a[1]-b[1]]
def mul(a,n): return [a[0]*n,a[1]*n]
def length(a): return math.hypot(*a)
def rotate(p,degrees):
    a=math.radians(degrees);c,s=math.cos(a),math.sin(a)
    return [p[0]*c-p[1]*s,p[0]*s+p[1]*c]
def transform(p,pivot,position,angle): return add(position,rotate(sub(p,pivot),angle))
def smooth(t): return t*t*(3-2*t)
def mix(a,b,t): return a+(b-a)*t

def track(keys,t):
    for (ta,a),(tb,b) in zip(keys,keys[1:]):
        if t<=tb: return mix(a,b,smooth(max(0,(t-ta)/(tb-ta))))
    return keys[-1][1]

def ik(hip,ankle,L1,L2,bend=1):
    v=sub(ankle,hip);d=length(v)
    # A tiny bend avoids a singular straight knee. The authored contacts must be reachable.
    d=max(.001,min(d,L1+L2-.025))
    unit=mul(v,1/max(.001,length(v)))
    actual=add(hip,mul(unit,d))
    along=(L1*L1-L2*L2+d*d)/(2*d)
    height=math.sqrt(max(0,L1*L1-along*along))
    knee=add(add(hip,mul(unit,along)),mul([unit[1],-unit[0]],height*bend))
    return [hip,knee,actual]

def rounded(value):
    if isinstance(value,float):return round(value,4)
    if isinstance(value,list):return [rounded(x) for x in value]
    if isinstance(value,dict):return {k:rounded(v) for k,v in value.items()}
    return value

def generate(spec):
    rig={'schema':2,'canvas':spec['canvas'],'origin':spec['origin'],'views':{},'clips':[]}
    for view_name,view in spec['views'].items():
        X,Y,_,_=view['crop'];f=spec['downsample']
        ox=math.floor(spec['origin'][0]+(X-view['center'])/f+.5)
        oy=math.floor(spec['origin'][1]+(Y-spec['source_ground'])/f+.5)
        def point(p):return [ox+(p[0]-X)/f,oy+(p[1]-Y)/f]
        bind={}
        waist,neck=point(view['waist']),point(view['neck'])
        for name,pivot in [('pelvis',waist),('torso',waist),('head',neck),('coat.back',waist)]:
            bind[name]={'type':'rigid','pivot':pivot}
        for side in ('near','far'):
            for kind in ('leg','arm'):
                chain=[point(p) for p in view[kind+'s'][side]]
                bind[kind+'.'+side]={'type':'mesh','chain':chain,'tip_angle':0,'joint_blend':4 if kind=='leg' else 3}
        bind['weapon']={'type':'rigid','pivot':bind['arm.near']['chain'][2]}
        rig['views'][view_name]={'master':'master-'+view_name+'.aseprite','bind':bind}
        for state,(count,ms,loop) in STATES.items():
            clip={'name':state+'.'+view_name,'view':view_name,'loop':loop,'frames':[]}
            for i in range(count):
                t=i/count if loop else i/(count-1)
                wave=math.sin(t*math.tau);breath=1-math.cos(t*math.tau)
                lateral=view_name=='right'
                root=[0,0];lean=0;pelvis_angle=0;head_angle=0;coat_angle=0
                arm_angles={'near':0,'far':0};elbow_bend={'near':0,'far':0}
                weapon_extra=0;leg_mode='stand';attack=0
                if state=='idle':
                    root[1]=-breath*.4;head_angle=-wave*.6;arm_angles={'near':wave*.9,'far':-wave*.7};coat_angle=wave*1.5
                elif state in ('run','walk'):
                    running=state=='run';leg_mode=state
                    # Hip descends after each contact, then rises into the flight/pass pose.
                    half=(t*2)%1
                    root[1]=track([(0,9 if running else 3),(.30,12 if running else 4),(.72,3 if running else 0),(1,9 if running else 3)],half)
                    lean=13 if running and lateral else (4 if lateral else 0)
                    pelvis_angle=3 if running and lateral else 0
                    head_angle=-lean*.45
                    coat_angle=(12 if running else 4)+(4 if running else 2)*math.sin(t*math.tau-.6)
                    for side,phase in [('near',t),('far',(t+.5)%1)]:
                        sw=math.cos(phase*math.tau)
                        # Counter-swing to the leg. A held blade uses a compact arm arc.
                        arm_angles[side]=(15 if running else 2)+(28 if running else 13)*sw if lateral else (5 if running else 2)*sw
                        elbow_bend[side]=(-75 if running else -15) if lateral else (-8 if side=='near' else 8)
                    weapon_extra=35 if running and lateral else (12 if lateral else 0)
                elif state=='attack':
                    attack=track([(0,0),(.22,-1),(.4,-1),(.55,1),(.7,1),(.88,.3),(1,0)],t)
                    root=[attack*(13 if lateral else 1),abs(attack)*5]
                    lean=attack*(16 if lateral else 3);pelvis_angle=lean*.25;head_angle=-lean*.4
                    arm_angles['near']=track([(0,0),(.23,115),(.4,125),(.56,-90),(.72,-65),(1,0)],t)*(1 if view_name!='up' else -1)
                    elbow_bend['near']=track([(0,0),(.23,-35),(.4,-45),(.56,-12),(.72,-20),(1,0)],t)
                    arm_angles['far']=-attack*30;elbow_bend['far']=-abs(attack)*35
                    coat_angle=-attack*12;weapon_extra=track([(0,0),(.35,10),(.56,-20),(1,0)],t)
                elif state=='cast':
                    charge=math.sin(math.pi*t)**.7
                    root[1]=-charge*2;lean=-3*charge if lateral else 0;head_angle=-3*charge
                    arm_angles['far']=-85*charge if view_name!='up' else 75*charge
                    elbow_bend['far']=-55*charge
                    arm_angles['near']=18*charge;elbow_bend['near']=-20*charge;weapon_extra=10*charge
                    coat_angle=math.sin(t*math.tau*2)*3*charge
                elif state=='hurt':
                    recoil=track([(0,0),(.2,1),(.5,.7),(1,0)],t)
                    root=[-recoil*8 if lateral else 0,recoil*5];lean=-recoil*14 if lateral else recoil*4
                    head_angle=-recoil*9;arm_angles={'near':recoil*28,'far':-recoil*20};coat_angle=recoil*12
                elif state=='defend':
                    root[1]=6-breath*.25;lean=8 if lateral else 0;head_angle=-4
                    arm_angles={'near':-66+wave*1.5,'far':-35};elbow_bend={'near':-70,'far':-50};weapon_extra=-15
                elif state=='victory':
                    root[1]=-breath*.8;head_angle=-5
                    arm_angles['near']=155+wave*3 if view_name!='up' else -155+wave*3
                    elbow_bend['near']=-15;arm_angles['far']=12;weapon_extra=10;coat_angle=wave*3
                elif state=='down':
                    collapse=smooth(t);root=[-collapse*10 if lateral else 0,collapse*12]
                    lean=-collapse*24 if lateral else collapse*10;head_angle=-collapse*15
                    arm_angles={'near':collapse*40,'far':collapse*60};elbow_bend={'near':-collapse*25,'far':collapse*25};coat_angle=collapse*18;weapon_extra=collapse*50 if lateral else 0
                waist_dst=add(waist,root)
                parts={}
                parts['pelvis']={'position':waist_dst,'angle':pelvis_angle}
                parts['torso']={'position':waist_dst,'angle':lean}
                parts['head']={'position':transform(neck,waist,waist_dst,lean),'angle':lean+head_angle}
                parts['coat.back']={'position':waist_dst,'angle':pelvis_angle+coat_angle}
                contacts={}
                for side,phase in [('near',t%1),('far',(t+.5)%1)]:
                    chain=bind['leg.'+side]['chain'];hip,knee,ankle=chain
                    hip_dst=transform(hip,waist,waist_dst,pelvis_angle)
                    ankle_dst=ankle[:];foot_angle=0
                    ground_y=spec['origin'][1]-(view['foot_y'][side]-view['legs'][side][2][1])/f
                    # Bind view's perspective has a slight difference in foot depth.
                    ground_y-=0 if side=='near' or view_name!='right' else 2
                    ankle_dst[1]=ground_y
                    stance=True
                    if leg_mode in ('walk','run'):
                        running=leg_mode=='run';duty=.36 if running else .62
                        stance=phase<duty
                        if stance:
                            progress=phase/duty
                            travel=mix(27 if running else 20,-27 if running else -20,progress)
                            lift=0
                            foot_angle=track([(0,-8),(.22,0),(.72,0),(1,24 if running else 12)],progress) if lateral else 0
                        else:
                            u=(phase-duty)/(1-duty)
                            travel=track([(0,-27 if running else -20),(.27,-30 if running else -15),(.67,18 if running else 8),(1,27 if running else 20)],u)
                            lift=(40 if running else 13)*math.sin(math.pi*u)**.9
                            foot_angle=track([(0,24 if running else 12),(.4,65 if running else 22),(.78,-18),(1,-8)],u) if lateral else 0
                        if lateral:
                            # Both legs cross the same running lane, separated only by depth.
                            hip_dst[0]=waist_dst[0]+(-5 if side=='near' else 5)
                            ankle_dst=[waist[0]+travel+(-4 if side=='near' else 4),ground_y-lift]
                        else:
                            # Perspective stride: depth is vertical; preserve left/right lanes.
                            ankle_dst[0]=ankle[0]+(2 if running else 1)*math.sin(phase*math.tau)
                            ankle_dst[1]=ground_y+travel*.28-lift*.65
                            hip_dst[0]+=wave*(1 if side=='near' else -1)
                    elif state=='attack':
                        ankle_dst[0]+=(8 if side=='far' else -4)*abs(attack)
                    elif state=='down':
                        ankle_dst[0]+=(-5 if side=='near' else 5)*t
                    L1,L2=length(sub(knee,hip)),length(sub(ankle,knee))
                    bend=1 if lateral else (1 if hip[0]<waist[0] else -1)
                    joints=ik(hip_dst,ankle_dst,L1,L2,bend)
                    if not lateral:
                        # Toward/away motion foreshortens in depth. Bending sideways
                        # would look like a kick, so the knee stays in its own lane.
                        knee_y=mix(hip_dst[1],ankle_dst[1],.49)
                        if leg_mode in ('walk','run') and not stance:
                            knee_y-=lift*.2
                        knee_x=mix(hip_dst[0],ankle_dst[0],.52)
                        joints=[hip_dst,[knee_x,knee_y],ankle_dst]
                    parts['leg.'+side]={'joints':joints,'tip_angle':foot_angle}
                    contacts[side]={'planted':stance,'phase':phase,'ankle':joints[2], 'requested_ankle':ankle_dst}
                for side in ('near','far'):
                    shoulder,elbow,wrist=bind['arm.'+side]['chain']
                    shoulder_dst=transform(shoulder,waist,waist_dst,lean)
                    upper_angle=lean+arm_angles[side]
                    elbow_dst=add(shoulder_dst,rotate(sub(elbow,shoulder),upper_angle))
                    lower_angle=upper_angle+elbow_bend[side]
                    wrist_dst=add(elbow_dst,rotate(sub(wrist,elbow),lower_angle))
                    if not lateral and state in ('run','walk'):
                        sw=math.cos((t+(0 if side=='near' else .5))*math.tau)
                        running=state=='run';outside=-1 if shoulder[0]<waist[0] else 1
                        elbow_dst=[shoulder_dst[0]+outside*5,shoulder_dst[1]+(24 if running else 27)]
                        wrist_dst=[elbow_dst[0]+outside*(3+sw*2),elbow_dst[1]+(15 if running else 24)+sw*(7 if running else 3)]
                        lower_angle=sw*(8 if running else 3)
                    parts['arm.'+side]={'joints':[shoulder_dst,elbow_dst,wrist_dst],'tip_angle':lower_angle}
                    if side=='near':parts['weapon']={'position':wrist_dst,'angle':lower_angle+weapon_extra}
                if state=='down':
                    # A controlled fall, pivoting near the feet, finishes lying on the ground.
                    a=-82*smooth(t);pivot=[spec['origin'][0],spec['origin'][1]-20]
                    all_points=[]
                    for name,part in parts.items():
                        if 'joints' in part:
                            part['joints']=[transform(p,pivot,pivot,a) for p in part['joints']];part['tip_angle']+=a
                            all_points+=part['joints']
                        else:part['position']=transform(part['position'],pivot,pivot,a);part['angle']+=a
                    # Keep the horizontal body inside a fixed canvas, anchored at the original feet.
                    for part in parts.values():
                        if 'joints' in part:part['joints']=[add(p,[90*smooth(t),-25*smooth(t)]) for p in part['joints']]
                        else:part['position']=add(part['position'],[90*smooth(t),-25*smooth(t)])
                clip['frames'].append({'duration_ms':ms,'parts':parts,'contacts':contacts})
            rig['clips'].append(clip)
    # Left is an independently editable turn derived from the three-quarter view.
    # Its right-hand sword changes depth (near -> far), rather than swapping hands.
    rig['views']['left']={'master':'master-right.aseprite','derived_from':'right','bind':rig['views']['right']['bind']}
    for clip in list(rig['clips']):
        if clip['view']!='right':continue
        left=json.loads(json.dumps(clip));left['name']=clip['name'].replace('.right','.left');left['view']='left';left['mirror']=True
        for frame in left['frames']:
            parts=frame['parts'];near,far=parts['arm.near'],parts['arm.far']
            # Swap the keyed gestures, keeping their shoulder attachments and limb lengths.
            ns,fs=near['joints'][0],far['joints'][0]
            near['joints'],far['joints']=([add(ns,sub(p,fs)) for p in far['joints']], [add(fs,sub(p,ns)) for p in near['joints']])
            near['tip_angle'],far['tip_angle']=far['tip_angle'],near['tip_angle']
            parts['weapon']['position']=far['joints'][2]
            if left['name'].startswith('run.'):parts['weapon']['angle']-=12
            elif left['name'].startswith('walk.'):parts['weapon']['angle']-=6
        rig['clips'].append(left)
    order={'idle':0,'walk':1,'run':2,'attack':3,'cast':4,'hurt':5,'defend':6,'victory':7,'down':8}
    directions={'right':0,'left':1,'down':2,'up':3}
    rig['clips'].sort(key=lambda c:(order[c['name'].split('.')[0]],directions[c['view']]))
    return rounded(rig)

if __name__=='__main__':
    spec=json.loads((HERE/'parts.json').read_text())
    (HERE/'rig.json').write_text(json.dumps(generate(spec),separators=(',',':'))+'\n')
