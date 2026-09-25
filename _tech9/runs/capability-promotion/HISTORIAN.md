# Pilot evidence used during promotion

Read-only historian `promotion_historian` compared the three accepted pilots while builders worked. The user explicitly accepted hunting/fishing playtests and requested all four promotions now. This report supplies provenance and integration cautions rather than an additional approval gate.

## Sources and demonstrated contracts

| Capability              | Evidence                                                                                                            | Promotion boundary                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grounded movement/input | Alder Signal `5099e1fb`; Pinewatch `236e569a`; Stillwater `48f6b9ce`                                                | Inject camera/canvas/bounds/ground, gate move/look, clear held state, handle owned pointer lock, dispose listeners. Keep bow actions, crouch/FOV, fishing states and menus in consumers. |
| Placement collisions    | Pinewatch deadfall proxies from rendered instance transforms; Stillwater `BANK_ROCKS` shared by rendering/collision | Conservative horizontal circles and log chains. Authored placements remain the authority; no full-physics claim or generic asset-name matching.                                          |
| Supported Node          | Both new consumers encountered unsupported default Node; Stillwater `play.sh` selects a compatible executable       | Explicit override, supported local discovery, argument forwarding and clear errors. No silent runtime installation or hook changes.                                                      |
| Pond water              | Stillwater shoreline, carved terrain, vegetation exclusion, `PondWorld` and MIT-derived `WaterSurface`              | Promote the coupled pond example, quality budgets and disposal. This is a user-authorized first-game extraction, not evidence of multiple water consumers.                               |

## Pitfalls carried into implementation and validation

- Disabled controls must not prevent menu keys or act while an input/button has focus. Pinewatch corrected a real menu-default regression.
- Pause, blur, hidden-tab and owned pointer-lock exit clear held/drag input. Disposal is idempotent and cannot pause another controller. A pending pointer-lock acquisition must not outlive disable/disposal.
- Movement normalizes diagonals, bounds time steps and subdivides travel to avoid tunneling; the whole player footprint matters at a shoreline.
- Water's shader duplicates shoreline shape unless its GLSL and CPU geometry share the same definition. Keep the frame and harmonics aligned.
- Reflection targets need bounded size/cadence, a valid quality fallback and explicit disposal, including partial initialization.
- Water geometry alone is insufficient: vegetation filtering, basin ground height, shore boundary and authored-rock collisions must agree.
- Headless input-handler tests and native OS mouse/focus validation are different evidence. Preserve any unavailable native checks as limitations.

## Source and license records

Retain source file/commit references without reusing game fork receipts as module receipts. WaterSurface derives from Three.js 0.186.1 under MIT; preserve `THREE-LICENSE.txt` and attribution. The shore-rock JPEGs are copies of the starter's CC0 Poly Haven scans, already documented in its asset index. Procedural normals and shore geometry were locally authored.

Pinewatch's 6.1/10 and Stillwater's 7.2/10 four-round results remain historical game assessments. They neither block this explicitly requested extraction nor establish a new framework art pass. Native pointer-capture/focus follow-ups from the game reports remain distinct from the user's general playtest acceptance.

## Integration decisions

Use one owner for each authored world file. Walking/collision integration modifies the forest example; water owns a separate pond example. Shared module source is copied into these runnable consumers with version/hash records, then inherited by future standalone forks. Accepted games are unchanged. Final engineering review checks the promoted implementation independently of this historian inventory.
