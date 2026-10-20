# Sound expansion

VECTOR//NOVA needs satisfying, recognizable hardware sounds for fast anti-gravity racing. Aim for physical weight, electrical detail and immediate feedback over propulsion and deep trance/EDM. The owner listens and judges; generation quality alone does not establish the right style.

Give each device an identity: Vector surges, Aegis encloses, Repulsor compresses and releases, Arc energizes and cracks, Ion streams. Avoid turning everything into the same bass impact, melodic notification or cinematic swell.

## Work by complete device

Before rendering, map the entire device: acquisition/charge, each use, contact heard by the attacker, impact heard by the victim, shield block, ending, cancellation and unavailable state. Explicitly mark shared cues, retained sounds and intentional silence. A generated activation alone is not a finished device.

Generate one action per cue; code schedules the sequence from gameplay events. Prompt timing is approximate. Trim the actual attack to the event, fit charge inside its gameplay window and keep enough natural tail. Preserve sounds the owner already likes. Keep one current JSON/WAV per generated cue, replace revisions in place, and keep listening notes in chat.

Audition the whole sequence against the inspector target, then with **Shield target** checked and **Engine sound** on. Check incoming impacts separately in Sounds. The inspector, Sounds picker and gameplay use the same sound set and mix. Finish only after the owner likes the complete set, including repeated triggers and the mix with Tunes. Register source/config and edits in [ASSET_MANIFEST.json](../ASSET_MANIFEST.json). Setup and commands live in the [generation guide](../audio/sfx.md); the [inventory](../audio/sounds.md) lists isolated cues.

## Arc and Repulsor coverage

Arc and Repulsor have completed the owner’s combined sound/VFX review. Retain their current character when extending the set.

| Stage                        | Arc                                                                                 | Repulsor                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Activation / charge          | Generated smooth electrical whip, retained                                          | Generated compressed electromagnetic rise, fitted to the 0.5 s charge |
| Use                          | Retained deep synthesized pellet shots the owner liked; three separate events       | Generated rounded pressure discharge at 0.5 s                         |
| Target contact               | Generated electric armor impact at lower gain                                       | Generated cushioned pressure impact at lower gain                     |
| Incoming hit                 | Same impact at full cue gain                                                        | Same impact at full cue gain                                          |
| Shielded hit                 | Shared generated glassy field block; no duplicate hull impact                       | Same shared shield block                                              |
| Contacts during damage grace | Quieter physical impacts for the remaining pellets; no extra damage or confirmation | No repeated pulse contacts                                            |
| Finish                       | Last shot/activation tails; no extra expiry chime                                   | Discharge tail; no extra expiry chime                                 |
| Unavailable / cancellation   | Shared quiet unavailable tick; reset cancels owned voices                           | Same shared behavior                                                  |

The attacker's contact sound replaces the old confirmation beep. A victim's shield hit owns the block cue; the shielded damage notification remains silent. Range, damage grace and event timing stay unchanged.

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

## Current direction

**Arc:** a controlled electrical whip into the existing deep pellet launches; target impacts combine a compact crack and rounded armor body. The branching hull corona follows activation and each shot, while blue target outlines/glow follow contacts. Keep the ending gentle. Current prompts: [activation](../../assets/audio/sfx/arc-activate.json), [impact](../../assets/audio/sfx/arc-hit.json).

**Repulsor:** compressed air and magnetic tension gather around the ship, then release as a rounded bass pressure punch. The rose charge shell, layered pulse and short source afterglow follow that shape; the struck hull gives a cushioned, weighty impact. Current prompts: [charge](../../assets/audio/sfx/repulsor-charge.json), [discharge](../../assets/audio/sfx/repulsor-fire.json), [impact](../../assets/audio/sfx/repulsor-hit.json).

**Shield block:** a soft glassy snap and dense protective field thud, shared by both devices. Current [prompt](../../assets/audio/sfx/shield-block.json). Retain the shield's mint visual identity.
