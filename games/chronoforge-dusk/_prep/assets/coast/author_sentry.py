"""Original mechanical practice opponent for the encounter-staging POC.
Uses Dusk's existing local material/mesh helpers and skeletal recipe. No acquired
character, copied enemy, or changes to Kaida. Five small authored mechanical clips.
"""
import runpy,sys,math,json,hashlib
from pathlib import Path
from mathutils import Vector
PREP=Path(__file__).resolve().parents[2]
sys.argv=[str(__file__),'--','r1','sentry']
a=runpy.run_path(str(PREP/'assets/coast/author_coast.py'))
bpy=a['bpy'];box=a['box'];cyl=a['cyl'];beam=a['beam'];torus=a['torus']
rig_data=bpy.data.armatures.new('Sentry mechanism');rig=bpy.data.objects.new('SentryRig',rig_data);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,head,tail,parent in [('Root',(0,0,0),(0,.2,0),None),('Body',(0,0,.8),(0,0,1.2),'Root'),('Lens',(0,.4,1.25),(0,.7,1.25),'Body')]:
 b=rig_data.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=rig_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)

def bind(o,bone):
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
 o.parent=rig;g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Mechanism weights','ARMATURE');m.object=rig;return o
teal=a['teal'];rust=a['rust'];dark=a['darkstone'];amber=a['plain']('Amber practice lens',(1.0,.35,.055),2.2)
for i in range(3):
 t=i*math.tau/3+math.pi/2;x,y=.62*math.cos(t),.62*math.sin(t)
 bind(box('Anchor foot',(x,y,.07),(.4,.43,.14),rust,.04),'Root')
 bind(beam('Splayed support',(x,y,.15),(x*.55,y*.55,.57),.11,teal),'Root')
bind(cyl('Base turntable',(0,0,.53),.46,.19,rust,24),'Root')
bind(cyl('Rotary collar',(0,0,.74),.31,.20,teal,24),'Body')
bind(box('Salvaged housing',(0,0,1.2),(1.22,.87,.7),teal,.16),'Body')
bind(box('Upper armor',(0,-.04,1.57),(1.36,.93,.14),rust,.055),'Body')
for x in [-.57,.57]:
 bind(box('Armor cheek',(x,.15,1.2),(.2,.73,.48),rust,.065),'Body')
 for z in [1.04,1.35]:
  b=cyl('Cheek fastener',(x,.535,z),.045,.04,rust,8);b.rotation_euler.x=math.pi/2;bind(b,'Body')
for x in [-.8,.8]:
 bind(box('Service outrigger',(x,0,1.04),(.24,.5,.3),teal,.07),'Body')
 bind(cyl('Cooling fin',(x,-.12,1.26),.15,.22,rust,12),'Body')
for y in [-.34,-.18,0,.18,.34]:bind(box('Top cooling rib',(0,y,1.69),(.64,.045,.12),dark,.012),'Body')
lens=cyl('Lens casing',(0,.53,1.25),.29,.32,rust,32);lens.rotation_euler.x=math.pi/2;bind(lens,'Lens')
eye=cyl('Amber optic',(0,.703,1.25),.215,.035,amber,32);eye.rotation_euler.x=math.pi/2;bind(eye,'Lens')
bind(box('Optic slit',(0,.729,1.25),(.045,.024,.3),dark,.008),'Lens')
bind(beam('Aerial',(-.43,-.25,1.62),(-.43,-.25,1.95),.025,rust),'Body')
bind(cyl('Aerial cap',(-.43,-.25,1.965),.045,.04,amber,10),'Body')
# Flexible collar gives the two rigid mechanisms a real deforming connection.
verts=[];faces=[]
for j in range(4):
 z=.48+j*.105
 for i in range(16):
  t=i*math.tau/16;verts.append((math.cos(t)*.21,math.sin(t)*.21,z))
for j in range(3):
 for i in range(16):faces.append((j*16+i,j*16+(i+1)%16,(j+1)*16+(i+1)%16,(j+1)*16+i))
o=a['mesh']('Flexible coupling',verts,faces,dark);bind(o,'Root');g=o.vertex_groups.new(name='Body')
for v in o.data.vertices:
 w=max(.05,min(.95,(v.co.z-.48)/.315));o.vertex_groups['Root'].add([v.index],1-w,'REPLACE');g.add([v.index],w,'REPLACE')
rig.animation_data_create();bpy.context.scene.render.fps=30
for role,frames in [('idle',60),('walk',30),('run',24),('attack',27),('hurt',18)]:
 action=bpy.data.actions.new(role);action.use_fake_user=True;rig.animation_data.action=action
 for frame in range(1,frames+2):
  t=(frame-1)/frames;wave=math.sin(t*math.tau);pulse=math.sin(t*math.pi)
  for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
  body=rig.pose.bones['Body'];eye=rig.pose.bones['Lens']
  if role=='idle':body.rotation_euler.z=.05*wave;eye.rotation_euler.x=.025*wave
  elif role in ['walk','run']:body.rotation_euler.x=.07*wave;body.rotation_euler.z=.1*wave
  elif role=='attack':body.rotation_euler.x=-.14*pulse;eye.location.y=-.06*pulse
  else:body.rotation_euler.x=.3*pulse;body.rotation_euler.z=-.15*pulse
  for b in rig.pose.bones:
   b.keyframe_insert(data_path='rotation_euler',frame=frame,group=b.name);b.keyframe_insert(data_path='location',frame=frame,group=b.name)
rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
for material in list(bpy.data.materials):
 if material.users==0:bpy.data.materials.remove(material)
bpy.context.scene.unit_settings.scale_length=1
height=max((o.matrix_world@v.co).z for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices)
folder=PREP/'assets/practice.sentry/sources/r1';assert not folder.exists();folder.mkdir(parents=True)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'master.blend'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
meta={'production_format':1,'asset_id':'practice.sentry','revision':'r1','label':'Practice sentry / encounter staging stand-in','kind':'character','animation_mode':'skeletal','placeholder':True,'recipe':'skeletal_blend','source_files':[{'path':str(p.relative_to(PREP)),'role':role,'sha256':sha(p)} for p,role in [(folder/'master.blend','editable_master'),(Path(__file__),'authoring_script'),(PREP/'assets/coast/author_coast.py','material_geometry_helpers')]],'required_outputs':['runtime/model.glb','runtime/descriptor.json','working/export.blend','inspection.json','reimport.json'],'dimensions':{'height_m':height,'radius_m':.48,'forward':'-Z','up':'+Y','origin':'ground'},'dependencies':[],'attachments':[],'root_motion':{'operation':'remove_root_xy','armature':'SentryRig','bone':'Root'},'clips':{r:{'name':r,'loop':r in ['idle','walk','run']} for r in ['idle','walk','run','attack','hurt']},'provenance':{'origin':'Original mechanical staging stand-in, authored in Blender for the owner-authorized encounter POC.','attribution':'Dusk local material/geometry helpers only; no external models, animation or textures.','scope':'Three-bone mechanism with authored motion, not a final enemy or proof of humanoid production.'}}
(folder.parents[1]/'asset.json').write_text(json.dumps(meta,indent=2)+'\n')
