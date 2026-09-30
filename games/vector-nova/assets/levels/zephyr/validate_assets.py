"""CPU validation of the exported Zephyr GLBs, without Blender or a renderer."""

import json
import math
import struct
import sys
from pathlib import Path


APP = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[3])
SOURCE = APP / "assets/levels/zephyr"
PUBLIC = APP / "public/assets/levels/zephyr"
manifest = json.loads((SOURCE / "asset-manifest.json").read_text())


def sub(a,b):
    return tuple(a[i]-b[i] for i in range(3))


def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def dot(a,b):
    return sum(x*y for x,y in zip(a,b))


def overlap_triangle_box(tri, lo, hi):
    center=tuple((a+b)/2 for a,b in zip(lo,hi))
    half=tuple((b-a)/2 for a,b in zip(lo,hi))
    points=[sub(p,center) for p in tri]
    edges=[sub(points[(i+1)%3],points[i]) for i in range(3)]
    axes=[(1,0,0),(0,1,0),(0,0,1),cross(edges[0],edges[1])]
    axes.extend(cross(edge,axis) for edge in edges for axis in [(1,0,0),(0,1,0),(0,0,1)])
    for axis in axes:
        projected=[dot(p,axis) for p in points]
        radius=sum(abs(axis[i])*half[i] for i in range(3))
        if min(projected)>radius+1e-6 or max(projected)<-radius-1e-6:
            return False
    return True


def read_glb(path):
    blob=path.read_bytes()
    magic,version,length=struct.unpack_from("<III",blob,0)
    assert magic==0x46546c67 and version==2 and length==len(blob),path
    size,kind=struct.unpack_from("<II",blob,12)
    assert kind==0x4e4f534a
    g=json.loads(blob[20:20+size])
    binsize,binkind=struct.unpack_from("<II",blob,20+size)
    assert binkind==0x004e4942
    binary=blob[28+size:28+size+binsize]
    return g,binary


def accessor(g,blob,index):
    a=g["accessors"][index]
    view=g["bufferViews"][a["bufferView"]]
    fmt={5120:"b",5121:"B",5122:"h",5123:"H",5125:"I",5126:"f"}[a["componentType"]]
    width={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    count=a["count"]
    size=struct.calcsize("<"+fmt*width)
    stride=view.get("byteStride",size)
    start=view.get("byteOffset",0)+a.get("byteOffset",0)
    return [struct.unpack_from("<"+fmt*width,blob,start+i*stride) for i in range(count)]


results=[]
for asset in manifest["assets"]:
    path=PUBLIC/(asset["root"]+".glb")
    g,binary=read_glb(path)
    assert not g.get("images") and not g.get("textures"),"Unexpected texture dependency"
    assert len(g["meshes"])==asset["meshCount"]
    assert all(not any(key in node for key in ("rotation","translation","scale","matrix")) for node in g["nodes"]),"Coordinates must be baked Y-up"
    vertices=[]
    triangle_count=0
    intersections=0
    degenerates=0
    clear=asset.get("clearEnvelope")
    if clear and "x" in clear:
        lo=(clear["x"][0],clear["y"][0],clear["z"][0])
        hi=(clear["x"][1],clear["y"][1],clear["z"][1])
    for mesh in g["meshes"]:
        for p in mesh["primitives"]:
            assert p.get("mode",4)==4
            pos=accessor(g,binary,p["attributes"]["POSITION"])
            normal=accessor(g,binary,p["attributes"]["NORMAL"])
            assert all(math.isfinite(x) for v in pos for x in v)
            assert all(abs(dot(v,v)-1)<1e-3 for v in normal),"Nonunit normal"
            vertices.extend(pos)
            ids=[r[0] for r in accessor(g,binary,p["indices"])]
            assert len(ids)%3==0
            triangle_count+=len(ids)//3
            for i in range(0,len(ids),3):
                tri=[pos[ids[j]] for j in range(i,i+3)]
                n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]))
                if dot(n,n)<1e-12:
                    degenerates+=1
                if clear and "x" in clear and overlap_triangle_box(tri,lo,hi):
                    intersections+=1
    assert triangle_count==asset["triangles"],(path.name,triangle_count,asset["triangles"])
    bounds={"min":[min(v[i] for v in vertices) for i in range(3)],"max":[max(v[i] for v in vertices) for i in range(3)]}
    for key in ["min","max"]:
        assert max(abs(x-y) for x,y in zip(bounds[key],asset["bounds"][key]))<.001
    assert intersections==0,(path.name,"clear-envelope intersection",intersections)
    assert degenerates==0,(path.name,"degenerate triangle",degenerates)
    tested=bool(clear and "x" in clear)
    result={"asset":path.name,"triangles":triangle_count,"meshes":len(g["meshes"]),
            "clearEnvelopeTested":tested,"clearEnvelopeIntersections":intersections if tested else None,
            "degenerateTriangles":degenerates}
    results.append(result)
print(json.dumps({"result":"PASS","assets":results,"gpuOrBrowserUsed":False},indent=2))
