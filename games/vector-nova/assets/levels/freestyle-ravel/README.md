# Ravel Sailbreak receiver foil wing

Original project-authored Blender asset, built as an independently socketed collector wing for the new Freestyle receiver installation. The canonical Ravel course and source assets remain unchanged.

Rebuild with `blender --background --factory-startup --python assets/levels/freestyle-ravel/build_receiver_wing.py` from the game directory. The editable `.blend` retains the quad membrane, smooth normals, closed six-sided rolled reinforcement, scalar fallback material and named attachment empties. The script exports the GLB and records its bounds, triangles, hashes and existing project reference-image provenance in `receiver-wing-manifest.json`.

The identity root is `receiver_foil_wing`. Coordinates are metres, +Y up, +X outboard, +Z along the receiver. Its entire inner hem is X=0,Y=0; `root` is the midpoint. Inner endpoints are Z=±700. Outer endpoints are (820,600,-700) and (820,800,700). The broad interior curl rises approximately 1,000 m above the root; the open lower space stays free of backing geometry.

The course owns loading, placements, connections, complete mesh/camera/flight clearance and cleanup. Apply the canonical unmarked Ravel Physical foil material with `center=null`. Reconstruct its required `roadCoord` attribute from the exported UVs as `(uv.x*24, uv.y*16)`; UVs themselves are `(local Z+700)/24, local X/16`. The one exported fallback material contains no textures.

## Fitted receiver jaw

`build_receiver_jaw.py` exports the independently fitted `receiver_jaw` kit to `public/assets/levels/freestyle-ravel/receiver-jaw.glb`, retaining its live Boolean bore tooling, bevels and separate editable load/service pieces in `receiver-jaw.blend`. The identity root uses metres, +Y up and +X along the retained source pin axis. Fit it at either original C-frame jaw housing centre; the existing canonical pins remain at local Y=0,Z=±16, X=-17..17, radius5. The replacement contains no duplicate pins. True annular bearing throats accept them at radius5.25, and both ±Z service faces have real open/recessed bays and integrated rail/deck shelves.

The three scalar material roles are Graphite, Titanium and Copper. Apply the owning course's canonical industrial finish. Named sockets are `receiver_jaw__jawfront`=(0,0,26), `receiver_jaw__back`=(0,0,-26), and `receiver_jaw__root`=(0,0,0). Source hashes, bounds, triangles and project-owned concept references are recorded in `receiver-jaw-manifest.json`. Only the course-private old housing component should be replaced; retain the original pin and C-frame meshes.

## Heavy receiver working bay

`build_receiver_bay.py` exports the single `receiver_service_bay` root to `public/assets/levels/freestyle-ravel/receiver-bay.glb`. Metres, +Y up, mating/back plane Z=0, deep open front facing -Z. The three-metre floor is at Y=0. A four-metre roof carrier, formed titanium overhang, substantial cheeks with real side apertures and closed triangular returns form one connected working volume. A large copper winding roller seats into actual floor pedestals and open annular bearings; no cables or loose props are included.

Fit `receiver_service_bay__mating_root`=(0,0,0) to the owning C-keel back face. `receiver_service_bay__front_floor`=(0,0,-70) marks the front floor. The original `.blend` retains live Boolean window tools, formed profiles and bevel modifiers; exported geometry is grouped into the Graphite, Titanium and Copper material roles. Apply the course's canonical industrial finish. Hashes, bounds, triangles and provenance are retained in `receiver-bay-manifest.json`.
