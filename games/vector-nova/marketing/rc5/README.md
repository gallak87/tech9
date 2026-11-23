# VECTOR//NOVA trailer · RC5

**Review candidate recorded 2026-11-23.** Fresh footage from the merged Track Workshop build at `8da0c2ca69fa4a22165bd5904a82357a00a914a6`.

- **98.517 seconds · 5,911 frames · 1920×1080 H.264 / 60fps · stereo AAC / 48kHz.** [Blue Hour movie](vector-nova-rc5-blue-hour.mp4)
- [Saved script](script.md) · [Exact edit plan](edit-plan.json) · [Working script](../script.md)

The cut opens with Asterion’s moving lattice and colored wakes on Blue Hour’s **5.700s** drop, then Vesper Forest. The main lift lands on Shatterline’s launch at **88.200s**. The final wordmark begins at **95.117s**.

## Footage

- **Nacre Tempest.** One race take shows Lance hitting Rook and a clean pass of Rook at about **517 km/h median**. A separate native take covers the leviathan, C vista switch, Storm Leap and full supported landing. The selected causeway approach holds **472 km/h median**, with no incoming hits, contacts or recoveries in that take. Both clips run at native speed.
- **Freestyle.** After the first two genuine transfers on Zephyr Skywell, holding Down + Left through Veil Bore produces two Corkscrews, a supported catch and a clean **×3 / +23,597** bank.
- **Eliminator and Interceptor.** On Saffron Ossuary the pilot passes Kite from last place. The same Kite is eliminated and nine ships remain. Crucible Dispatch shows Goliath’s warning, dodge, exposed rear core and an actual **54 HP** Lance critical. Both modes use ordinary controller inputs.
- **Time Trial.** Halcyon/Kestrel records are a genuine **47.219s standing warm-up** and **40.981s flying lap**. The next lap’s flying ghost appears **0.550s** after the line. The exact saved records populate the preceding UI.
- **Track Workshop.** The native Editor proposes a **349 m** Nightweir gap. Apply jump changes the route and Test this jump starts Practice on that exact draft and jump. The vehicle launches, lands on the receiver and drives away without recovery. The video trims the switch between authoring and driving.
- **Menus and finale.** The isolated career shows **31/37**, the original trophies, first-tier mode access and Fleet upgrades. Founders uses a staged completed-cup fixture rendered by the production victory panel. Horizon uses the native cup hero. Garage selects the same Quad Core Kestrel build used in the Shatterline landing. The bonus worlds and their variants, Encore and completion footage are reserved for players to discover.

## Capture

Recorded in dedicated muted Chrome tabs on an Apple M1 Pro using High graphics and native Web Audio. The Workshop editor view is silent under Blue Hour. Umbra uses 0.75 rendering scale. The export conforms sources to 60fps. Source cadence varies by scene. Every take runs at game speed.

Retained footage, markers and the isolated Time Trial fixture are under ignored `.experiments/marketing/rc5/`. `selected-takes.json` and `conform.mjs` map the original sources into `assembly-v1/`. `workshop-v3/` holds the before/applied draft and jump test evidence. The final encode uses `render-sequential.py` to run the same conform filters one clip at a time after FFmpeg’s combined graph stalled. UI takes decode from the beginning to keep static text clean. [Capture and assembly commands](../../tools/README.md)

## Validation

Full video and audio decode passed. The only black interval runs from **5.000s to 5.700s**. Decoded audio peaks at **−2.1 dBFS**. Frame review confirmed the recorded mode actions, changing menu previews, the post-line ghost, the Workshop apply and drive sequence, and the final landing.

Movie size **77,594,523 bytes**. SHA-256 `45a1e2c530d84ba914cba52002e96546af34e974aa601adfae2255d0bb9db0f9`.
