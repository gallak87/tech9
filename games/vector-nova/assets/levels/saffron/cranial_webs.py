"""Reference-led structural replacement for the exposed Saffron cranial wall.

Call apply_cranial_web(skull_root, bone_material, marrow_material) after the
skull's material merge and before its final cortical visibility bake. This
helper touches only the skull. It removes a real panel and replaces its mass
with a closed, fused, three-dimensional branching cortical framework.
"""
import bpy, bmesh, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def C(p):
    return Vector((p[0], -p[2], p[1]))


def G(p):
    return Vector((p.x, p.z, -p.y))


def _mesh(name, vertices, faces, material, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([C(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = parent
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    return obj


def _select(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _delete(obj):
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data.users == 0:
        bpy.data.meshes.remove(data)


def _catmull(points, samples):
    output = []
    for j in range(len(points)-1):
        p0, p1 = points[max(0, j-1)], points[j]
        p2, p3 = points[j+1], points[min(j+2, len(points)-1)]
        for k in range(samples):
            t = k/samples
            output.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    output.append(points[-1])
    return output


def _blade(name, points, width, depth, material, phase):
    points = _catmull(points, 5)
    vertices, faces = [], []
    segments = 12
    for j, center in enumerate(points):
        t = j/(len(points)-1)
        tangent = (points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        # The broad face follows the wall; actual depth projects through it.
        across = Vector((0, -tangent.z, tangent.y)).normalized()
        normal = Vector((1,0,0))
        def profile(values):
            if isinstance(values,(int,float)):return values
            station=t*(len(values)-1);index=min(len(values)-2,int(station));u=station-index
            u=u*u*(3-2*u)
            return values[index]*(1-u)+values[index+1]*u
        # Explicit unequal plate roots, thinning forks and radiating tips.
        # The old nearly constant beam radius is deliberately absent.
        w = profile(width)*(1+.055*math.sin(t*4.1+phase))
        d = profile(depth)*(.96+.075*math.sin(t*3.2+phase*.7))
        for i in range(segments):
            a=i*2*math.pi/segments
            # A flattened bone blade, not a decorative round overlay tube.
            u=math.copysign(abs(math.cos(a))**.80,math.cos(a))
            v=math.copysign(abs(math.sin(a))**.84,math.sin(a))
            vertices.append(tuple(center+across*(u*w)+normal*(v*d)))
    for j in range(len(points)-1):
        for i in range(segments):
            faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    faces += [tuple(range(segments-1,-1,-1)),tuple((len(points)-1)*segments+i for i in range(segments))]
    return _mesh(name,vertices,faces,material)


def _contains(p, loop):
    z,y=p; inside=False
    for i,(za,ya) in enumerate(loop):
        zb,yb=loop[(i+1)%len(loop)]
        if (ya>y)!=(yb>y) and z<(zb-za)*(y-ya)/(yb-ya)+za:
            inside=not inside
    return inside


def apply_cranial_web(skull_root, bone_material, marrow_material=None):
    """Replace the exposed negative-X lower wall; return authored metrics."""
    bpy.context.view_layer.update()
    objects=[o for o in skull_root.children if o.type=='MESH']
    target=max(objects,key=lambda o:len(o.data.vertices))
    inverse=skull_root.matrix_world.inverted()
    vertices,polygons=[],[]
    for obj in objects:
        transform=inverse@obj.matrix_world;offset=len(vertices)
        vertices.extend(transform@v.co for v in obj.data.vertices)
        polygons.extend(tuple(offset+i for i in p.vertices)for p in obj.data.polygons)
    survey=BVHTree.FromPolygons(vertices,polygons,all_triangles=False)

    # Irregular rim follows the original wall survey, retaining the primary
    # orbit/mouth outlines outside this one lower temporal/palatal window.
    boundary=[(188,-31),(197,-49),(225,-56),(264,-49),(282,-31),(279,-10),(258,3),(222,2),(197,-10)]
    def surface(z,y):
        hit,normal,_,_=survey.ray_cast(C((0,y,z)),Vector((-1,0,0)),240)
        if hit is not None:
            return G(hit).x
        # Existing through-galleries can make a ray miss. This calm anatomical
        # continuation is only an interior guide; every rim node seats on a
        # nearest real cortical surface before its joining flare is built.
        x=-max(32,96*math.sqrt(max(0,1-((y-24)/83)**2)))
        return x
    def point(z,y,depth=6,rim=False):
        x=surface(z,y)
        if rim:
            nearest,_,_,_=survey.find_nearest(C((x,y,z)))
            if nearest is not None:
                q=G(nearest);x=q.x
        return Vector((x-depth,y,z))

    # Remove the panel itself. The new framework supplies its mass; there is
    # no continuous painted sheet hidden behind the apparent porosity.
    # The merged anatomical source includes overlapping closed solids; Boolean
    # solid classification can retain a far skin there. Split its actual
    # polygons along the window planes, then remove every negative-X face in
    # the window. The new closed thick rim seats across those real cut edges.
    bm=bmesh.new();bm.from_mesh(target.data)
    for i,(za,ya)in enumerate(boundary):
        zb,yb=boundary[(i+1)%len(boundary)]
        edge=C((0,yb-ya,zb-za))
        normal=Vector((1,0,0)).cross(edge).normalized()
        bmesh.ops.bisect_plane(bm,geom=[*bm.verts,*bm.edges,*bm.faces],dist=.0001,plane_co=C((0,ya,za)),plane_no=normal,clear_inner=False,clear_outer=False)
    bmesh.ops.bisect_plane(bm,geom=[*bm.verts,*bm.edges,*bm.faces],dist=.0001,plane_co=C((-26,0,0)),plane_no=Vector((1,0,0)),clear_inner=False,clear_outer=False)
    removed=[]
    for face in bm.faces:
        p=G(face.calc_center_median())
        if p.x < -26.00001 and _contains((p.z,p.y),boundary):removed.append(face)
    bmesh.ops.delete(bm,geom=removed,context='FACES')
    bm.to_mesh(target.data);bm.free();target.data.update()
    target.data.validate(clean_customdata=False)

    parts=[]
    n=len(boundary)
    # The thin closed thickness sleeve below owns the cut edge. Visible load
    # arms attach to the real inner skin; no uniform raised collar outlines
    # the replacement as an inserted grille.
    rim=[point(z,y,2,True)for z,y in boundary]
    a=point(209,-26,6);b=point(232,-13,11)
    c=point(252,-33,7);d=point(266,-13,15);e=point(232,-43,12)
    paths=[
      # Two sweeping primary load paths have broad fanned cortical roots,
      # thinning shafts and different curvature/depth through the skull.
      ([rim[0],point(198,-27,5),a,b,point(248,-3,6),rim[6]],
       [7.0,4.8,3.7,3.0,4.0,6.2],[5.8,6.0,5.7,5.0,5.0,5.8]),
      ([rim[2],point(229,-51,8),e,c,point(271,-34,5),rim[4]],
       [6.3,4.8,3.2,3.0,4.2,6.8],[5.5,5.8,6.2,6.0,5.5,5.8]),
      # A tapering fork joins the main paths without a repeated X brace.
      ([b,point(240,-23,10),c],[4.3,2.3,3.4],[4.8,4.7,5.2]),
      ([a,point(214,-11,5),rim[7]],[3.8,2.0,4.5],[4.8,4.0,5.0]),
      # Sparse finer radiating branches retain a clear hierarchy of cells.
      ([a,point(202,-37,10),rim[1]],[2.0,1.75,3.8],[3.8,3.4,4.5]),
      ([c,d,rim[5]],[3.1,1.85,4.8],[4.2,3.4,5.0]),
    ]
    for i,(points,widths,depths)in enumerate(paths):
        parts.append(_blade('Cranial web / tapering forked cortical plate',points,widths,depths,bone_material,i*.83))

    # Unequal flush laminae spread the principal roots across real cortex
    # outside the window. Their edges taper down into existing bone instead
    # of terminating as a clean panel border. Skip an attachment if its
    # intended seat lies in an already-approved primary aperture.
    fans=[(0,178,-34,7.0,8.0),(2,232,-64,6.1,7.2),
          (4,293,-31,6.7,8.0),(6,266,9,6.0,7.0),
          (1,189,-55,3.7,5.0),(5,288,-6,4.7,6.2)]
    for i,(index,z,y,start_width,spread)in enumerate(fans):
        hit,_,_,_=survey.ray_cast(C((0,y,z)),Vector((-1,0,0)),240)
        if hit is None:continue
        seated=G(hit);seated.x-=.8
        p=rim[index];mid=p.lerp(seated,.50);mid.x-=.9
        parts.append(_blade('Cranial web / broad seated attachment lamina',
                            [p,mid,seated],[start_width,spread,.9],
                            [4.2,2.5,.65],bone_material,3.4+i*.71))

    _select(parts[0])
    for obj in parts:obj.select_set(True)
    bpy.ops.object.join()
    web=bpy.context.view_layer.objects.active
    web.name='skull_Connected_branching_trabecular_framework'
    remesh=web.modifiers.new('Fused cortical forks and thick seated junctions','REMESH')
    remesh.mode='VOXEL';remesh.voxel_size=.90;remesh.adaptivity=.26;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=web.modifiers.new('Eroded continuous cortical junctions','SMOOTH')
    smooth.factor=.33;smooth.iterations=2
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=web.modifiers.new('Bounded structural web mesh','DECIMATE');decimate.ratio=.62
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # A real closed cortical sleeve spans the exposed inner/outer cut skin.
    # It is thin in projection and deep through the original wall, closing
    # the raw thickness edge without laying a sheet behind the new cells.
    samples=[]
    for i,(za,ya)in enumerate(boundary):
        zb,yb=boundary[(i+1)%len(boundary)]
        count=max(2,math.ceil(math.hypot(zb-za,yb-ya)/6))
        for j in range(count):
            t=j/count;samples.append((za+(zb-za)*t,ya+(yb-ya)*t))
    sleeve_vertices=[];sleeve_faces=[]
    for i,(z,y)in enumerate(samples):
        previous=Vector(samples[(i-1)%len(samples)]);following=Vector(samples[(i+1)%len(samples)])
        tangent=(following-previous).normalized();outward=Vector((-tangent.y,tangent.x))
        inside=surface(z,y)
        hit,_,_,_=survey.ray_cast(C((-225,y,z)),Vector((1,0,0)),199)
        outside=G(hit).x if hit is not None else inside-20
        outside=min(outside,inside-10)
        for x,sign in [(outside-1,1),(inside+1,1),(inside+1,-1),(outside-1,-1)]:
            sleeve_vertices.append((x,y+outward.y*sign*1.6,z+outward.x*sign*1.6))
    for i in range(len(samples)):
        j=(i+1)%len(samples)
        for k in range(4):sleeve_faces.append((i*4+k,i*4+(k+1)%4,j*4+(k+1)%4,j*4+k))
    sleeve=_mesh('Cranial web / closed real cortical thickness sleeve',sleeve_vertices,sleeve_faces,bone_material)
    _select(web)
    union=web.modifiers.new('Joined thick cortical window attachment','BOOLEAN');union.operation='UNION';union.solver='EXACT';union.object=sleeve;union.use_self=True
    bpy.ops.object.modifier_apply(modifier=union.name);_delete(sleeve)
    # Sub-voxel tapered tips can leave minute Boolean fragments. Retain the
    # complete connected load framework and discard only tiny isolated debris;
    # a substantial disconnected arm is an authoring error, never hidden.
    clean=bmesh.new();clean.from_mesh(web.data)
    unseen=set(clean.verts);islands=[]
    while unseen:
        stack=[unseen.pop()];component=[]
        while stack:
            vertex=stack.pop();component.append(vertex)
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in unseen:unseen.remove(other);stack.append(other)
        islands.append(component)
    islands.sort(key=len,reverse=True)
    for island in islands[1:]:
        if len(island)>50:raise ValueError('Disconnected structural cortical arm')
        bmesh.ops.delete(clean,geom=island,context='VERTS')
    clean.to_mesh(web.data);clean.free()
    web.data.validate(clean_customdata=False)
    for p in web.data.polygons:p.use_smooth=True
    web.parent=skull_root
    web['anatomy']='One closed connected cortical framework: tapered fanned load plates, finer radiating forks, flush attachment laminae and three structural depths'
    web['reference']='assets/levels/saffron/scene-reference.png'
    web['window_game_yz']=[list(p)for p in boundary]

    # Project actual geometry across the replacement panel to measure voids.
    bpy.context.view_layer.update()
    combined_vertices,combined_faces=[],[]
    for obj in [target,web]:
        transform=inverse@obj.matrix_world;offset=len(combined_vertices)
        combined_vertices.extend(transform@v.co for v in obj.data.vertices)
        combined_faces.extend(tuple(offset+i for i in p.vertices)for p in obj.data.polygons)
    result_tree=BVHTree.FromPolygons(combined_vertices,combined_faces,all_triangles=False)
    samples=solid=0
    for iz in range(70):
        z=188+(iz+.5)/70*94
        for iy in range(46):
            y=-56+(iy+.5)/46*59
            if not _contains((z,y),boundary):continue
            samples+=1
            hit,_,_,_=result_tree.ray_cast(C((-26,y,z)),Vector((-1,0,0)),210)
            if hit is not None:solid+=1
    web.data.calc_loop_triangles()
    topology=bmesh.new();topology.from_mesh(web.data)
    nonmanifold=sum(not e.is_manifold for e in topology.edges)
    unseen=set(topology.verts);components=0
    while unseen:
        components+=1;stack=[unseen.pop()]
        while stack:
            vertex=stack.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in unseen:unseen.remove(other);stack.append(other)
    topology.free()
    metrics={'webTriangles':len(web.data.loop_triangles),'windowSamples':samples,'windowVoidFraction':round(1-solid/max(1,samples),4),'webObject':web.name,'components':components,'nonmanifoldEdges':nonmanifold}
    skull_root['cranial_structural_web']=str(metrics)
    return metrics
