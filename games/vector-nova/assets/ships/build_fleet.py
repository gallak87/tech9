"""Original fleet geometry from the generated Shrike/Bastion/Needle concepts.
Run from the app: blender --background --threads 6 --python assets/ships/build_fleet.py
Optional: -- --ship shrike --render. Game coordinates: +Z nose, +Y up.
Mesh/beam/nozzle construction helpers are adapted from our Kestrel exporter.
"""
import bpy, bmesh, math, json, sys, argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--ship', choices=['shrike','bastion','needle','all'], default='all')
parser.add_argument('--render', action='store_true')
opts = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

def surface_finish(mat, kind):
    """Editable procedural paint/metal finish; baked to portable PBR on export."""
    nodes=mat.node_tree.nodes; links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    base=tuple(bsdf.inputs['Base Color'].default_value)
    rough=bsdf.inputs['Roughness'].default_value
    coords=nodes.new('ShaderNodeNewGeometry')
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4
    noise.inputs['Detail'].default_value=3;links.new(coords.outputs['Position'],noise.inputs['Vector'])
    variation=nodes.new('ShaderNodeValToRGB')
    variation.color_ramp.elements[0].color=(.84,.86,.88,1)
    variation.color_ramp.elements[1].color=(1,1,1,1)
    links.new(noise.outputs['Fac'],variation.inputs[0])
    color=nodes.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=1
    color.inputs[1].default_value=base;links.new(variation.outputs['Color'],color.inputs[2])
    links.new(color.outputs[0],bsdf.inputs['Base Color'])
    scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY'
    scale.inputs[1].default_value=(1,1,38) if kind in ('metal','darkmetal') else (1,1,1)
    links.new(coords.outputs['Position'],scale.inputs[0])
    grain=nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=95 if kind=='pearl' else 150
    grain.inputs['Detail'].default_value=2
    links.new(scale.outputs['Vector'],grain.inputs['Vector'])
    roughness=nodes.new('ShaderNodeMapRange');roughness.inputs['From Min'].default_value=0
    roughness.inputs['From Max'].default_value=1
    roughness.inputs['To Min'].default_value=max(.1,rough-.10)
    roughness.inputs['To Max'].default_value=min(.7,rough+.15)
    links.new(grain.outputs['Fac'],roughness.inputs['Value']);links.new(roughness.outputs[0],bsdf.inputs['Roughness'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13
    bump.inputs['Distance'].default_value=.007 if kind=='pearl' else .003
    links.new(grain.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    return {'color':color.outputs[0],'roughness':roughness.outputs[0]}

def bake_finish(obj, material, channels, directory, size=1024):
    """Bake color, roughness and tangent normals, then wire glTF-supported nodes."""
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    nodes=material.node_tree.nodes;links=material.node_tree.links
    bsdf=nodes.get('Principled BSDF');output=nodes.get('Material Output')
    emission=nodes.new('ShaderNodeEmission')
    baked={}
    bpy.context.scene.cycles.samples=8
    bpy.context.scene.render.bake.margin=8
    for channel in ('color','roughness','normal'):
        image=bpy.data.images.new(material.name+'_'+channel,width=size,height=size,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='color' else 'Non-Color'
        target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        if channel=='normal':
            links.new(bsdf.outputs[0],output.inputs['Surface'])
            bpy.ops.object.bake(type='NORMAL')
        else:
            links.new(channels[channel],emission.inputs['Color'])
            links.new(emission.outputs[0],output.inputs['Surface'])
            bpy.ops.object.bake(type='EMIT')
        image.filepath_raw=str(directory/(material.name+'_'+channel+'.png'));image.file_format='PNG';image.save()
        baked[channel]=image
    # Simplify export material, leaving procedural source in the saved blend.
    for node in list(nodes):
        if node not in (bsdf,output):nodes.remove(node)
    links.new(bsdf.outputs[0],output.inputs['Surface'])
    for channel,image in baked.items():
        texture=nodes.new('ShaderNodeTexImage');texture.image=image
        if channel=='normal':
            normal=nodes.new('ShaderNodeNormalMap');links.new(texture.outputs['Color'],normal.inputs['Color'])
            links.new(normal.outputs[0],bsdf.inputs['Normal'])
        else:links.new(texture.outputs['Color'],bsdf.inputs['Base Color' if channel=='color' else 'Roughness'])

def C(v): return (v[0], -v[2], v[1])
def material(name, color, metal=0, rough=.3, emission=None):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*color,1); mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*color,1)
    node.inputs['Metallic'].default_value=metal
    node.inputs['Roughness'].default_value=rough
    if emission:
        node.inputs['Emission Color'].default_value=(*emission[0],1)
        node.inputs['Emission Strength'].default_value=emission[1]
    if 'Ceramic' in name or 'Glass' in name:
        node.inputs['Coat Weight'].default_value=.22
        node.inputs['Coat Roughness'].default_value=.13
    return mat

def mesh(name, vertices, faces, mat, bevel=0, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([C(v) for v in vertices],[],faces)
    data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(data); bm.free()
    obj = bpy.data.objects.new(name,data); ship.objects.link(obj)
    obj.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    if smooth or bevel:
        for poly in data.polygons: poly.use_smooth=True
    if bevel:
        mod = obj.modifiers.new('Machined edge radii','BEVEL')
        mod.width=bevel; mod.segments=3; mod.affect='EDGES'
        mod.limit_method='ANGLE'; mod.angle_limit=.30
        mod.harden_normals=True
        normals=obj.modifiers.new('Area weighted panel normals','WEIGHTED_NORMAL')
        normals.keep_sharp=True; normals.weight=35
    return obj

def solid(name, outline, thickness, mat, bevel=.01):
    # Extrudes an authored 3D top polygon down by thickness in game Y.
    n=len(outline)
    verts=outline+[(x,y-thickness,z) for x,y,z in outline]
    faces=[tuple(range(n)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,bevel)

def beam(name, a,b,width,depth,mat='darkmetal',bevel=.008):
    # Rectangular beam with oriented section, primarily in XZ plane.
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    transverse=Vector((0,1,0)).cross(axis).normalized()
    up=axis.cross(transverse).normalized()
    verts=[]
    for p in (a,b):
        for u,v in ((-1,-1),(-1,1),(1,1),(1,-1)):
            verts.append(tuple(p+transverse*(u*width/2)+up*(v*depth/2)))
    return mesh(name,verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],mat,bevel)

def line(name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'
    curve.resolution_u=1; curve.bevel_depth=radius; curve.bevel_resolution=1
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*C(co),1)
    obj=bpy.data.objects.new(name,curve);ship.objects.link(obj);curve.materials.append(M[mat])
    return obj

OCT=[(-.66,1),(.66,1),(1,.56),(1,-.56),(.66,-1),(-.66,-1),(-1,-.56),(-1,.56)]
def oct_ring(cx,cy,z,rx,ry): return [(cx+x*rx,cy+y*ry,z) for x,y in OCT]
def duct(name,cx,cy,stations,mat,cap_front=True,cap_back=False,bevel=.012):
    verts=[]
    for z,rx,ry in stations:verts+=oct_ring(cx,cy,z,rx,ry)
    faces=[]
    for j in range(len(stations)-1):
        for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
    if cap_front:faces.append(tuple(range(8)))
    if cap_back:faces.append(tuple(range((len(stations)-1)*8,len(stations)*8)))
    return mesh(name,verts,faces,mat,bevel)

def oct_annulus(name,cx,cy,z,outer,inner,mat,bevel=.005,depth=.035):
    verts=oct_ring(cx,cy,z,outer[0],outer[1])+oct_ring(cx,cy,z,inner[0],inner[1])+oct_ring(cx,cy,z+depth,outer[0],outer[1])+oct_ring(cx,cy,z+depth,inner[0],inner[1])
    faces=[]
    for i in range(8):
        j=(i+1)%8
        faces += [(i,j,8+j,8+i),(i,16+i,16+j,j),(8+i,8+j,24+j,24+i),(16+i,24+i,24+j,16+j)]
    return mesh(name,verts,faces,mat,bevel)

def loft(name, stations, mat, cx=0, bevel=.012):
    # z, half-width, shoulder, crown, belly: six planar faces per section.
    vertices=[]
    for z,w,y,top,bottom in stations:
        vertices += [(cx-w,y,z),(cx-w*.60,top,z),(cx+w*.60,top,z),
                     (cx+w,y,z),(cx+w*.77,bottom,z),(cx-w*.77,bottom,z)]
    faces=[tuple(range(5,-1,-1)),tuple(range((len(stations)-1)*6,len(stations)*6))]
    for j in range(len(stations)-1):
        for k in range(6): faces.append((j*6+k,j*6+(k+1)%6,(j+1)*6+(k+1)%6,(j+1)*6+k))
    return mesh(name,vertices,faces,mat,bevel)

def mirrored_panel(name, outline, thickness, mat, bevel=.015):
    for sign in (-1,1):
        solid(name+str(sign),[(sign*x,y,z) for x,y,z in outline],thickness,mat,bevel)

def crescent_skin(sign):
    # Formed aerofoil sections give the broad wing a crown and taper instead
    # of extruding a flat polygon. The front edge retains the crescent notch.
    sections=[(.43,1.24,-1.62,.55,.72),(.88,.74,-2.0,.55,.72),
        (1.23,.55,-2.28,.54,.70),(1.62,.81,-1.78,.47,.61),
        (1.88,1.11,-1.08,.39,.51),(2.14,1.42,.30,.32,.365)]
    vertices=[]
    for x,front,rear,y,crown in sections:
        vertices += [(sign*x,y,front),(sign*x,crown,front*.72+rear*.28),
            (sign*x,crown-.02,front*.2+rear*.8),(sign*x,y-.02,rear),
            (sign*x,y-.07,rear+.025),(sign*x,crown-.105,front*.46+rear*.54),
            (sign*x,y-.06,front-.02)]
    faces=[tuple(range(7)),tuple(range((len(sections)-1)*7,len(sections)*7))]
    for j in range(len(sections)-1):
        for k in range(7):faces.append((j*7+k,j*7+(k+1)%7,(j+1)*7+(k+1)%7,(j+1)*7+k))
    mesh('Crescent ceramic wing skin'+str(sign),vertices,faces,'pearl',.022)

def cockpit(length=2.4, width=.33, z=0, height=.52):
    stations=[(1,.015,.0),(.86,.5,.13),(.57,.9,.25),(.12,1,.33),(-.42,.87,.28),(-.85,.45,.12),(-1,.025,0)]
    def catmull(p0,p1,p2,p3,t): return .5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
    dense=[]
    for i in range(len(stations)-1):
        for step in range(5):
            dense.append(tuple(catmull(stations[max(0,i-1)][k],stations[i][k],stations[i+1][k],stations[min(len(stations)-1,i+2)][k],step/5) for k in range(3)))
    dense.append(stations[-1])
    dense=[(zz,ww,hh*.78) for zz,ww,hh in dense]
    verts=[]; segments=20
    for zz,ww,hh in dense:
        for j in range(segments+1):
            angle=-math.pi/2+math.pi*j/segments
            verts.append((math.sin(angle)*ww*width,height+hh*max(0,math.cos(angle))**.75,z+zz*length/2))
    faces=[]; n=segments+1
    for k in range(len(dense)-1):
        for j in range(segments):faces.append((k*n+j,k*n+j+1,(k+1)*n+j+1,(k+1)*n+j))
    mesh('Low smoked flight canopy',verts,faces,'glass',0,True)
    for sign in (-1,1):
        line('Canopy titanium seal',[(sign*w*width,height+.005,z+zz*length/2) for zz,w,h in stations],.014,'darkmetal')
    # Visible transverse cockpit frame, flush against the aft glass.
    zz,ww,hh=stations[4]
    line('Canopy rear frame',[(math.sin(-math.pi/2+math.pi*j/20)*ww*width,
        height+hh*.78*max(0,math.cos(-math.pi/2+math.pi*j/20))**.75+.008,z+zz*length/2) for j in range(21)],.014,'edge')

def engine(label,cx,cy,aft,radius):
    ry=radius*.86
    duct('Graphite power housing '+label,cx,cy,[(aft+1.55,radius*.73,ry*.78),
        (aft+1.05,radius,ry),(aft+.35,radius,ry)],'carbon',True,False,.017)
    # Eight separately formed titanium shroud panels and a true recessed throat.
    for k in range(8):
        a=Vector(OCT[k]); b=Vector(OCT[(k+1)%8]); mid=(a+b)*.5
        a=mid+(a-mid)*.975; b=mid+(b-mid)*.975
        points=[]
        for zz,scale in [(aft+.8,1.04),(aft+.43,1.10),(aft+.06,.98)]:
            for v,t in [(a,1),(b,1),(b,.94),(a,.94)]:
                points.append((cx+v.x*radius*scale*t,cy+v.y*ry*scale*t,zz))
        faces=[(0,1,2,3),(8,11,10,9)]
        for j in range(2):
            for q in range(4):faces.append((j*4+q,j*4+(q+1)%4,(j+1)*4+(q+1)%4,(j+1)*4+q))
        mesh('Titanium thermal petal '+label+str(k),points,faces,'metal',.006)
    oct_annulus('Retaining band '+label,cx,cy,aft+.46,(radius*1.115,ry*1.115),(radius*1.085,ry*1.085),'machined',.004,.055)
    oct_annulus('Nozzle rim '+label,cx,cy,aft,(radius,ry),(radius*.81,ry*.81),'machined',.007,.08)
    duct('Recessed ceramic throat '+label,cx,cy,[(aft+.02,radius*.82,ry*.82),(aft+.42,radius*.65,ry*.65)],'vent',False,True,.004)
    oct_annulus('Ion power aperture '+label,cx,cy,aft+.12,(radius*.79,ry*.79),(radius*.69,ry*.69),'cyan',.004,.035)
    oct_annulus('Inner induction coil '+label,cx,cy,aft+.35,(radius*.66,ry*.66),(radius*.58,ry*.58),'dimcyan',.003,.025)
    empty=bpy.data.objects.new('Exhaust_'+label,None);ship.objects.link(empty)
    empty.location=C((cx,cy,aft-.015));empty.empty_display_type='ARROWS';empty.empty_display_size=.15
    empty['game_position']=[cx,cy,aft-.015]
    anchors[empty.name]=[cx,cy,aft-.015]

def fin(sign,x,z,height=.85,sweep=.7):
    outline=[(sign*x,.65,z),(sign*(x+.24),.65+height,z-sweep),
        (sign*(x+.29),.67+height,z-sweep-.45),(sign*(x+.1),.62,z-1.0)]
    solid('Canted stabiliser',outline,.047,'pearl',.011)
    beam('Fin leading carbon edge',outline[0],outline[1],.025,.028,'edge',.004)
    beam('Fin accent tip',outline[1],outline[2],.028,.034,'accent',.004)

def vent(name,x,y,z,width=.30,length=.7):
    solid(name+' recessed well',[(x-width/2,y,z),(x+width/2,y,z),
        (x+width/2,y,z-length),(x-width/2,y,z-length)],.05,'vent',.008)
    for i in range(7):
        zz=z-.05-i*(length-.12)/6
        beam(name+' louvre', (x-width*.43,y+.008,zz),(x+width*.43,y+.008,zz-.025),.035,.025,'darkmetal',.003)

def shrike():
    loft('Compact graphite monocoque',[(3.2,.03,.20,.23,.14),(2.3,.25,.35,.42,.10),
        (1.2,.45,.48,.54,.09),(-.35,.51,.51,.57,.08),(-1.65,.34,.48,.57,.10),(-2.92,.13,.28,.40,.17)],'carbon')
    mirrored_panel('Ceramic central prow',[(.035,.25,3.16),(.31,.40,2.05),(.47,.56,1.00),
        (.35,.56,.64),(.26,.47,1.55),(.035,.27,2.92)],.055,'pearl')
    # Crescent wings have a concave leading edge and swept, thin trailing edges.
    wing=[(.42,.51,1.24),(.88,.52,.74),(1.23,.51,.55),(1.62,.44,.81),
        (2.14,.31,1.42),(2.12,.38,.30),(1.87,.48,-1.12),(1.43,.52,-2.28),(.55,.51,-1.62)]
    mirrored_panel('Crescent graphite wing frame',wing,.20,'carbon')
    for sign in (-1,1):crescent_skin(sign)
    # Inset vent beds sit between upper shell panels and the engine saddles.
    for sign in (-1,1):
        vent('Wing cooling intake',sign*.91,.606,-.04,.30,.63)
        beam('Exposed wing torsion spar',(sign*.52,.30,.25),(sign*1.90,.28,.48),.075,.09,'metal')
        beam('Wing trailing brace',(sign*.50,.22,-1.30),(sign*1.78,.31,-.86),.08,.08)
        engine('L' if sign<0 else 'R',sign*1.15,.56,-2.94,.36)
        fin(sign,1.21,-1.65,.83,.73)
        loft('Ceramic nacelle saddle', [(-.62,.22,.73,.78,.63),(-1.11,.34,.90,.96,.64),(-2.12,.30,.91,.95,.68)],'pearl',sign*1.15)
        oct_annulus('Nacelle front intake',sign*1.15,.73,-.595,(.22,.15),(.17,.11),'edge',.006,.07)
        duct('Nacelle intake shadow',sign*1.15,.73,[(-.60,.176,.116),(-.64,.176,.116)],'vent',True,False,.002)
        for j in range(5):
            y=.66+j*.036
            beam('Front intake protective grille',(sign*1.15-.135,y,-.583),(sign*1.15+.135,y,-.583),.012,.01,'darkmetal',.002)
        beam('Wing cyan marker',(sign*1.15,.75,-.67),(sign*1.15,.75,-.66),.21,.014,'dimcyan',.002)
    mirrored_panel('Teal swept wing stripe',[(1.50,.483,.76),(1.61,.468,.87),(1.98,.405,-.07),
        (2.01,.40,-.31),(1.84,.456,-.57),(1.71,.491,-.24)],.009,'accent',.003)
    cockpit(2.65,.34,.38,.55)
    vent('Rear spine radiator',0,.56,-1.1,.27,.87)
    line('Nose standby light',[(0,.32,2.77),(0,.405,2.18)],.019,'dimcyan')

def bastion():
    loft('Recessed central cockpit bridge',[(1.39,.29,.33,.42,.11),(1.05,.43,.46,.53,.09),
        (-.49,.45,.51,.58,.08),(-1.53,.30,.47,.59,.1),(-2.81,.27,.27,.43,.12)],'carbon')
    mirrored_panel('Cockpit ceramic rim',[(.31,.44,1.36),(.47,.56,.75),(.48,.61,-.71),
        (.29,.59,-1.73),(.20,.50,-1.92),(.31,.58,-.55),(.34,.55,.72)],.07,'pearl')
    cockpit(1.99,.33,-.02,.55)
    for sign in (-1,1):
        cx=sign*1.28
        stations=[(3.3,.22,.34,.42,.16),(2.91,.35,.42,.53,.11),(2.02,.43,.48,.61,.08),
            (.91,.47,.51,.67,.08),(-.72,.50,.52,.72,.10),(-1.80,.46,.53,.68,.12),(-2.42,.37,.48,.61,.13)]
        loft('Long narrow sponson skeleton',stations,'carbon',cx)
        # Individual armor plates expose joints, intake recesses and cross braces.
        loft('Forward chisel armor',[(z,w*.99,y+.10,t+.10,t-.045) for z,w,y,t,b in stations[:3]],'pearl',cx)
        loft('Aft shoulder armor',[(z,w*1.01,y+.08,t+.08,t-.05) for z,w,y,t,b in stations[3:]],'pearl',cx)
        for edge in (-1,1):
            xx=cx+edge*.31
            solid('Longitudinal armor rail',[(xx-.095,.66,2.0),(xx+.095,.66,2.0),
                (xx+.10,.74,.82),(xx-.10,.74,.82)],.08,'pearl')
        vent('Exposed sponson heat exchanger',cx,.675,1.99,.36,1.16)
        for zz in (.84,-1.29):
            beam('Open channel cross bridge',(sign*.32,.23,zz),(cx,.22,zz-.23),.17,.13,'metal',.014)
            beam('Open channel diagonal',(sign*.31,.19,zz-.50),(cx,.20,zz-.13),.075,.08,'carbon')
        engine('L' if sign<0 else 'R',cx,.51,-3.28,.43)
        loft('Slim rear engine armor', [(-1.67,.29,.76,.86,.69),(-2.2,.43,.84,.92,.71),(-2.68,.38,.79,.88,.69)],'pearl',cx)
        # Brass bands follow the chisel profile and mark the cross bridge.
        solid('Brass forward armor band',[(cx-.41,.68,2.08),(cx+.41,.68,2.08),
            (cx+.42,.70,1.88),(cx-.42,.70,1.88)],.025,'accent',.005)
        line('Sponson running light',[(cx-.13,.39,3.311),(cx+.13,.39,3.311)],.017,'dimcyan')
        for j in range(5):
            z=-.9-j*.16
            beam('Outer thermal vane',(cx+sign*.48,.30,z),(cx+sign*.51,.55,z-.10),.04,.033,'darkmetal',.006)
    vent('Central tail radiator',0,.47,-1.7,.39,.83)
    solid('Central brass bridge band',[(-.31,.626,-.95),(.31,.626,-.95),(.3,.628,-1.13),(-.3,.628,-1.13)],.015,'accent',.004)

def needle():
    # Broader concept 03: the main hull carries the width, not just small fins.
    loft('Full spear monocoque',[(3.5,.025,.21,.24,.15),(2.72,.25,.33,.39,.11),
        (1.61,.51,.44,.53,.08),(.50,.80,.51,.60,.08),(-.65,1.06,.51,.66,.10),
        (-1.62,.92,.55,.70,.12),(-2.74,.53,.57,.70,.13)],'carbon',bevel=.025)
    loft('Single ceramic prow',[(3.43,.021,.245,.258,.21),(2.71,.20,.39,.42,.32),
        (1.71,.39,.56,.61,.45)],'pearl',bevel=.018)
    mirrored_panel('Broad formed shoulder armor',[(.21,.405,2.63),(.51,.61,1.21),(.89,.75,.29),
        (1.14,.77,-.67),(1.00,.78,-1.78),(.70,.89,-2.35),(.47,.89,-2.26),
        (.49,.68,-.77),(.42,.61,.81)],.14,'pearl',.025)
    mirrored_panel('Swept tail wing',[(.88,.48,-.88),(2.05,.32,-2.82),(1.49,.40,-2.66),
        (.75,.49,-1.93)],.10,'pearl',.02)
    mirrored_panel('Forward canard',[(.49,.43,1.14),(1.27,.33,.29),(1.13,.34,.13),(.54,.45,.49)],.065,'pearl')
    mirrored_panel('Violet tail accent',[(1.92,.35,-2.75),(1.63,.39,-2.31),
        (1.52,.41,-2.29),(1.81,.372,-2.72)],.012,'accent',.003)
    for sign in (-1,1):
        fin(sign,1.03,-1.61,.80,.75)
        beam('Rear wing graphite rail',(sign*.85,.36,-1.64),(sign*1.99,.27,-2.78),.047,.05,'edge')
        beam('Forward exposed spar',(sign*.25,.22,2.14),(sign*.74,.29,.17),.11,.11,'darkmetal')
        for j in range(9):
            z=.50-j*.21
            beam('Side heat exchanger',(sign*.82,.27,z),(sign*1.01,.49,z-.11),.06,.044,'metal',.006)
        line('Shoulder mechanical conduit',[(sign*.71,.32,.81),(sign*1.00,.36,-.44),(sign*.84,.41,-1.61)],.034,'darkmetal')
        vent('Shoulder heat rejection cassette',sign*.79,.77,-.11,.28,.53)
    cockpit(2.60,.38,.23,.625)
    engine('C',0,.64,-3.49,.61)
    loft('Integrated central engine cowling',[(-1.06,.39,.77,.86,.66),(-1.68,.55,.96,1.08,.78),
        (-2.59,.54,.97,1.10,.79)],'pearl')
    vent('Central engine cooling inlet',0,1.112,-1.82,.47,.63)

def export_ship(id):
    global ship,M,anchors
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    ship=bpy.data.collections.new(id.upper()+' | editable components');scene.collection.children.link(ship)
    anchors={}
    accent={'shrike':(.025,.36,.39),'bastion':(.75,.34,.065),'needle':(.39,.08,.72)}[id]
    palette={'pearl':((.48,.51,.52),.16,.34),'carbon':((.024,.034,.039),.28,.385),
        'edge':((.016,.022,.026),.52,.25),'vent':((.007,.011,.014),.2,.36),
        'metal':((.40,.355,.294),.91,.30),'darkmetal':((.092,.12,.135),.8,.34),
        'machined':((.56,.535,.48),.95,.205),'glass':((.009,.021,.027),.64,.105),
        'accent':(accent,.30,.27)}
    M={key:material(id+'_'+('Ceramic' if key=='pearl' else 'Glass' if key=='glass' else key),*args) for key,args in palette.items()}
    M['cyan']=material(id+'_Power',(.02,.20,.24),.28,.23,((.12,.75,.89),2.4))
    M['dimcyan']=material(id+'_Standby',(.011,.05,.064),.4,.26,((.02,.24,.31),.5))
    globals()[id]()
    # Small real apertures break up large armor panels and reveal the dark
    # structural layer beneath. The louvres are physical meshes, not decals.
    if id=='shrike':
        for sign in (-1,1):
            target=next(o for o in ship.objects if o.name.startswith('Crescent ceramic wing skin'+str(sign)))
            bpy.ops.mesh.primitive_cube_add(size=1,location=C((sign*.91,.70,-.35)))
            cutter=bpy.context.object;cutter.dimensions=(.36,.72,1.2)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            modifier=target.modifiers.new('Recessed cooling aperture','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
            bpy.context.view_layer.objects.active=target;bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
    if id=='needle':
        for sign in (-1,1):
            target=next(o for o in ship.objects if o.name.startswith('Broad formed shoulder armor'+str(sign)))
            bpy.ops.mesh.primitive_cube_add(size=1,location=C((sign*.79,.8,-.36)))
            cutter=bpy.context.object;cutter.dimensions=(.30,.58,1.2)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            modifier=target.modifiers.new('Recessed shoulder cassette','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
            bpy.context.view_layer.objects.active=target;bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
    # Project livery and sparse service seams onto the actual evaluated armor,
    # preserving the faceted surface and avoiding coplanar/floating decals.
    bpy.context.view_layer.update()
    depsgraph=bpy.context.evaluated_depsgraph_get()
    surfaces=[BVHTree.FromObject(obj,depsgraph) for obj in ship.objects
        if obj.type=='MESH' and obj.data.materials[0]==M['pearl']]
    def height(x,z):
        hits=[tree.ray_cast(Vector(C((x,3,z))),Vector((0,0,-1)),4)[0] for tree in surfaces]
        hits=[hit.z for hit in hits if hit is not None]
        return max(hits) if hits else None
    def paint(name,coords,mat='accent'):
        if any(height(x,z) is None for x,z in coords):return
        bm=bmesh.new();v=[bm.verts.new(C((x,height(x,z)+.005,z))) for x,z in coords]
        bm.faces.new(v);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=8,use_grid_fill=True)
        for v in bm.verts:
            h=height(v.co.x,-v.co.y)
            if h is not None:v.co.z=h+.005
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
        obj=bpy.data.objects.new(name,data);ship.objects.link(obj);data.materials.append(M[mat])
    def seam(coords):
        points=[]
        for (x0,z0),(x1,z1) in zip(coords,coords[1:]):
            for j in range(24):
                t=j/23;x=x0*(1-t)+x1*t;z=z0*(1-t)+z1*t;h=height(x,z)
                if h is not None:points.append((x,h+.001,z))
        if len(points)>1:line('Armor service joint',points,.004,'edge')
    # Use Blender's built-in vector font, projected onto one continuous panel.
    # Its top points aft (-Z), so it reads correctly from the front inspection
    # view; custom top-to-bottom segment coordinates previously mirrored it.
    number={'shrike':'08','bastion':'09','needle':'10'}[id]
    x0,z0={'shrike':(1.30,.40),'bastion':(1.04,-.46),'needle':(.55,-.72)}[id]
    font=bpy.data.curves.new('Chassis '+number,'FONT');font.body=number
    font.size=.41;font.space_character=1.12;font.resolution_u=5
    label=bpy.data.objects.new('Chassis stencil '+number,font);ship.objects.link(label)
    bpy.ops.object.select_all(action='DESELECT');label.select_set(True);bpy.context.view_layer.objects.active=label
    bpy.ops.object.convert(target='MESH')
    bm=bmesh.new();bm.from_mesh(label.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=3,use_grid_fill=True)
    for v in bm.verts:
        x=x0+v.co.x;z=z0-v.co.y;h=height(x,z)
        if h is None:raise ValueError('Chassis marking leaves the armor panel')
        v.co=C((x,h+.006,z))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(label.data);bm.free()
    label.data.materials.append(M['edge'])
    for sign in (-1,1):
        x,z={'shrike':(.68,.59),'bastion':(1.57,2.50),'needle':(.56,.65)}[id]
        for j in range(3):
            paint('Service access warning',[(sign*(x+u*.09),z-j*.09-v*.04) for u,v in [(0,0),(1,0),(.74,1),(-.26,1)]])
    for sign in (-1,1):
        if id=='shrike':
            paint('Swept teal identity band',[(sign*x,z) for x,z in [(1.65,.68),(1.77,.78),(2.05,.20),(2.0,-.19),(1.85,-.49),(1.72,-.32)]])
            for coords in [[(.51,.87),(.95,.35),(1.39,.22),(1.8,.49)],[(.59,-.9),(1.06,-1.08),(1.55,-.88),(1.91,-.56)],[(1.49,.60),(1.42,-.17),(1.61,-.64)]]:
                seam([(sign*x,z) for x,z in coords])
        if id=='bastion':
            for z in [2.69,2.35,.40,-.27,-1.12]:
                seam([(sign*.95,z),(sign*1.25,z-.04),(sign*1.59,z-.11)])
            seam([(sign*1.02,.81),(sign*1.0,-.52),(sign*1.09,-1.74)])
            paint('Brass aft service strip',[(sign*x,z) for x,z in [(1.51,-.90),(1.61,-.94),(1.64,-1.65),(1.54,-1.61)]])
        if id=='needle':
            for coords in [[(.12,2.8),(.23,2.51)],[(.28,1.70),(.43,1.50)],[(.45,.74),(.73,.49)],
                           [(.90,-.62),(1.08,-.77)],[(.49,-1.34),(.77,-1.51),(.96,-1.45)]]:
                seam([(sign*x,z) for x,z in coords])
            paint('Violet spear stripe',[(sign*x,z) for x,z in [(.06,3.04),(.09,2.91),(.17,2.21),(.13,2.29)]])
            paint('Violet shoulder identity',[(sign*x,z) for x,z in [(.72,.39),(.79,.27),(.87,-.10),(.81,-.04)]])
        # Machined fasteners remain subordinate to the silhouette.
        for x,z in ({'shrike':[(.70,.64),(1.70,-.55),(1.02,-1.23)],
                     'bastion':[(1.54,2.34),(1.57,.38),(1.01,-1.03)],
                     'needle':[(.35,.63),(.44,-.51),(.32,1.09)]}[id]):
            x*=sign;h=height(x,z)
            if h is None:continue
            bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=.005,location=C((x,h+.004,z)))
            obj=bpy.context.object
            for col in list(obj.users_collection):col.objects.unlink(obj)
            ship.objects.link(obj);obj.name='Flush service fastener';obj.data.materials.append(M['darkmetal'])
    # Low induction shoes and a purposeful ribbed belly, common fleet technology.
    for sign in (-1,1):
        x=sign*({'shrike':.6,'bastion':1.28,'needle':.30}[id])
        solid('Induction shoe',[(x-.10,.075,1.3),(x+.10,.075,1.3),
            (x+.10,.075,-1.7),(x-.10,.075,-1.7)],.055,'darkmetal')
        line('Induction status bus',[(x,.023,.95),(x,.023,-1.3)],.013,'dimcyan')
    source=ROOT/'assets/ships'/id; output=ROOT/'public/assets/ships'/id
    review=ROOT/'.experiments/fleet-blender'/id
    for path in (source,output,review):path.mkdir(parents=True,exist_ok=True)
    texture_directory=source/'textures';texture_directory.mkdir(exist_ok=True)
    finishes={M[kind].name:surface_finish(M[kind],kind) for kind in ('pearl','carbon','metal','darkmetal')}
    # Neutral studio is editable in the blend and excluded from export.
    studio=bpy.data.collections.new('STUDIO | not exported');scene.collection.children.link(studio)
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene['asset']=id;scene['design_reference']='concept-03.png' if id=='needle' else 'concept-02.png'
    scene['coordinate_contract']='metres, +Z forward / +Y up after glTF export'
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.31,.34,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.225
    def aim(obj,target):obj.rotation_euler=(Vector(C(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    for name,pos,power,size,color in [('Key',(-4,7,4),1450,6,(1,.91,.82)),('Fill',(2,6,1),1050,4,(.78,.87,1)),('Rim',(-2,4,-7),1800,5,(1,.91,.80))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=C(pos);aim(obj,(0,.4,0))
    data=bpy.data.cameras.new('Studio camera');cam=bpy.data.objects.new('Studio camera',data);studio.objects.link(cam)
    scene.camera=cam;cam.location=C((8,6.5,10.5));data.lens=58;aim(cam,(0,.4,0))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source/(id+'.blend')))
    components=list(ship.objects);exports=[]
    for obj in components:
        dup=obj.copy()
        if obj.data:dup.data=obj.data.copy()
        scene.collection.objects.link(dup);exports.append(dup)
        if obj.type=='EMPTY':obj.name='SOURCE_'+obj.name;dup.name=obj.name.replace('SOURCE_','')
        obj.hide_render=True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in exports:
        if obj.type in ('MESH','CURVE'):
            obj.select_set(True);bpy.context.view_layer.objects.active=obj
            bpy.ops.object.convert(target='MESH');obj.select_set(False)
    exported_anchors=[obj for obj in exports if obj.type=='EMPTY']
    groups={}
    for obj in exports:
        if obj.type=='MESH':groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    joined=[]
    for name,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        obj=bpy.context.object;obj.name=name+'_Geometry';joined.append(obj)
        tri=obj.modifiers.new('Export triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    for obj in joined:
        mat=obj.data.materials[0]
        if mat.name in finishes:
            bake_finish(obj,mat,finishes[mat.name],texture_directory,1024 if 'Ceramic' in mat.name else 512)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined+exported_anchors:obj.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    bpy.ops.export_scene.gltf(filepath=str(output/(id+'.glb')),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
    vertices=[o.matrix_world@v.co for o in joined for v in o.data.vertices]
    game=[(v.x,v.z,-v.y) for v in vertices]
    bounds={'min':[min(v[k] for v in game) for k in range(3)],'max':[max(v[k] for v in game) for k in range(3)]}
    report={'asset':id,'blender':bpy.app.version_string,'bounds':bounds,
        'triangles':sum(len(o.data.polygons) for o in joined),'meshes':len(joined),'anchors':anchors,
        'sourceComponents':len(components),'glbBytes':(output/(id+'.glb')).stat().st_size,
        'textures':'Embedded base color, roughness and tangent normal maps; original procedural Blender materials',
        'textureCount':len(finishes)*3}
    (source/'asset-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print('FLEET_ASSET '+json.dumps(report),flush=True)
    if opts.render:
        for name,pos in [('front',(8,6.5,10.5)),('rear',(7,5,-10)),('top',(0,13,.01))]:
            cam.location=C(pos);aim(cam,(0,.4,0));scene.render.filepath=str(review/(name+'.png'))
            bpy.ops.render.render(write_still=True)

for id in (['shrike','bastion','needle'] if opts.ship=='all' else [opts.ship]):export_ship(id)
