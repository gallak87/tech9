"""Surface-fitted hero seats with a conservative fully-open valve clearance.

The envelope includes both leaves at their maximum lateral opening, the complete
root socket and the core. It is tested against every road and reserved flight
box; selecting a point alone is insufficient for these 330 m tall mineral forms.
"""
from mathutils import Vector
UP=Vector((0,1,0))

def fit_hero_anchors(route,surface):
 boxes=[]
 def box(center,axes,half):
  radius=[sum(abs(axis[i])*h for axis,h in zip(axes,half)) for i in range(3)]
  return (center,axes,half,radius)
 for sample in route['samples']:
  if sample.get('gap'):continue
  fw=Vector(sample['t']);fw.y=0
  if fw.length<.001:continue
  fw.normalize();right=UP.cross(fw)
  # Encloses the production 92 x 124 m tube between its sampled stations,
  # including the vertical change of the steepest neighboring segments.
  boxes.append(box(Vector(sample['p'])+UP*30,(right,UP,fw),(92,165,36)))
 for corridor in route['flightCorridors']:
  fw=Vector(corridor['forward']);right=UP.cross(fw)
  for column in corridor['columns']:
   center=Vector(column['p']);center.y=(column['minY']+column['maxY'])*.5
   boxes.append(box(center,(right,UP,fw),(corridor['lateralHalfWidth'],(column['maxY']-column['minY'])*.5,corridor['longitudinalClearance'])))
 def clear(center,normal,scale):
  right=UP.cross(normal).normalized();up=normal.cross(right).normalized()
  # Mesh: x +/-20, y +/-150, z -8..20. Open leaves move x +/-(38s),
  # z +5. Socket scales (2.3s,1.12s,.6), moves z -27. These rounded
  # half-extents conservatively contain every opening phase and all parts.
  axes=(right,up,normal);half=(58*scale+2,168*scale+2,40)
  aa=box(center,axes,half)
  for other in boxes:
   delta=other[0]-center
   if any(abs(delta[i])>aa[3][i]+other[3][i] for i in range(3)):continue
   separated=False
   for axis in [*axes,*other[1],*(a.cross(b) for a in axes for b in other[1])]:
    if axis.length_squared<1e-12:continue
    ra=sum(abs(axis.dot(a))*h for a,h in zip(axes,half))
    rb=sum(abs(axis.dot(a))*h for a,h in zip(other[1],other[2]))
    if abs(axis.dot(delta))>ra+rb+.5:separated=True;break
   if not separated:return False
  return True
 anchors=[]
 for landmark in route['landmarks']:
  corridor=next(v for v in route['flightCorridors'] if v['id']==landmark['id'])
  fw=Vector(corridor['forward']);right=UP.cross(fw).normalized()
  takeoff=landmark['takeoff'];p=Vector(takeoff['p']);t=Vector(takeoff['t'])
  for side in [-1,1]:
   rays=[(p+t*210+UP*180,right*side)]
   if landmark['id']=='echo-chasm' and side==1:
    # A lower outward wall seat is visible from the normal Vault approach.
    # Keep the original fallback search and verify the complete fully-open
    # valve OBB below; the point alone never authorizes a placement.
    rays.insert(0,(p+fw*200-UP*80,(right-fw*.25).normalized()))
   for fraction in [.12,.32,.55,.76,.93]:
    column=corridor['columns'][round((len(corridor['columns'])-1)*fraction)]
    for y in [column['maxY']-25,column['maxY']*.65+column['minY']*.35,column['maxY']+160]:
     origin=Vector(column['p']);origin.y=y
     for skew in [0,.30,-.25]:rays.append((origin,(right*side+fw*skew).normalized()))
   for origin,direction in rays:
    hit=surface.ray_cast(origin,direction,1500)
    if hit[0] is None or hit[3]<145:continue
    point,normal=hit[:2];normal.normalize()
    # An outward hit indicates an origin inside solid material. Do not fit an
    # invisible interior seat by flipping that normal back toward the origin.
    if normal.dot(-direction)<.10 or abs(normal.y)>.8:continue
    scale=1.1;center=point+normal*17
    if not clear(center,normal,scale):continue
    anchors.append({'point':list(point),'normal':list(normal),'center':list(center),
      'scale':scale,'y':point.y,'distance':takeoff['distance'],'hero':True,
      'name':landmark['id']+' wall '+str(side),'clearance':'full-open valve OBB / all road and flight boxes'})
    break
  count=sum(a['name'].startswith(landmark['id']) for a in anchors)
  print('HERO SEATS',landmark['id'],count,'full scaled valve envelope clear',flush=True)
 return anchors
