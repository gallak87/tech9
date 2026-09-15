"""Geometry for arbitrary layered characters; no character names or limb-count assumptions."""
import math

def add(a,b):return [a[0]+b[0],a[1]+b[1]]
def sub(a,b):return [a[0]-b[0],a[1]-b[1]]
def length(p):return math.hypot(*p)
def rot(p,angle):
    a=math.radians(angle);c,s=math.cos(a),math.sin(a)
    return [c*p[0]-s*p[1],s*p[0]+c*p[1]]
def ik2(root,end,upper,lower,bend=1):
    v=sub(end,root);d=length(v)
    if not abs(upper-lower)+.001<d<upper+lower-.001:
        raise ValueError(f'Unreachable contact: distance {d:.3f}, bone lengths {upper:.3f}/{lower:.3f}')
    unit=[v[0]/d,v[1]/d];along=(upper*upper-lower*lower+d*d)/(2*d)
    height=math.sqrt(max(0,upper*upper-along*along))
    return [root,[root[0]+unit[0]*along+unit[1]*height*bend,root[1]+unit[1]*along-unit[0]*height*bend],end]

def smooth(t):return t*t*(3-2*t)
def track(keys,t):
    for (ta,a),(tb,b) in zip(keys,keys[1:]):
        if t<=tb:
            u=smooth(max(0,(t-ta)/(tb-ta)));return a+(b-a)*u
    return keys[-1][1]

def round_tree(x):
    if isinstance(x,float):return round(x,6)
    if isinstance(x,list):return [round_tree(v) for v in x]
    if isinstance(x,dict):return {k:round_tree(v) for k,v in x.items()}
    return x
