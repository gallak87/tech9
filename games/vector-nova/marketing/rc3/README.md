# VECTOR//NOVA trailer · RC3

**Approved on 2026-10-31.** This is the current Blue Hour trailer.

- [Movie](vector-nova-rc3-blue-hour.mp4): **80.617 seconds · 4,837 frames · 1920×1080 H.264 / 60fps export · stereo AAC / 48kHz**.
- [Saved script](script.md) and [exact edit plan](edit-plan.json).
- [Working script](../script.md) and [working edit plan](../edit-plan.json).

All gameplay, title and menu picture was recorded again against the current art/UI revision `4f7b80a14cd9fa2f6a4a578ed91f560c932100a1`. The approved Blue Hour arrangement, opening beat drop at **5.7s**, interwoven timeline and Shatterline finale timing are retained. There are no added feature overlays, speed ramps or frame interpolation.

## Flying-lap ghost revision

The isolated Halcyon/Kestrel run completed a genuine **47.219s standing warm-up** followed by a **40.975s flying lap** using ordinary controller input and production checkpoints. The four-second excerpt spans the flying-lap line crossing and the next lap's actual ghost appearance. It does not pace behind the standing-start ghost. The cyan flying ghost separates naturally as the player takes another line; both saved records populate the preceding Records screen. Personal careers were untouched.

The raw excerpt is **90.7971–94.7971s**. The capture clock marks the line about one second into it and the first readable native flying ghost about half a second after crossing. Garage and the finale retain the same fully upgraded Kestrel, Quad Core and Jump Drive / Reserve Injector / Deflector / Lance loadout.

## Capture and checks

Capture host: **Apple M1 Pro, Chrome 156, High graphics, 1600×900 CSS viewport**. Default device scale is 1; the selected Umbra and Zephyr retakes use 0.8 to improve cadence while retaining High art/effects and the same UI framing. The 60fps export does not imply every source rendered at 60fps: edited Umbra averaged about **43 unique frames/s**, Zephyr about **53**, and the other gameplay excerpts were near 60. No motion interpolation was applied.

Full decode passed. The sole black interval is **5.000–5.700s**; closing wordmark begins at **77.216667s**. Audio peaks at **−3.16dBFS** with no clipping, NaNs or infinities. Music gain remains 0.27 and ghost native-audio gain 0.55. Native race checks confirmed Nacre's hit/pass/C change, clean jump/landing transitions and matching finale loadout; native frames were inspected for the ghost reveal and current menus.

## Sources and reproduction

Keep the accepted raw takes and markers under ignored local directories:

- `.experiments/marketing/rc3/gameplay-v1/` — seven freshly recorded gameplay setups.
- `.experiments/marketing/rc3/gameplay-cadence-v3/` — selected Umbra/Zephyr retakes.
- `.experiments/marketing/rc3/trial-v2/` — genuine laps, saved-record fixture and flying-ghost reveal.
- `.experiments/marketing/rc3/menu-v1/` — native title and pointer-visible menus.
- `.experiments/marketing/rc3/assembly-v1/` — conformed sources, assembly manifest and validation log.
- `.experiments/marketing/rc3/conform.mjs` — marker conformance helper for this cut.

Use the [gameplay runner](../../tools/marketing/prototype.mjs), [menu runner](../../tools/marketing/menu-capture.mjs) and [Time Trial runner](../../tools/marketing/trial-capture.mjs). Actual captures run sequentially. The working edit plan can reassemble the conformed manifest with `prototype.mjs --assemble-only`; raw footage is not bundled separately with this movie.

Movie size: **91,923,470 bytes**. SHA-256:

    be8053602286eeb88e5f12fec42fe89d9371367c4a65e1bf3d5f653c09d497cc
