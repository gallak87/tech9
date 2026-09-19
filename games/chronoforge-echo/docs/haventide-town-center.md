# Haventide town center: exterior pass and temporary art preview

The user's selected [four-tier source sheet](../public/assets/town-centers/haventide-town-center-tiers-v1-source.png) supplies Haventide's outdoor town center. The upgrade path progresses from a timber shelter through a rebuilt stone hall and advanced civic complex to a futuristic energy spire. The three other towns now have [their own four-tier exterior families](regional-town-centers.md). Interiors retain their existing art.

## Try the tiers locally

In the development game (`npm run dev`) on **localhost**, **127.0.0.1**, or **[::1]**, press **Backquote** (the backtick key) to open the bottom-left **Art preview** panel. No query flag is required for the key. Add **`?dev=1`** to open it automatically after starting/loading and returning to unobstructed exploration. The panel is disabled on remote hosts and excluded from production builds.

- Click **1–4**, use the number keys, or press **← / →** to cycle the four tiers.
- Select a town to temporarily show its exterior at Haventide's entrance. The party stays at Haventide and no map is revealed.
- In Haventide's outdoor map, opening the panel frames all sixteen exterior bounds without moving the party. The camera stays fixed while cycling so the growth is visible.
- **Use actual Haventide** restores its original artwork and real level while keeping the panel open.
- **Backtick, Esc or ×** closes the panel, clears the preview, and restores the previous camera.
- Play pauses while the panel is open. The preview is held outside the expedition state: it changes no resources, upgrades, civilization tier, progression, autosave, manual save or exported record.
- Loading, starting a new journey or refreshing clears the override. The panel and its styles are excluded from production builds.
- Closing/resetting cancels the rehearsal and clears captured picture buffers and temporary references. No preview data is stored in localStorage/sessionStorage. With `?dev=1`, a new or loaded session opens a fresh panel once exploration is ready.

The panel also includes an [indoor-first upgrade rehearsal](upgrade-rehearsal.md):
choose one of the three upgrade steps, trigger it at the preview desk, watch the
exterior change, and return inside. It uses the current interior art while its
four visual stages await their own pass.

## Independent world sizes

| Level | Stage | Source crop | World width × height (rounded) |
| --- | --- | --- | --- |
| 1 | Survivor | 494 × 389 px | 240 × 189 |
| 2 | Reclaimer | 574 × 560 px | 280 × 273 |
| 3 | Ascendant | 609 × 593 px | 325 × 316 |
| 4 | Transcendent | 620 × 665 px | 370 × 397 |

Each tier has an explicit width and a measured entrance anchor in [town-center-art.js](../src/town-center-art.js). Its aspect ratio stays intact. All four doors share the existing map interaction point. Foreground occlusion uses the new building bounds, including the tall spire. Existing collision geometry and entrance requirements are retained for this visual pass.

## Checkerboard extraction

The generated 1254 × 1254 file is RGB: the checkerboard is opaque artwork, not transparency. True alpha would be preferable. This import uses the same connected neutral-background extraction already used by Echo's original civic sheets.

The original PNG is preserved unchanged. Only the runtime canvas is keyed. Measured seeds remove checkerboard pockets enclosed by the bell supports, awning ropes, survey ring and crest. A narrowly scoped color threshold removes checkerboard tinted by the magenta spire glow. Pale stone, glass and metal remain protected by their outlines. Explicit crop rectangles account for the level-4 spire crossing the nominal grid row.

- [Immutable production source](../public/assets/town-centers/haventide-town-center-tiers-v1-source.png)
- Generator output: `exec-95dda299-98e0-4cb6-8448-a250360c2e9e.png`, built-in imagegen.

## Verification scope

All 85 unit checks pass, including source bounds, increasing tier dimensions, entrance anchors, visual override isolation, real persistence/export behavior and reset behavior. The production build and both root/subpath asset-resolution checks pass; the preview UI and CSS are absent from production output. A separate in-memory build compiles the development overlay and its styles without launching the game. The user requested to perform the in-game spot check; no final browser playtest was run after that instruction, and the temporary development server was stopped.
