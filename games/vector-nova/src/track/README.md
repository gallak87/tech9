# Halcyon Viaduct — compact first level

The course is now **5,000 actual 3D arc metres**, reduced from 7,200 m by reauthoring the drawn-out perimeter. Its events are distributed throughout the lap: an early rise and approachable bank, medium descent, short ascending vault/gallery, skyline climb, middle-lap inversion, banked high connector, major plunge, then an undulating canal return. This is a new spatial route, not a speed change or a compressed distance label.

Original editable track source only. `model.js` owns the renderer-independent route and event metadata, `frames.js` owns continuous frame transport, `supports.js` owns structural clearance, `geometry.js` owns geometry and deterministic surface/sign textures, `lighting.js` owns authored fixtures and continuous light selection, and `index.js` assembles the asset.

| Feature                               |        Physical distance |
| ------------------------------------- | -----------------------: |
| Visible launch rise                   | Grid through about 590 m |
| Progressive 44° introductory bank     |                110–875 m |
| Early medium descent                  |              660–1,115 m |
| Skyline climb and short vault/gallery |            1,115–2,190 m |
| Complete 360° corkscrew               |            1,760–2,880 m |
| Fully inverted hold                   |            2,190–2,335 m |
| Banked skyline connector              |            2,905–3,385 m |
| Major 66° plunge                      |            3,400–4,180 m |
| Canal bank, gentle rise and final dip |            4,180–5,000 m |

The road remains 28 m wide. Elevation ranges from -11.4 to 525.7 m over city ground at -78 m. The redesigned centreline has a minimum 3D radius of about 105 m, versus roughly 62 m previously. One-metre chord error is below 0.5 mm; their summed length is 4,999.998 m. The early crown is deliberately reduced from 62° to 44° for the earlier introduction and reduced steering assistance. The full corkscrew, 145 m inverted hold and steep plunge remain.

`createTrack()` returns `{id,name,length,width,groundY,sample,checkpoints,sections,scenarios,signature,featureZones,structuralZones,supportLayout,supportFootprints,showcases}`. `sample(s)` accepts wrapped or unwrapped physical metres and returns `{position,tangent,right,up,quaternion,curvature,bank,roll}`. Local X/Y/Z map to right/up/tangent. `bank` is the principal signed angle; `roll` retains the authored full revolution. Quaternions and axes remain continuous through angle wrapping and the circuit seam. Eight ordered checkpoints retain their schema.

Frames use discrete parallel transport, bounded horizon guidance away from vertical tangents, and seam correction. The runtime interpolates those rotations and reprojects the right axis perpendicular to the exact route tangent. An exact-vertical-loop regression checks finite continuous frames and seam closure.

`featureZones` separates the terrain events into named metre ranges with internal representative distances. `structuralZones` separately describes the corkscrew and plunge supports. The city builder can reserve `supportFootprints`, whose entries are `{x,z,halfX,halfZ,minY,maxY}`, before building visuals; they come from the same cached layout that the track renderer uses.

The five signature scenario names remain: `signature-entry` at 1,705 m (parked), `inverted-rest` and `signature-inverted` at 2,260 m, `signature-drop` at 3,615 m, and `signature-exit` at 4,215 m. New `intro-rise`, `early-descent` and `sky-bank` scenarios expose the distributed pacing. Existing bank/rest/impact/inspection and `${section.id}-showcase` states remain.

There are 36 ordinary twin-pier stations, 21 outside suspension portals and 42 stays. Under-deck spines and transverse bearers follow the two separate structural zones. Every complete ground leg, crown and stay is checked against the full rolled road/vehicle corridor. Independent rays against the actual road mesh verify that support centres and thickness corners do not penetrate it. The environment separately reserves full-height column footprints and the road corridor.

`buildTrackVisual(track)` returns a `THREE.Group`; call `group.userData.update(unwrappedDistance)` each frame for its three practical light pools. Fixture brightness fades to zero before pool membership changes, including mixed street/tunnel spacing, reverse travel and the circuit seam. Expansion seals follow the actual road triangles with 8 mm clearance and depth bias, avoiding intersections caused by straight spline-aligned strips on grades and banks. The complete source asset contains **136 mesh batches and 251,270 triangles** before extra renderer passes. All track-owned resources are released by idempotent `group.userData.dispose()`.

Eleven owned regressions cover physical length, tightened corner radii, crossings, inversion, steep grade, frame transport, structural penetration, early pacing, active canal recovery, coherent metadata, real fixture fade continuity and every expansion seal's rendered road clearance. Shared tests cover seam axes. Source and numerical checks do not substitute for a human playtest. This user-requested iteration does not restart critic rounds or authorize a full real-time lap/video.
