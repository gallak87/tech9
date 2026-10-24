# Sound expansion

VECTOR//NOVA needs satisfying, recognizable hardware sounds for fast anti-gravity racing. Aim for physical weight, electrical detail and immediate feedback over propulsion and deep trance/EDM. The owner listens and judges; generation quality alone does not establish the right style.

Give each device an identity: Vector surges, Aegis encloses, Repulsor compresses and releases, Arc energizes and cracks, Ion streams. Avoid turning everything into the same bass impact, melodic notification or cinematic swell.

## Work by complete device

Before rendering, map the entire device: acquisition/charge, each use, contact heard by the attacker, impact heard by the victim, shield block, ending, cancellation and unavailable state. Explicitly mark shared cues, retained sounds and intentional silence. A generated activation alone is not a finished device.

Generate one action per cue; code schedules the sequence from gameplay events. Prompt timing is approximate. Trim the actual attack to the event, fit charge inside its gameplay window and keep enough natural tail. Preserve sounds the owner already likes. Keep one current JSON/WAV per generated cue, replace revisions in place, and keep listening notes in chat.

Audition the whole sequence against the inspector target, then with **Shield target** checked and **Engine sound** on. Check incoming impacts separately in Sounds. The inspector, Sounds picker and gameplay use the same sound set and mix. Finish only after the owner likes the complete set, including repeated triggers and the mix with Tunes. Register source/config and edits in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json). Setup and commands live in the [generation guide](../audio/sfx.md); the [inventory](../audio/sounds.md) lists isolated cues.

## Reusable cue prompt

```text
Device: [name and physical identity]
Cue: [exact gameplay event and perspective]
Meaning: [what the driver should immediately understand]
Shape: [attack] → [body] → [tail]
Timing: [event anchor, usable charge window or repeated-use spacing]
Mix: [relative weight beside the device's other cues and propulsion]

Model prompt:
"One isolated [source/action]. [Attack], [body], [tail].
[Desired weight] futuristic machinery, dry and close.
No music, voices or repeated sequence."

Generate through local Small-SFX. Keep its current JSON/WAV, trim unused
padding, balance the cue, and connect it to the shared device audio bus.
Review it in the complete device sequence, including impact and block.
```

## Accepted character

- **Arc:** smooth electrical whip, deep pellet launches and compact rounded armor impacts. Keep the existing synthesized shots; generated activation and impacts share the actual shot/contact events.
- **Repulsor:** magnetic compression into a bass pressure punch, with a cushioned target impact. Keep the upper shelf and presence band soft.
- **Aegis:** broad warp start and rounded warp collapse. No sustained hum; propulsion fills that space. Avoid raspy, shrill or brittle glass textures. One shared collapse serves blocks, expiry and cancellation, with event-specific gain.
- **Ion and Vector:** retain their current synthesis. Ion fades its bed on expiry; unavailable pickups and Vector cancellation are intentionally silent.

The [inventory](../audio/sounds.md) is the cue reference; current JSON prompts and WAV masters live in `assets/audio/sfx/`. Gameplay and both previews use the same cue routing and samples, with no procedural fallback for replaced sounds. Attacker contacts are quieter than incoming hits; shield blocks do not also play a hull impact. Race announcements use the approved winner’s modern synth direction: electronic impact, a brief energy rise, a layered warm chord and smooth treble. The final-lap cue uses two close electronic claps with a stronger second hit to urge the driver on. The ordinary lap cue is compact, the ordinary finish is restrained, and an invalid run descends. Retain the original synthesized countdown/GO unchanged. Audition the set over propulsion and Tunes before final mix approval.
