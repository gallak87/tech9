# Sound expansion

The current Arc candidate is available in the dev Ship inspector's Powerups audition, with its ship VFX. Review the combined result before changing gameplay audio.

## Direction

VECTOR//NOVA needs satisfying, recognizable hardware sounds for its fast anti-gravity racing. The current effects feel puny and synthetic to the owner. Aim for physical weight, electrical detail and immediate feedback: crisp attacks, substantial low-mid body and controlled tails. Keep enough midrange presence to read over propulsion and the deep trance/EDM soundtrack at ordinary listening volume.

Give each device an identity: Vector surges, Aegis encloses, Repulsor compresses and releases, Arc energizes and cracks, Ion streams. Preserve those relationships across activation, use and expiry. Avoid turning every event into the same bass impact, melodic notification or long cinematic swell.

Start with **Arc · activate**, then apply what survives listening to the other pickups. Ship propulsion, collisions and environment sounds follow separately. The [sound inventory](../audio/sounds.md) remains the full list; the [generation guide](../audio/sfx.md) owns setup and commands.

Keep sound and VFX tied to the same gameplay events: activation, each shot, impact and expiry. Generate one action per cue; code schedules the sequence. Prompts describe character and progression, but cannot guarantee exact visual timing. Match the audible attack to the visible impulse and let quiet electrical texture accompany the branching corona. Arc firing pairs an electrical snap with a deep descending body; each cue stays tied to its individual shot.

## Reusable implementation prompt

```text
Create one replacement sound for VECTOR//NOVA, a fast futuristic
anti-gravity racer with a deep, driving electronic soundtrack.

Cue: [picker name and exact gameplay event]
Player meaning: [what the driver should immediately understand]
Source: [imagined physical mechanism/material]
Shape: [attack] → [body/evolution] → [tail]
Feel and pacing: [how the action should unfold and leave the player feeling]

Model prompt:
"One isolated [source/action]. [Attack description], [body description],
[tail description]. [Desired weight and intensity] futuristic machinery. Close, dry
sound effect with a clean ending. No music, speech or repeated sequence."

Let the sound develop a convincing body and natural finish; choose render
length to capture that action. Use the local Stable Audio 3 Small-SFX
workflow. Keep one current config
and WAV, replacing iterations in place. Generate one candidate, trim
unused silence and let the owner listen before integration.

After acceptance, replace only this cue in gameplay and the existing
Sounds picker. Preserve event timing, effects volume, mute and resource
cleanup. Balance it with Tunes and propulsion; check repeated triggering.
Register the accepted asset and provenance. The owner judges sound quality.
```

## Arc activation — filled implementation prompt

```text
Create the Arc · activate replacement for VECTOR//NOVA.

Cue: pickup-activate with payload.kind = "arc".
Player meaning: the ship's electrical emitter has energized and is ready.
Source: compact high-voltage coils feeding the ship's twin electrical rails.
Shape: a smooth electrical whip → a brief warm coil pulse →
fine airy crackles that fade gently away.
Feel and pacing: sleek, controlled electrical hardware. Keep the tactile
sweep of the activation with a rounded attack and restrained weight.
The ending should settle softly. Leave space for the three crisp firing
cues, each already synchronized to its shot. Far-reaching branching hull arcs
echo those impulses and carry the remaining electrical texture.

Model prompt:
"A single sleek sci-fi weapon activation. A smooth electrical whip with
a rounded, moderate attack, a brief warm coil pulse, and fine airy
crackles fading gently to silence. Compact, controlled and tactile,
close and dry. No music, voices, gunfire, heavy slam or dramatic final burst."

Use the local Small-SFX workflow. Choose enough render length for the
complete energizing action and its tail. Keep
assets/audio/sfx/arc-activate.json and its WAV as the single current
candidate. Trim unused silence while retaining the sound's character
and natural finish. Present the candidate for listening.

After acceptance, replace only Arc activation in gameplay and Sounds.
Retain Arc firing and all other cues. Preserve effects volume, mute,
pause/disposal and gameplay timing; register the accepted asset.
```

Listen for an immediate, satisfying **energize** sensation, controlled weight and a gentle finish that fits the residual electrical effects. The three shots should stay distinct and pleasant over repeated pickups. Revise from the owner's feedback before expanding the set; keep iteration discussion in chat.
