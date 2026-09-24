"""Original pine spray atlas. Requires Python 3 + Pillow; no external images."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps, ImageEnhance
import math
import random

ROOT = Path(__file__).resolve().parent
random.seed(91273)
S = 2048
im = Image.new('RGBA', (S, S), (32, 51, 19, 0))
d = ImageDraw.Draw(im)

def branch(a, b, width, color):
    d.line((a, b), fill=color, width=max(1, round(width)))

def needles(a, b, count, scale):
    vx, vy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(vx, vy)
    ux, uy = vx / length, vy / length
    # Pairs of 3-needle fascicles follow the growing shoot.
    for j in range(count):
        t = j / count
        x, y = a[0] + vx * t, a[1] + vy * t
        for sign in (-1, 1):
            for fan in range(3):
                n = random.uniform(65, 120) * scale * (.78 + .22 * (1-t))
                out = sign * random.uniform(.50, .98)
                forward = random.uniform(.32, .85)
                ex, ey = x + n*(ux*forward - uy*out), y + n*(uy*forward + ux*out)
                light = random.uniform(.73, 1.30)
                col = (int(74*light), int(91*light), int(36*light), 255)
                w = random.uniform(2.8, 5.5) * scale
                nx, ny = -uy*w/2, ux*w/2
                d.polygon([(x+nx,y+ny),(x-nx,y-ny),(ex,ey)], fill=col)
                if fan == 1:
                    branch((x,y),(ex,ey),max(1,w*.22),(int(107*light),int(117*light),int(54*light),255))

stem = [(1010,1890),(1045,1550),(960,1210),(1030,845),(977,440),(1033,170)]
for i in range(len(stem)-1):
    branch(stem[i],stem[i+1],20-i*2,(72,57,32,255))
for i in range(17):
    t=(i+.3)/17
    sy=1780-t*1360
    sx=1010+math.sin(t*15)*39
    sign=1 if i%2 else -1
    reach=(1-t*.64)*random.uniform(495,690)
    end=(sx+sign*reach,sy-random.uniform(240,420))
    branch((sx,sy),end,9-t*5,(87,70,36,255))
    needles((sx,sy),end,23,1-t*.35)
    for f in (.43,.69,.9):
        ox=sx+(end[0]-sx)*f
        oy=sy+(end[1]-sy)*f
        tip=(ox+sign*random.uniform(70,150),oy-random.uniform(150,260)*(1-t*.4))
        branch((ox,oy),tip,4,(84,76,39,255))
        needles((ox,oy),tip,11,.78-t*.28)
needles((977,440),(1033,140),28,.67)
im.resize((1024,1024),Image.Resampling.LANCZOS).save(ROOT/'textures'/'pine-spray.png',optimize=True)

# A radial end-grain atlas for broken fallen timber.
random.seed(741)
wood=Image.new('RGB',(512,512),(112,83,49))
w=ImageDraw.Draw(wood)
for r in range(365,0,-1):
    ring=math.sin(r*.52 + math.sin(r*.13)*2)
    grain=random.uniform(-7,7)
    col=tuple(int(max(0,min(255,c+ring*12+grain))) for c in (127,99,63))
    w.ellipse((256-r,256-r*.95,256+r,256+r*.95),outline=col,width=2)
for a in (.48,2.8,4.65):
    start=(256+math.cos(a)*50,256+math.sin(a)*50)
    end=(256+math.cos(a)*275,256+math.sin(a)*275)
    w.line((start,end),fill=(50,39,27),width=3)
wood.save(ROOT/'textures'/'timber-endgrain.jpg',quality=91)
print('Generated original pine-spray and timber-endgrain textures.')

# Color grade the CC0 orange stone scan into cold, weathered forest granite.
# The photographic cracks and all high-frequency detail remain intact.
stone=Image.open(ROOT/'textures'/'rock_boulder_cracked_diff_1k.jpg').convert('L')
stone=ImageEnhance.Contrast(stone).enhance(1.08)
neutral=Image.merge('RGB',tuple(stone.point(lambda p,f=f:int(p*f)) for f in (.86,.90,.83)))
moss=Image.merge('RGB',tuple(stone.point(lambda p,f=f:int(p*f)) for f in (.58,.66,.28)))
random.seed(59183)
mask=Image.new('L',(32,32));mask.putdata([random.randrange(256) for _ in range(1024)])
mask=mask.resize(stone.size,Image.Resampling.BICUBIC)
mask=mask.point(lambda p:max(0,min(220,(p-105)*3)))
Image.composite(moss,neutral,mask).save(ROOT/'textures'/'forest-granite-diff.jpg',quality=94)
