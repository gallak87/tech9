"""Assemble a photographic pine spray from CC0 source twigs; Pillow required.

The compound atlas groups real photographed needles into broad coherent sprays,
with coverage-preserving alpha, so crowns retain silhouettes at normal distances.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import math
import random

ROOT = Path(__file__).resolve().parent
TEX = ROOT/'textures'
random.seed(91273)
source=Image.open(TEX/'pine_tree_01_twig_diff_1k.jpg').convert('RGBA')
alpha=Image.open(TEX/'pine_tree_01_twig_alpha_1k.png').convert('L')
source.putalpha(alpha)
# The upper-left shoot is isolated; the remainder contains trunk/cone UV islands.
twig=source.crop((25,35,226,452))
isolated=twig.getchannel('A').point(lambda a:255 if a>127 else 0)
ImageDraw.floodfill(isolated,(114,375),128)
isolated=isolated.point(lambda a:255 if a==128 else 0)
twig.putalpha(isolated)
twig=ImageEnhance.Brightness(twig).enhance(1.18)
# Extend edge pigment before the small alpha dilation; avoid dark fringe pixels.
twig.putalpha(twig.getchannel('A').filter(ImageFilter.MaxFilter(3)))
S=1024
im=Image.new('RGBA',(S,S),(38,56,25,0))
d=ImageDraw.Draw(im)
d.line([(510,990),(495,710),(520,410),(514,80)],fill=(94,77,47,255),width=9)

def paste_shoot(center,length,angle,shade=1):
    h=round(length);w=round(h*twig.width/twig.height)
    sprig=twig.resize((w,h),Image.Resampling.LANCZOS)
    sprig=ImageEnhance.Brightness(sprig).enhance(shade)
    sprig=sprig.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    im.alpha_composite(sprig,(round(center[0]-sprig.width/2),round(center[1]-sprig.height/2)))

# Offset pairs overlap into irregular lobes, with several independent terminal
# shoots preserving the correct narrow-needle silhouette around cluster edges.
for j in range(7):
    t=j/6
    cy=804-t*585
    spread=210*(1-t*.54)
    for sign in (-1,1):
        angle=-sign*random.uniform(34,65)
        cx=510+sign*spread+random.uniform(-22,22)
        paste_shoot((cx,cy),random.uniform(395,470)*(1-t*.24),angle,random.uniform(.91,1.16))
        if j<5:
            paste_shoot((cx+sign*65,cy+random.uniform(-65,50)),random.uniform(240,340),angle+random.uniform(-24,24),random.uniform(.9,1.11))
for j in range(4):
    paste_shoot((512+random.uniform(-28,28),220+j*150),380,random.uniform(-17,17),1.05)
# A translucent micro edge only; the interior remains covered through mip levels.
a=im.getchannel('A');a=a.filter(ImageFilter.MaxFilter(3))
im.putalpha(a)
im.save(TEX/'pine-spray.png',optimize=True)

# An original radial end-grain atlas for broken fallen timber.
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
wood.save(TEX/'timber-endgrain.jpg',quality=91)

# Desaturate the CC0 orange scan into cold granite. Moss occupies cracks and
# broken patches rather than coating every boulder in the same broad green wash.
stone=Image.open(TEX/'rock_boulder_cracked_diff_1k.jpg').convert('L')
stone=ImageEnhance.Contrast(stone).enhance(1.15)
neutral=Image.merge('RGB',tuple(stone.point(lambda p,f=f:int(p*f)) for f in (.83,.86,.83)))
moss=Image.merge('RGB',tuple(stone.point(lambda p,f=f:int(p*f)) for f in (.54,.63,.29)))
random.seed(59183)
mask=Image.new('L',(44,44));mask.putdata([random.randrange(256) for _ in range(44*44)])
mask=mask.resize(stone.size,Image.Resampling.BICUBIC)
mask=mask.point(lambda p:max(0,min(160,(p-147)*3)))
Image.composite(moss,neutral,mask).save(TEX/'forest-granite-diff.jpg',quality=95)
print('Generated photo-derived pine sprays, original endgrain, graded granite.')

# Poly Haven's public glTF points its baseColor to JPEG, even for cutout plants.
# Reconstruct alpha from the dedicated source map before Blender export.
for asset in ('grass_medium_01','fern_02'):
    tex=ROOT/'sources'/asset/'textures'
    rgba=Image.open(tex/(asset+'_diff_1k.jpg')).convert('RGBA')
    rgba.putalpha(Image.open(tex/(asset+'_alpha_1k.png')).convert('L'))
    rgba.save(tex/(asset+'_rgba_1k.png'),optimize=True)
