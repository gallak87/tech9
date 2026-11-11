# VECTOR//NOVA trailer · RC4

**Approved on 2026-11-11.** This is the current Blue Hour trailer.

- [Movie](vector-nova-rc4-blue-hour.mp4): **83.433 seconds · 5,006 frames · 1920×1080 H.264 / 60fps export · stereo AAC / 48kHz**.
- [Saved script](script.md) and [exact edit plan](edit-plan.json).
- [Working script](../script.md), [working edit plan](../edit-plan.json).

The cut keeps Blue Hour's opening drop at **5.7s**, Nacre's continuous hit/pass/camera/creature/jump encounter, Umbra's gravity crossing and Shatterline's complete final landing. The main musical expansion follows Shatterline launch at **73.2s**. Native cup unlock screens lead into Freestyle and Interceptor; Garage shows Fleet upgrades and a four-slot Kestrel build. All gameplay/title/menu picture was recorded against runtime revision `6eea749c96d47dafd6190360350fffe7f9ad30ab`.

## Footage

- **Freestyle / Zephyr Skywell:** the first two transfers are genuinely driven before Veil Bore. Holding the player's suggested **left/down** combo produces two native Corkscrews, followed by a clean tube catch and **×3 / +23,478** bank. The transfer HUD and score chain remain authentic; no results, scores or landings are injected.
- **Interceptor / Goliath:** squad pursuit, physical turn, two cannon shots, a successful dodge, exposed rear core and actual Lance criticals/health loss in one ten-second cycle. Uses the stock mission's issued Lance/Reserve Injector.
- **Time Trial:** genuine **47.219s standing warm-up** and **40.981s flying lap** on Halcyon/Kestrel, persisted through production rules. The four-second excerpt crosses the line at +1s; its saved flying ghost first becomes visible at +1.602s. Those exact records populate the preceding Records page.
- **Menus:** isolated production-access showcase at **31/37**, with the 28 item claims and four original cup wins, unfinished course chains and no developer permissions. Bonus worlds, revealing mode variants, Encore and the completion cinematic stay absent, including thumbnails. Founders' trophy shot is an explicitly staged completed-cup fixture rendered by the unchanged production victory component; it is not a championship playthrough. Horizon uses actual menu browsing and its earned hero.
- **Garage/finale:** matching fully upgraded Kestrel, Quad Core and **Jump Drive / Reserve Injector / Deflector / Lance**. Browsing genuinely selects Kestrel from Shrike. Personal careers are untouched.

## Capture and validation

Host: **Apple M1 Pro · Chrome 157 · High graphics · 1600×900 CSS viewport**. Umbra uses 0.75 device scale for smoother capture; other gameplay uses 1. The 60fps export does not imply every source rendered at 60fps: Umbra is roughly 41 captured frames/s; other edited gameplay is near 60. No speed ramps or motion interpolation were applied. Native current-tab picture and Web Audio were recorded with host output muted, no microphone and in-game Tunes paused.

Full decode and frame/audio format checks passed. The sole black interval is **5.000–5.700s**; the closing wordmark begins at **80.033s**. Audio peaks at **−2.73dBFS**, with no clipping, NaNs or infinities. Native source frames and final contact sheets were inspected for combat contacts, double Corkscrews/catch/bank, cup unlock text, menu movement, saved records/ghost reveal, spoiler exclusions and finale landing. The final source's later natural sprint-results screen is outside the usable range and is excluded from the movie.

## Local sources and reproduction

Accepted takes and markers remain under ignored `.experiments/marketing/rc4/`:

- `gameplay-v1/` — Glasswake, Cindercoil, Nacre and Shatterline; `umbra-v2/` — selected gravity take.
- `freestyle-record-v3/`, `interceptor-v1/`, `trial-v2/` — native mode footage, action markers and genuine trial fixture.
- `menu-v1/` — six native title/menu sources, pointer markers and spoiler checks.
- `assembly-v2/` and `conform.mjs` — selected-source manifest, exact conformance, music arrangement and assembly inputs. Raw inputs are hard-linked locally to avoid duplicate source storage.

The reusable runners are [ordinary gameplay](../../tools/marketing/prototype.mjs), [Freestyle](../../tools/marketing/freestyle-capture.mjs), [Interceptor](../../tools/marketing/interceptor-capture.mjs), [Time Trial](../../tools/marketing/trial-capture.mjs) and [menus](../../tools/marketing/menu-capture.mjs). Capture sequentially against a server serving this checkout; each recording needs a fresh output directory. Freestyle uses `--record --full-approach --trick corkscrew --hold-seconds 4`. Pass `trial-v2/trial-fixture.json` to the menu runner with `--record-fixture`. The local conform helper rebuilds source links and metadata; `prototype.mjs --assemble-only` assembles the saved edit plan. No shipping physics, controls, balance or art changed, and no Electron build was needed.

Movie size: **98,712,404 bytes**. SHA-256:

    df0cdd15da9714e3d14952ace9d8f1c47825d5f65b9c9e1022a4152243cb6e77
