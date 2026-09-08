# Kaida a1

**Playable alpha release. Model generation: r2. Runtime identity: a1.**

| Component | Current location |
| --- | --- |
| Native app | `dist/Chronoforge Dusk.app` |
| Runtime asset | [game/assets/kaida/a1](../game/assets/kaida/a1/descriptor.json) |
| Release manifest | [kaida-a1.json](../game/content/releases/kaida-a1.json) |
| Editable character | [a1/master.blend](../_prep/assets/kaida/sources/a1/master.blend) |
| Prepared package | [a1/manifest.json](../_prep/candidates/kaida/a1/manifest.json) |
| Gameplay controls and builds | [NATIVE.md](../NATIVE.md) |
| Native verification | [Release evidence](../evidence/kaida-03/README.md) |

## Included

Normal movement at 2.99 m/s uses Running.fbx; Shift-run at 6.63 m/s uses Fast Run.fbx. Both retain sword carry and use stride-matched playback, with responsive start/stop/turn, wall and slope collision, five animated roles, separate sword, approach/strike/contact/recovery/return, target reactions, hit stop, blade feedback and sound. Inspection supports replay, slow motion, stepping, rig/contact markers and saved gameplay tuning.

The runtime, source master and prepared package all use a1. The release pins the model and sword bytes by SHA-256. Original Meshy/Mixamo inputs and current editable sources remain available. Superseded exports, demos, fix scripts and iteration reports belong in Git history.

## Limits

Body proportions, fine finger contact and whole-body motion remain provisional. Defeat uses a held hurt pose and a fall that can intersect props. The rehearsal target is a diagnostic mannequin. Final art and audio polish are outside this alpha cutoff.

**03 stops here for owner review. 04 is paused.**
