"""Original small coastal workshop; same shell outside and inside, metre scale.
Reuses only Dusk's local coastal material/geometry helpers. Separate shell groups
allow game-owned cutaway visibility; no character or pipeline changes.
"""
import runpy,sys,json,hashlib
from pathlib import Path
PREP=Path(__file__).resolve().parents[2]
sys.argv=[str(__file__),'--','r1','workshop']
a=runpy.run_path(str(PREP/'assets/coast/author_coast.py'))
bpy=a['bpy'];box=a['box'];cyl=a['cyl'];beam=a['beam']
stone=a['stone'];wood=a['wood'];teal=a['teal'];rust=a['rust'];concrete=a['concrete'];light=a['light']
# Blender Y maps to Godot -Z. South/entry is negative Blender Y.
box('Floor',(0,0,.09),(6.4,5.2,.18),concrete)
for side,x in [('West',-3.05),('East',3.05)]:
    box(side+'Wall',(x,0,1.95),(.3,5.2,3.54),stone,.045)
    for y in [-2.35,2.35]:box(side+'Pier',(x,y,1.97),(.46,.42,3.58),concrete)
box('NorthWall',(0,2.45,1.95),(6.4,.3,3.54),stone,.045)
# Two piers, lintel and recessed timber door preserve a 1.8 m clear opening.
for x in [-2.05,2.05]:box('SouthWall',(x,-2.45,1.95),(2.3,.3,3.54),stone,.045)
box('SouthWall lintel',(0,-2.45,3.33),(1.8,.3,.78),concrete)
box('Door',(0,-2.46,1.56),(1.72,.13,2.76),wood)
for x in [-.77,.77]:box('Door binding',(x,-2.55,1.56),(.09,.04,2.65),rust,.008)
box('Door handle',(.57,-2.59,1.39),(.07,.06,.29),teal,.015)
box('SouthWall lamp mount',(1.11,-2.66,2.53),(.18,.24,.4),rust)
box('SouthWall lamp glass',(1.11,-2.8,2.54),(.11,.03,.24),light,.01)
# Teal salvaged metal roof, timber underside and transverse rafters.
box('Roof',(0,0,3.84),(6.85,5.65,.24),teal,.045)
for y in [-2.4,0,2.4]:box('Roof rafter',(0,y,3.61),(6.1,.18,.27),wood)
for x in [-2.7,-1.8,-.9,0,.9,1.8,2.7]:box('Roof standing seam',(x,0,3.99),(.055,5.57,.07),rust,.008)
# A believable work surface and reclaimed electrical equipment.
box('Bench top',(0,1.65,1.02),(3.0,.84,.14),wood)
for x in [-1.28,1.28]:
    for y in [1.36,1.94]:box('Bench leg',(x,y,.55),(.13,.13,.93),rust)
box('Cabinet',(2.36,1.56,1.1),(.77,.86,1.84),teal)
box('Cabinet face',(2.36,1.105,1.1),(.65,.04,1.66),wood)
for z in [.6,.74,.88]:box('Cabinet vent',(2.36,1.075,z),(.42,.03,.028),rust,.006)
for x in [-.8,.8]:box('Bench supply',(x,1.63,1.28),(.5,.48,.38),teal)
beam('NorthWall utility pipe',(-2.6,2.20,.35),(-2.6,2.20,3.25),.055,rust)
beam('NorthWall utility pipe',(-2.6,2.20,3.25),(2.4,2.20,3.25),.055,rust)
box('NorthWall power strip',(0,2.19,2.3),(1.1,.09,.25),teal)
box('NorthWall indicator',(0,2.13,2.3),(.8,.015,.04),light,.006)
# Named meshes survive export; cutaways are intentional parts, not a second mesh.
for obj in list(bpy.context.scene.objects):
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.select_set(False)
for material in list(bpy.data.materials):
    if material.users==0:bpy.data.materials.remove(material)
bpy.context.scene.unit_settings.scale_length=1
folder=PREP/'assets/coast.workshop/sources/r1';assert not folder.exists();folder.mkdir(parents=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'master.blend'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
meta={'production_format':1,'asset_id':'coast.workshop','revision':'r1','label':'Coastal workshop / room camera POC','kind':'prop','animation_mode':'none','placeholder':False,'recipe':'static_blend','source_files':[{'path':str(p.relative_to(PREP)),'role':role,'sha256':sha(p)} for p,role in [(folder/'master.blend','editable_master'),(Path(__file__),'authoring_script'),(PREP/'assets/coast/author_coast.py','material_geometry_helpers')]],'required_outputs':['runtime/model.glb','runtime/descriptor.json','working/export.blend','inspection.json','reimport.json'],'dimensions':{'height_m':4.025,'radius_m':3.425,'forward':'-Z','up':'+Y','origin':'ground'},'dependencies':[],'attachments':[],'provenance':{'origin':'Original Blender geometry for owner-authorized room/camera POC following 06.','attribution':'Dusk original; existing local coastal material helpers only; no external assets.'}}
(folder.parents[1]/'asset.json').write_text(json.dumps(meta,indent=2)+'\n')
