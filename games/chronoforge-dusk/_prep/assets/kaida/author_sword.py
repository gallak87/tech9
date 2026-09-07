"""New Blender geometry based on Dusk's separate Kaida sword reference."""
import bpy
import json
import sys
from pathlib import Path

PREP=Path(__file__).resolve().parents[2]
revision=sys.argv[sys.argv.index('--')+1]
assert revision.replace('-','').isalnum()
out=PREP/'assets/kaida.energy-sword/sources'/revision
assert not out.exists(), 'Choose a new source revision'
out.mkdir(parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,metal=0,emission=0):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=.34
    p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=emission
    return mat

dark=material('Graphite guard',(.035,.025,.055),.65)
wrap=material('Dark wrapped grip',(.012,.013,.024),.05)
pink=material('Magenta energy',(.80,.004,.38),.15,1.2)
core=material('Bright pink core',(1,.18,.80),0,2)
edge=material('Guard bevel',(.17,.12,.20),.7)

def prism(name,outline,depth,mat,y=0,bevel=0):
    n=len(outline)
    verts=[(x,y+side*depth/2,z) for side in (-1,1) for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    if bevel:
        mod=obj.modifiers.new('Crisp edge facets','BEVEL')
        mod.width=bevel
        mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    tri=obj.modifiers.new('Explicit triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.select_set(False)
    return obj

prism('Energy blade',[(-.052,.38),(-.066,.46),(-.030,1.04),(0,1.20),(.030,1.04),(.066,.46),(.052,.38),(0,.30)],.018,pink)
for side in (-1,1):
    prism('Blade luminous ridge',[(0,.33),(-.011,.46),(-.007,1.04),(0,1.16),(.007,1.04),(.011,.46)],.0015,core,y=side*.010)
    prism('Energy fork',[(side*.025,.30),(side*.096,.37),(side*.12,.48),(side*.055,.39)],.014,pink)
prism('Guard',[(-.028,.22),(-.15,.315),(-.075,.30),(-.030,.32),(0,.37),(.030,.32),(.075,.30),(.15,.315),(.028,.22),(0,.205)],.047,dark,bevel=.004)
prism('Central guard setting',[(0,.20),(-.041,.275),(0,.365),(.041,.275)],.052,edge,bevel=.003)
for side in (-1,1):
    prism('Guard energy gem',[(0,.232),(-.018,.278),(0,.332),(.018,.278)],.003,pink,y=side*.029)
prism('Grip',[(-.015,.048),(-.015,.223),(.015,.223),(.015,.048)],.028,wrap,bevel=.002)
for i in range(8):
    z=.065+i*.018
    prism('Grip binding',[(-.016,z),(-.016,z+.004),(.016,z+.013),(.016,z+.009)],.030,dark)
prism('Pommel',[(0,0),(-.034,.040),(-.016,.065),(.016,.065),(.034,.040)],.040,dark,bevel=.002)
for side in (-1,1):
    prism('Pommel gem',[(0,.017),(-.009,.038),(0,.051),(.009,.038)],.002,pink,y=side*.021)

bpy.context.scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(out/'master.blend'))
(out/'authoring.json').write_text(json.dumps({'reference':'references/kaida/r1/kaida-energy-sword-r1.png','height_m':1.20,'grip_center_z_m':.135,'origin':'pommel base','status':'First authored separate prop; review pending'},indent=2)+'\n')
