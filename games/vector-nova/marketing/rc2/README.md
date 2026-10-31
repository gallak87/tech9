# VECTOR//NOVA trailer · RC2

Current **Blue Hour** trailer: **80.617 seconds, 4,837 frames, 1920×1080 H.264 at 60fps**, stereo AAC at 48kHz.

- [Movie](vector-nova-rc2-blue-hour.mp4).
- [Saved script](script.md) and [exact edit plan](edit-plan.json).
- [Working script](../script.md) and [working edit plan](../edit-plan.json) for future recordings.

Five seconds of the native rotating-Kestrel title lead into 0.7 seconds of black. Blue Hour’s main groove enters with Glasswake at **5.7s**. Racing, map/cup browsing, populated records and Garage alternate before the final Shatterline jump. Menu footage includes a standard cursor driven by actual pointer events and readable holds on rotating ships and stats.

Time Trial footage uses two complete valid Halcyon/Kestrel laps: **47.219s standing** and **47.394s flying**, both persisted with real ghosts. The finish excerpt shows the player following the cyan ghost through the lap line, with steady boost-free audio. Capture uses isolated careers and ordinary controls, physics and checkpoints. Personal saves are untouched.

Garage and the finale use the same fully upgraded Kestrel, Quad Core and **Jump Drive / Reserve Injector / Deflector / Lance** loadout. Blue Hour has a phase-preserving middle repeat, a return at the Shatterline launch and its natural outro at the wordmark. Music gain is 0.27; native ghost audio gain is 0.55.

The movie passed full decoding, exact format/frame-count checks and key-frame inspection. The black interval is exactly 5.000–5.700s; audio peaks at **−2.2dBFS**, with no clipping. Game/UI revision: `a7efd954740b11a8f16eef0c55ee230396f3810c`. Native Electron rebuilds remain separate.

## Sources and recording

Raw takes and detailed markers remain under ignored local directories:

- `.experiments/marketing/interwoven-v3/` — seven gameplay sources.
- `.experiments/marketing/rc2-menu/` — native title.
- `.experiments/marketing/rc2-menu-pointer/` — pointer-visible menus.
- `.experiments/marketing/rc2-trial/` — genuine trial run and saved-record fixture.
- `.experiments/marketing/rc2/` — conformed source files and assembly manifest.
- `.experiments/marketing/rc2-blue-hour/` — Blue Hour mix and validation metadata.

Use the [gameplay runner](../../tools/marketing/prototype.mjs), [menu runner](../../tools/marketing/menu-capture.mjs) and [Time Trial runner](../../tools/marketing/trial-capture.mjs) with the working script. These raw files are needed to reproduce the edit and are not bundled with the saved movie. Run captures sequentially in fresh output directories.

Movie size: **90,666,699 bytes**. SHA-256:

    a6769d0624e1d6e2ef33cc0ad4bde6d9f54593abe7394893a0661d6aec7fa687
