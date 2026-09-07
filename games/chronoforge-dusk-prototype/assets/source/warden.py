"""The Pale Warden — an original smooth, articulated ceramic sentinel.

Run: blender -b -t 4 -P assets/source/warden.py
Reuses only selected function definitions from characters.py via AST; importing
that complete authoring script would execute its three unrelated exports.
The retained source scene is lit and ready for inspection. Forward is Blender
-Y / glTF +Z. Joint pivots match the game's character animation convention.
"""
import ast, bpy, math, os, random, json
from mathutils import Vector
from collections import defaultdict
random.seed(28041)
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(HERE,'../..'))
OUT=os.path.join(ROOT,'public/models')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
PIVOTS={}
helpers={'material','pivot','attach','finish','mesh','ellipsoid','rounded','curve','circle','loft','catmull','lock','plate','ribbon','apply_and_merge'}
with open(os.path.join(HERE,'characters.py')) as f:tree=ast.parse(f.read())
definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in helpers],type_ignores=[])
exec(compile(definitions,'characters.py • helper definitions only','exec'))
M={
 'ivory':material('Warden • aged ivory ceramic',(.64,.57,.43),metallic=.08,rough=.39),
 'ivoryLight':material('Warden • porcelain edge glaze',(.84,.76,.60),metallic=.10,rough=.29),
 'ivoryShade':material('Warden • fired ochre underside',(.28,.24,.18),metallic=.15,rough=.58),
 'dark':material('Warden • midnight mechanical sinew',(.025,.036,.048),metallic=.76,rough=.36),
 'steel':material('Warden • old titanium internals',(.11,.15,.17),metallic=.8,rough=.43),
 'steelLight':material('Warden • machined edge',(.24,.29,.29),metallic=.87,rough=.3),
 'bronze':material('Warden • patinated bronze',(.27,.17,.077),metallic=.82,rough=.44),
 'gold':material('Warden • surviving gilt',(.56,.37,.17),metallic=.85,rough=.34),
 'patina':material('Warden • turquoise oxidation',(.077,.20,.18),metallic=.60,rough=.67),
 'groove':material('Warden • inscribed ceramic recess',(.17,.13,.10),metallic=.1,rough=.7),
 'pink':material('Warden • imprisoned temporal light',(.73,.070,.40),metallic=.12,rough=.2,emission=3.0),
 'pinkDark':material('Warden • dark temporal crystal',(.19,.019,.11),metallic=.56,rough=.14),
 'white':material('Warden • core filament',(.93,.41,.71),rough=.15,emission=3.5),
}

root=pivot('pale-warden');body=pivot('body',(0,0,0),root)
head=pivot('head',(0,.03,3.115),body)
arms=[];legs=[];knees=[]
for side,name in [(-1,'left'),(1,'right')]:
    arms.append(pivot(name+'Arm',(side*.725,.03,2.85),body))
    leg=pivot(name+'Leg',(side*.32,.05,1.52),body);legs.append(leg)
    knees.append(pivot(name+'Knee',(side*.385,.022,.90),leg))
cloak=pivot('cloak',(0,.26,2.86),body)

def shell(name,rings,angle0,angle1,parent,mat='ivory',n=18,thickness=.038):
    verts=[];faces=[]
    for z,rx,ry,cy in rings:
        for i in range(n+1):
            a=angle0+(angle1-angle0)*i/n
            verts.append((math.sin(a)*rx,cy-math.cos(a)*ry,z))
    for j in range(len(rings)-1):
        for i in range(n):a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
    o=mesh(name,verts,faces,mat,parent,sub=1)
    mod=o.modifiers.new('Hand-fired ceramic thickness','SOLIDIFY');mod.thickness=thickness
    mod=o.modifiers.new('Soft chipped glaze edges','BEVEL');mod.width=.007;mod.segments=3
    for angle in [angle0,angle1]:
        pts=[(math.sin(angle)*rx,cy-math.cos(angle)*ry-.008,z) for z,rx,ry,cy in rings]
        curve(name+' glaze rim',pts,.006,'ivoryLight',parent)
    return o

def arc(name,center,rx,rz,start,end,mat,parent,r=.021,depth=.7,n=60):
    # Curved bands are solid, elliptical-section forged strips.
    pts=[]
    for i in range(n+1):
        a=start+(end-start)*i/n
        pts.append((center[0]+rx*math.sin(a),center[1],center[2]+rz*math.cos(a)))
    return curve(name,pts,r,mat,parent,res=2)

def rivet(x,y,z,parent,size=.012):
    ellipsoid('Recessed bronze fastening',(x,y,z),(size,size*.45,size),'bronze',parent,segments=12,rings=8)
    curve('Fastening tool slot',[(x-size*.5,y-size*.48,z),(x+size*.5,y-size*.48,z)],size*.12,'dark',parent,res=1)

# Visible mechanical skeleton holds each separated plate in a plausible structure.
loft('Tapered hidden ribcage',[(0,.07,1.93,.28,.19),(0,.05,2.18,.34,.24),(0,.04,2.43,.42,.28),(0,.03,2.69,.51,.28),(0,.05,2.87,.43,.23),(0,.04,2.96,.20,.15)],'dark',body,n=40,sub=2)
loft('Waist spinal spindle',[(0,.06,1.58,.18,.13),(0,.06,1.72,.16,.13),(0,.06,1.91,.21,.16),(0,.06,2.06,.25,.18)],'steel',body,n=32,sub=1)
for j in range(8):circle('Flexible abdominal vertebra',(0,.06,1.65+j*.049),.20+j*.006,.153+j*.004,'dark',body,r=.013)
loft('Pelvic inner bridge',[(0,.065,1.40,.35,.18),(0,.060,1.52,.40,.22),(0,.060,1.65,.31,.20)],'dark',body,n=32,sub=1)

# Four hovering ceramic breastplate lobes expose the core down the middle.
chestRings=[(2.14,.32,.258,.025),(2.20,.37,.280,.025),(2.37,.48,.335,.023),(2.59,.566,.332,.02),(2.75,.575,.286,.02),(2.86,.466,.230,.026),(2.91,.30,.17,.03)]
shell('Left floating ceramic breastplate',chestRings,-1.48,-.28,body)
shell('Right floating ceramic breastplate',chestRings,.28,1.48,body)
for side in [-1,1]:
    # Fine bronze calligraphy follows each convex glazed surface.
    for i in range(3):
        x=side*(.26+i*.064)
        pts=[(x*.78,-.286,2.25),(x,-.324,2.41),(x*1.08,-.319,2.64),(x*.97,-.251,2.80)]
        curve('Inlaid clavicle circuit',pts,.0026,'bronze',body,res=1)
    curve('Shoulder-to-heart gilt crest',[(side*.16,-.137,2.929),(side*.31,-.22,2.886),(side*.44,-.260,2.788)],.010,'gold',body)
    for x,z in [(side*.39,2.39),(side*.48,2.63),(side*.24,2.835)]:rivet(x,-.32 if z<2.7 else -.233,z,body,size=.011)
    # Three abdominal flanges float distinctly apart.
    for j in range(3):
        z=2.11-j*.125
        outline=[(side*.077,z+.083),(side*.311,z+.067),(side*.369,z-.011),(side*.261,z-.058),(side*.085,z-.014)]
        plate('Separated abdominal ceramic flange',outline,-.184,.047,'ivory',body,bevel=.016)
        curve('Abdominal engraved bevel',[(side*.103,-.239,z+.043),(side*.285,-.237,z+.028),(side*.300,-.238,z-.006)],.003,'bronze',body)

# The temporal core is suspended in a dark articulated gimbal.
circle('Core structural gimbal',(0,-.302,2.505),.208,.254,'bronze',body,r=.029,plane='xz',n=48)
circle('Core inner dark ring',(0,-.326,2.505),.160,.202,'dark',body,r=.018,plane='xz',n=48)
ellipsoid('Imprisoned temporal core',(0,-.333,2.505),(.125,.105,.156),'pinkDark',body,segments=40,rings=28)
lock('Heart crystal upper blade',[(0,-.433,2.664),(0,-.461,2.537),(0,-.443,2.490)],.064,'pink',body,depth=.60,steps=4)
lock('Heart crystal lower blade',[(0,-.443,2.527),(0,-.461,2.419),(0,-.433,2.354)],.050,'pink',body,depth=.55,steps=4)
curve('Core white-hot filament',[(0,-.473,2.611),(.010,-.485,2.527),(-.006,-.481,2.448),(0,-.461,2.389)],.004,'white',body)
for i in range(6):
    a=i*math.tau/6
    x=math.sin(a)*.204;z=2.505+math.cos(a)*.251
    curve('Core containment claw',[(x,-.305,z),(x*.90,-.40,2.505+(z-2.505)*.84),(x*.66,-.425,2.505+(z-2.505)*.61)],.014,'steelLight',body)

# Back armor and three articulated ritual pennants add depth in orbiting views.
shell('Rear ivory mantle',[(2.22,.44,.34,.04),(2.38,.49,.37,.04),(2.75,.54,.30,.04),(2.87,.39,.24,.04)],1.72,4.57,body,n=28)
for j in range(5):
    z=2.1+j*.13
    plate('Rear bronze vertebral ornament',[(-.08,z+.055),(.08,z+.055),(.11,z),(0,z-.084),(-.11,z)],.397,.025,'bronze',body,bevel=.009)
for x in [-.30,0,.30]:
    curve('Ritual pennant flexible spine',[(x,.33,2.61),(x*1.1,.42,2.00),(x*1.23,.48,1.43),(x*1.36,.47,.91)],.011,'dark',cloak)
    for j in range(6):
        z=2.33-j*.225;xx=x*(1+j*.065);yy=.402+j*.014
        plate('Overlapping ceremonial hanging plate',[(xx-.086,z+.09),(xx+.086,z+.09),(xx+.084,z-.065),(xx,z-.138),(xx-.085,z-.065)],yy,.025,'bronze' if j%2 else 'ivoryShade',cloak,bevel=.007)
        curve('Pennant inscription',[(xx-.043,yy+.030,z+.024),(xx,yy+.030,z-.013),(xx+.043,yy+.030,z+.024)],.003,'patina',cloak)

# Neck: exposed black bellows surrounded by a cracked collar crown.
loft('Mechanical cervical spine',[(0,.035,2.905,.104,.10),(0,.035,3.19,.09,.09)],'steel',head,n=28,sub=1)
for j in range(6):circle('Neck bellows',(0,.035,2.95+j*.035),.114,.104,'dark',head,r=.012)
for side in [-1,1]:
    plate('Broken rising gorget',[(side*.092,2.94),(side*.266,3.137),(side*.350,3.015),(side*.321,2.867),(side*.17,2.814)],-.018,.077,'ivory',body,bevel=.023)
    curve('Gorget gilt edge',[(side*.114,-.098,2.954),(side*.254,-.098,3.111),(side*.325,-.098,3.011)],.007,'gold',body)

# A sculpted, genuinely hollow-eyed ceramic mask with modeled nose and chin.
ellipsoid('Dark inner sentinel skull',(0,.042,3.422),(.258,.188,.343),'dark',head,segments=40,rings=28)
faceRings=[(3.089,.070,.108),(3.116,.104,.130),(3.169,.158,.163),(3.227,.194,.185),(3.301,.230,.209),(3.385,.254,.222),(3.451,.267,.224),(3.500,.264,.220),(3.559,.250,.209),(3.619,.210,.189),(3.675,.151,.154),(3.709,.078,.102),(3.720,.031,.070)]
verts=[];faces=[];n=36
for z,rx,ry in faceRings:
    for i in range(n+1):
        a=-1.32+i/n*2.64;x=math.sin(a)*rx;y=.011-math.cos(a)*ry
        y-=.055*math.exp(-(x/.035)**2-((z-3.362)/.122)**2)
        y-=.011*math.exp(-((abs(x)-.132)/.059)**2-((z-3.319)/.053)**2)
        verts.append((x,y,z))
for j in range(len(faceRings)-1):
    for i in range(n):
        a=j*(n+1)+i;center=(Vector(verts[a])+Vector(verts[a+n+2]))*.5
        # Gaps expose the luminous eye slits and fractured left cheek.
        eye=abs(abs(center.x)-.116)<.071 and 3.442<center.z<3.497
        chip=center.x<-.174 and 3.218<center.z<3.284
        if not eye and not chip:faces.append((a,a+1,a+n+2,a+n+1))
o=mesh('Sculpted hollow-eyed ceramic mask',verts,faces,'ivory',head,sub=1)
mod=o.modifiers.new('Ceramic mask wall','SOLIDIFY');mod.thickness=.024
mod=o.modifiers.new('Glazed mask edges','BEVEL');mod.width=.004;mod.segments=3
for side in [-1,1]:
    # Eye surfaces sit inside the physical openings, with an inset lens rim.
    ellipsoid('Recessed temporal eye',(side*.115,-.185,3.468),(.061,.009,.011),'pink',head,segments=28,rings=12)
    curve('Eye luminous razor',[(side*.061,-.197,3.468),(side*.115,-.201,3.468),(side*.168,-.183,3.47)],.0033,'white',head)
    curve('Raised severe brow',[(side*.039,-.218,3.527),(side*.098,-.218,3.55),(side*.176,-.18,3.538),(side*.225,-.127,3.501)],.009,'ivoryLight',head)
    curve('Ancient under-eye inscription',[(side*.076,-.219,3.423),(side*.106,-.216,3.389),(side*.143,-.201,3.380)],.0027,'groove',head)
    lock('Detached outer cheek shard',[(side*.239,-.113,3.373),(side*.267,-.11,3.289),(side*.213,-.10,3.192)],.053,'ivory',head,depth=.5,steps=4)
    curve('Cheek gilt fracture',[(side*.243,-.145,3.348),(side*.257,-.143,3.294),(side*.217,-.134,3.219)],.004,'gold',head)
curve('Long central forehead seal',[(0,-.090,3.72),(0,-.205,3.607),(0,-.228,3.526)],.006,'bronze',head)
plate('Forehead hourglass seal',[(-.023,3.658),(.023,3.658),(.005,3.619),(.025,3.575),(-.025,3.575),(-.005,3.619)],-.211,.008,'bronze',head,bevel=.002)
lock('Temporal forehead splinter',[(0,-.232,3.644),(0,-.235,3.620),(0,-.231,3.593)],.009,'pink',head,depth=.6,steps=3)
curve('Quiet carved mouth',[(-.062,-.180,3.228),(0,-.198,3.219),(.062,-.18,3.228)],.003,'groove',head)
curve('Chin fracture',[(.008,-.187,3.201),(-.007,-.155,3.16),(.003,-.126,3.107)],.0023,'groove',head,res=1)

# A broken bronze astrolabe halo is the Warden's unmistakable silhouette.
haloCenter=(0,.236,3.42)
for a0,a1 in [(-2.80,-.56),(-.27,.96),(1.29,2.74)]:
    arc('Broken outer bronze halo',haloCenter,.638,.721,a0,a1,'bronze',head,r=.025,n=46)
    arc('Halo surviving gilt edge',(0,.208,3.42),.642,.725,a0+.02,a1-.02,'gold',head,r=.0045,n=42)
for a0,a1 in [(-2.86,-.51),(.03,.96),(1.37,2.89)]:arc('Inner irregular halo',(0,.236,3.42),.552,.625,a0,a1,'steelLight',head,r=.010,n=38)
for i in range(39):
    a=-2.75+i/38*5.5
    if -.55<a<-.27 or .96<a<1.29:continue
    x=math.sin(a);z=math.cos(a)
    curve('Halo astronomical index',[(x*.555,.203,3.42+z*.629),(x*(.604 if i%3 else .623),.203,3.42+z*(.684 if i%3 else .706))],.0032,'gold' if i%4 else 'patina',head,res=1)
for a in [-2.77,-.52,-.24,.98,1.26,2.75]:
    x=math.sin(a)*.64;z=3.42+math.cos(a)*.724
    ellipsoid('Broken halo terminal',(x,.237,z),(.035,.027,.034),'patina',head,segments=20,rings=12)
for side in [-1,1]:
    curve('Halo temple support',[(side*.218,.073,3.518),(side*.397,.209,3.482),(side*.531,.23,3.388)],.016,'dark',head)
    rivet(side*.33,.182,3.483,head,.015)

for side,arm,leg,knee in zip([-1,1],arms,legs,knees):
    ax=side*.725
    # Hidden clavicle bearings and upper-arm tendons.
    ellipsoid('Shoulder mechanical bearing',(ax,.035,2.824),(.207,.197,.199),'dark',arm,segments=28,rings=20)
    circle('Shoulder bearing rim',(ax,-.173,2.823),.125,.127,'steelLight',arm,r=.013,plane='xz')
    loft('Arm tapered titanium skeleton',[(ax+side*.045,.035,2.84,.132,.124),(ax+side*.107,.029,2.58,.099,.095),(ax+side*.124,.019,2.355,.085,.090)],'steel',arm,n=28,sub=1)
    # Broad asymmetrical ceramic pauldrons are layered and engraved.
    ellipsoid('Sculpted ceramic pauldron',(ax+side*.054,.028,2.858),(.288,.263,.206),'ivory',arm,segments=36,rings=24)
    circle('Pauldron bound ceramic rim',(ax+side*.059,.026,2.799),.276,.254,'ivoryLight',arm,r=.012)
    plate('Angular pauldron floating front lobe',[(ax-.214,2.898),(ax-.10,2.983),(ax+.128,2.98),(ax+.242,2.866),(ax+.18,2.716),(ax-.16,2.735)],-.193,.050,'ivory',arm,bevel=.026)
    curve('Pauldron bronze sun inlay',[(ax-.136,-.251,2.81),(ax-.083,-.254,2.887),(ax+.043,-.254,2.911),(ax+.151,-.248,2.851)],.005,'bronze',arm)
    for i in [-1,0,1]:
        x=ax+i*.071
        curve('Ceramic pauldron engraved numeral',[(x-.013,-.253,2.816),(x,-.260,2.846),(x+.011,-.253,2.820)],.0027,'groove',arm,res=1)
    for x in [ax-.153,ax+.157]:rivet(x,-.253,2.79,arm,.013)
    # Floating upper-arm shell and recessed two-piece elbow.
    x=ax+side*.09
    plate('Separated upper arm carapace',[(x-.124,2.651),(x+.123,2.644),(x+.100,2.414),(x,2.371),(x-.105,2.425)],-.110,.064,'ivory',arm,bevel=.021)
    curve('Upper arm engraved line',[(x,-.183,2.60),(x,-.183,2.434)],.0033,'bronze',arm)
    ex=ax+side*.136
    ellipsoid('Exposed elbow mechanism',(ex,.025,2.288),(.118,.117,.131),'dark',arm,segments=28,rings=20)
    circle('Elbow gilded bearing',(ex,-.095,2.287),.071,.071,'bronze',arm,r=.012,plane='xz')
    ellipsoid('Elbow temporal bearing',(ex,-.111,2.287),(.036,.008,.036),'pinkDark',arm,segments=24,rings=16)
    # Vambraces become narrow at the wrists, with back-mounted tendons.
    fx=ax+side*.162
    loft('Forearm mechanical tendons',[(ex,.023,2.27,.088,.080),(fx,.015,2.03,.074,.071),(fx+side*.026,.007,1.811,.065,.060)],'steel',arm,n=28,sub=1)
    plate('Long ceramic forearm shield',[(fx-.128,2.18),(fx,2.23),(fx+.128,2.18),(fx+.092,1.853),(fx,1.797),(fx-.087,1.858)],-.09,.087,'ivory',arm,bevel=.025)
    curve('Vambrace engraved central fracture',[(fx,-.188,2.16),(fx-.014,-.191,2.02),(fx+.011,-.191,1.928),(fx,-.183,1.845)],.0036,'bronze',arm)
    for z in [1.894,2.093]:circle('Exposed forearm clamp',(fx,.015,z),.117,.107,'dark',arm,r=.019)
    for i in range(3):curve('Arm back hydraulic conduit',[(fx+(i-1)*.047,.105,2.218),(fx+(i-1)*.040,.11,2.02),(fx+(i-1)*.033,.078,1.795)],.009,'bronze',arm)
    # A shaped mechanical palm and four long individually jointed claws.
    hx=fx+side*.03
    ellipsoid('Dark articulated palm',(hx,.014,1.706),(.102,.087,.136),'dark',arm,segments=28,rings=18)
    plate('Palm ceramic armor',[ (hx-.081,1.792),(hx+.082,1.79),(hx+.087,1.664),(hx,1.606),(hx-.084,1.664)],-.075,.035,'ivory',arm,bevel=.018)
    for i in range(4):
        xx=hx+(i-1.5)*.055;length=.22-abs(i-1.5)*.025
        lock('Segmented dark claw finger',[(xx,-.007,1.652),(xx,-.025,1.565),(xx,-.076,1.565-length*.58),(xx,-.125,1.565-length)],.025,'dark',arm,depth=.85,steps=4)
        ellipsoid('Finger bronze knuckle',(xx,-.047,1.569),(.027,.027,.03),'bronze',arm,segments=16,rings=12)
        lock('Ivory claw distal plate',[(xx,-.083,1.56-length*.40),(xx,-.121,1.565-length*.75),(xx,-.150,1.548-length)],.027,'ivory',arm,depth=.65,steps=4)
        curve('Claw dorsal gilt spine',[(xx,-.08,1.552),(xx,-.123,1.56-length*.72)],.003,'gold',arm)
    lock('Opposed sentinel thumb',[(hx-side*.071,.015,1.751),(hx-side*.137,-.022,1.674),(hx-side*.142,-.083,1.593),(hx-side*.103,-.118,1.565)],.036,'dark',arm,depth=.9,steps=4)
    lock('Thumb ceramic tip',[(hx-side*.146,-.089,1.615),(hx-side*.127,-.118,1.581),(hx-side*.092,-.133,1.568)],.038,'ivory',arm,depth=.7,steps=3)
    # Hips and legs carry separated long ivory plates around dark supports.
    lx=side*.32
    ellipsoid('Hip articulated bearing',(lx,.044,1.477),(.157,.157,.15),'dark',leg,segments=28,rings=20)
    loft('Upper leg titanium skeleton',[(lx,.049,1.492,.113,.109),(side*.351,.039,1.241,.104,.097),(side*.385,.022,.989,.088,.085)],'steel',leg,n=28,sub=1)
    plate('Flared ceramic hip tasset',[(lx-.13,1.58),(lx+.131,1.58),(lx+.191,1.391),(lx+.105,1.279),(lx-.121,1.305),(lx-.166,1.414)],-.097,.092,'ivory',leg,bevel=.024)
    curve('Hip inlaid broken crest',[(lx-.100,-.196,1.51),(lx,-.202,1.552),(lx+.103,-.196,1.51)],.005,'bronze',leg)
    tx=side*.365
    plate('Separated long ceramic thigh',[(tx-.119,1.280),(tx+.114,1.275),(tx+.112,1.020),(tx, .957),(tx-.111,1.024)],-.098,.074,'ivory',leg,bevel=.019)
    curve('Thigh gilt seam',[(tx,-.183,1.238),(tx,-.183,1.019)],.004,'gold',leg)
    kx=side*.385
    ellipsoid('Open knee bearing',(kx,.022,.9),(.131,.121,.133),'dark',knee,segments=28,rings=20)
    plate('Floating angular kneecap',[(kx-.101,.963),(kx,.997),(kx+.104,.961),(kx+.111,.88),(kx,.800),(kx-.106,.876)],-.105,.059,'ivory',knee,bevel=.020)
    curve('Knee inset copper crest',[(kx-.061,-.171,.925),(kx,-.177,.952),(kx+.062,-.171,.925)],.005,'bronze',knee)
    loft('Tapered titanium lower leg',[(kx,.018,.839,.09,.091),(kx,.012,.54,.083,.088),(kx,-.001,.257,.068,.076)],'steel',knee,n=28,sub=1)
    plate('Floating shin carapace',[(kx-.11,.792),(kx,.824),(kx+.115,.792),(kx+.097,.387),(kx,.303),(kx-.092,.385)],-.106,.077,'ivory',knee,bevel=.025)
    curve('Greave long inlaid ridge',[(kx,-.193,.757),(kx,-.203,.569),(kx,-.193,.355)],.006,'bronze',knee)
    for z in [.413,.710]:rivet(kx,-.206,z,knee,.013)
    for j in range(4):circle('Ankle bellows',(kx,.0,.242+j*.029),.084,.087,'dark',knee,r=.010)
    ellipsoid('Mechanical heel',(kx,.01,.204),(.124,.127,.13),'dark',knee,segments=28,rings=18)
    # A swept pointed foot; the dark sole contacts the ground beneath the glaze.
    loft('Forged articulated foot sole',[(kx,-.073,.041,.137,.237),(kx,-.075,.063,.147,.247),(kx,-.076,.090,.143,.242),(kx,-.072,.112,.135,.230)],'dark',knee,n=36,sub=1)
    ellipsoid('Ceramic armored instep',(kx,-.119,.158),(.139,.239,.105),'ivory',knee,segments=36,rings=22)
    curve('Foot gilded center seam',[(kx,-.311,.12),(kx,-.261,.227),(kx,-.111,.264),(kx,.033,.224)],.005,'bronze',knee)
    for dx in [-.08,.08]:curve('Carved foot toe division',[(kx+dx*.5,-.34,.117),(kx+dx,-.276,.196),(kx+dx,-.201,.219)],.003,'groove',knee)

# A small number of cracks and oxidation marks break the pristine material.
for side in [-1,1]:
    curve('Old ceramic breastplate fracture',[(side*.442,-.281,2.769),(side*.414,-.312,2.697),(side*.436,-.322,2.631),(side*.397,-.330,2.577)],.0023,'groove',body,res=1)
    curve('Hairline branching fracture',[(side*.417,-.311,2.69),(side*.373,-.325,2.661),(side*.365,-.327,2.638)],.0014,'groove',body,res=1)

members=apply_and_merge(root)
bpy.ops.object.select_all(action='DESELECT')
for o in members:o.select_set(True)
bpy.context.view_layer.objects.active=root
path=os.path.join(OUT,'pale-warden.glb')
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=True,export_materials='EXPORT',export_extras=False)
triangles=0
for o in members:
    if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
stats={'triangles':triangles,'meshes':sum(o.type=='MESH' for o in members),'bytes':os.path.getsize(path),'forward':'+Z','heightMeters':4.15,'rig':'named articulated transform pivots'}
with open(os.path.join(HERE,'warden-stats.json'),'w') as f:json.dump(stats,f,indent=2)
print('PALE WARDEN EXPORTED',json.dumps(stats),flush=True)

# Retained dark studio source scene: pale plates, soft shadows, and a warm rim.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object;floor.name='Atelier floor';finish(floor,material('Atelier • midnight slate',(.014,.022,.033),rough=.86),None)
def area(name,loc,color,power,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-4,-5,7),(1,.79,.60),850,5,(0,0,2))
area('Cool frontal fill',(3,-3,5),(.54,.70,1),450,4,(0,0,2))
area('Dusky magenta rim',(0,3,5),(.72,.25,.46),650,3,(0,0,2.4))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.080,.11,1);world.node_tree.nodes['Background'].inputs[1].default_value=.22
bpy.ops.object.camera_add(location=(5.6,-10.0,5.0));camera=bpy.context.object;camera.name='Pale Warden • atelier inspection';camera.rotation_euler=(Vector((0,0,2.08))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.15
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(HERE,'warden-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'warden.blend'))
bpy.ops.render.render(write_still=True)
print('WARDEN COMPLETE',json.dumps(stats),flush=True)
