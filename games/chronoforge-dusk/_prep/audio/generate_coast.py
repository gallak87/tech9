"""Original deterministic coastal ambience and footfalls, no sampled recordings.
48 kHz PCM. Sea beds use filtered noise and periodic surf envelopes; the final
crossfade closes the loop. Footfalls combine a boot thump and dry granular grit.
"""
import math, random, wave, struct
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'game/audio/coast'
OUT.mkdir(parents=True,exist_ok=True)
RATE=48000

def write(name,channels):
    with wave.open(str(OUT/(name+'.wav')),'wb') as w:
        w.setnchannels(len(channels)); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<'+'h'*len(channels),*(int(max(-1,min(1,ch[i]))*32760) for ch in channels)) for i in range(len(channels[0]))))

rng=random.Random(606)
length=24*RATE
channels=[]
for channel in range(2):
    signal=[]; low=0; slow=0; last=0
    for i in range(length):
        t=i/RATE
        raw=rng.uniform(-1,1); low+=.075*(raw-low); slow+=.012*(raw-slow)
        surf=(.5+.5*math.sin(math.tau*t/8+channel*.18))**2
        swell=.5+.5*math.sin(math.tau*t/12+1.1)
        signal.append((low*.60+slow*.6+(raw-low)*.065)*(.24+.6*surf+.15*swell))
    # One-second overlap at the boundary creates a continuous playable loop.
    fade=RATE
    for i in range(fade):
        f=i/fade
        signal[i]=signal[length-fade+i]*(1-f)+signal[i]*f
    channels.append(signal[:-fade])
write('shore',channels)
for material in ['stone','wood']:
    for variation in range(4):
        signal=[]; low=0
        for i in range(int(RATE*.18)):
            t=i/RATE; raw=rng.uniform(-1,1); low+=.18*(raw-low)
            thud=math.sin(math.tau*(82 if material=='stone' else 124)*t)*math.exp(-t*55)
            grit=(raw*.23+low*.6)*math.exp(-t*(42+variation*2))
            start=min(1,t/.002)
            signal.append(start*(thud*.21+grit*.30))
        write('%s-%d'%(material,variation),[signal])
print('Wrote original stereo shoreline loop and eight mono footfalls to',OUT)
