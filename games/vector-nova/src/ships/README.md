# Kestrel — approved silhouette, Gate 2 finish

`createShip()` returns `{group, update, dispose}`. The parent owns position and
orientation. `update({speed, boost, steer, time, energy})` accepts m/s, a boolean,
steering in −1…1, seconds and reserve in 0…1. It only animates child objects.
`dispose()` is idempotent and releases owned meshes/materials.

Local +Z is forward and +Y is up. Hardware datum is y=0; recommended road
clearance for the root is 0.72 m. Geometry bounds at rest are X ±2.2333 m,
Y −0.1015…1.4669 m and Z −3.458…3.490 m (4.47 × 1.57 × 6.95 m).
Boost exhaust extends behind those hardware bounds.

The Gate 2 asset has 25 meshes and 85,534 triangles, compared with 80,530
triangles at Gate 1 (+6.2%). Its hardware bounds and approved silhouette are
unchanged. These are source asset counts, not frame-submission totals or a
performance-target pass.

`showcase.html` is a development inspection surface, available at
`/src/ships/showcase.html` through Vite, or through an HTTP server rooted in this
application after dependencies are installed. Drag to orbit and scroll to zoom.
`window.__KESTREL.ready` becomes true after shader warmup. For reproducible
inspection use `{speed:70,boost:false,steer:0,time:0,energy:1}`. The integrated
application's inspection view also uses this same asset.

All geometry, materials and shader code were authored for this application.
No external art, textures, typefaces or models are loaded. Vulpine's
`src/render/geobuild.js` and `src/ships/ship-materials.js` informed the use of
shaped cross sections, material separation and merged detail; no source was
copied because its redistribution licence was unspecified. Runtime dependency
is only the application's Three.js package (MIT).

Verification: instantiated and updated under Node, checked every geometry
attribute for finite values, measured bounds/counts, and called dispose twice.
Captured and visually inspected front and rear/boost views using installed
headless Chrome at 1440×1080. Final capture had no browser console or page
errors. Historical captures were saved in the ignored `evidence/` directory. Gate 2
inspection uses ignored `.experiments/ship-gate2/`; no capture is part of the
runtime or committed delivery. Independent quality review remains authoritative.

## Gate 2 material and assembly finish

Recessed dark expansion joints seat below the ceramic panel edges. A cast rear
heat-exchanger surround, recessed opening and projecting titanium fins give the
aft deck layered construction. Nozzle throat liners and thin retaining rings
separate the hot core from the replaceable machined lip. All details consolidate
into existing material meshes; no extra draw calls or lights are added.

Original object-space shader finishes give ceramic subtle coating variation,
graphite mould/weave roughness, metal a brushed response and the hot nozzle
zone a restrained blue-to-straw heat tint. These stay on the moving asset and
require no external textures. Fine roughness detail fades below pixel scale.

Existing propulsion uses a narrow ion core within an open compression envelope,
merged into each existing plume mesh. Boost lengthens that short transparent
volume and drives subtle downstream flow; cruise/release keep the turbine
hardware exposed. No extra lights, draw calls, opaque discs or persistent trails
are added. Gate 2 checks used actual keyboard throttle/boost with successive
local still captures and state snapshots; the controlled bank and tunnel passes
had no impacts or browser errors. No new video recording or playback is used.

The Round 5 propulsion finish uses a smooth narrowing envelope with soft grazing
alpha and opacity extinguished before the mesh tip. Compression is represented
by broad light variation, removing the prior faceted lobe silhouette. Three-view
still sequences at boost speeds of 111–147m/s showed no browser errors or impacts;
review captures stay under ignored `.experiments/ship-gate2/soft-propulsion/`.
