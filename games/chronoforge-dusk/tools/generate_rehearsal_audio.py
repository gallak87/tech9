#!/usr/bin/env python3
"""Original, deterministic mono cues for the local rehearsal (no external samples)."""
import math
from pathlib import Path
import random
import struct
import wave

OUT = Path(__file__).resolve().parents[1] / 'game/audio'
RATE = 44100
for name, duration in [('swing', .22), ('impact', .24)]:
    rng = random.Random(31)
    samples = []
    low = 0.0
    phase = 0.0
    for i in range(int(RATE * duration)):
        t = i / RATE
        u = t / duration
        noise = rng.uniform(-1, 1)
        low += .18 * (noise - low)
        if name == 'swing':
            envelope = math.sin(math.pi * u) ** 1.5
            phase += 2 * math.pi * (900 - 680 * u) / RATE
            value = (.65 * low + .08 * math.sin(phase)) * envelope
        else:
            phase += 2 * math.pi * (70 + 125 * math.exp(-t * 38)) / RATE
            value = .40 * math.sin(phase) * math.exp(-t * 24) + .27 * noise * math.exp(-t * 75)
            value *= min(1, t * 1200) * min(1, (duration - t) * 200)
        samples.append(struct.pack('<h', int(max(-1, min(1, value)) * 32767)))
    with wave.open(str(OUT / (name + '.wav')), 'wb') as audio:
        audio.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        audio.writeframes(b''.join(samples))
