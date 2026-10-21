# Reference-game findings

Source review for framework expansion, September 2026. Existing games keep their independently maintained implementations. These findings are not renewed gameplay or export acceptance for the reference games.

| Reference                     | Observed implementation and completion limits                                                                                                                                       | Framework entry point                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `games/void-sentinel/`        | Canvas2D scrolling shooter with menu, bosses, outcomes, restart, keyboard and pointer drag. No owning npm package or current completion report.                                     | `web-canvas2d`: no mandatory renderer dependency, world or RPG rules.                  |
| `games/vulpine/`              | Three.js flight/shooter with three world backends, audio and seven levels. Its handoff reports playable alpha with open arena, performance and balance work.                        | `web-three`; use existing flight-motion/aircraft/landscape modules where appropriate.  |
| `games/void-sentinel-breach/` | Three.js shooter with GLB preload/fallback, Blender sources and integrated event audio. Its roadmap's “audio next” note predates the source; mobile/export work is not revalidated. | `web-three`, with game-owned assets and optional Blender authoring commands.           |
| `games/void-fracture/`        | Native Godot project with scenes, scripts and resources. Source has movement/corridor/wave fixes absent from old roadmap notes; no committed export preset.                         | Deferred: requires a usable native project path, engine tooling and export validation. |
| `games/chronoforge-echo/`     | Pixi-presented Canvas sprite world with prepared artwork, viewport/touch handling and asset lifetime. Campaign, ATB and saves remain game-specific.                                 | `web-2.5d-world` and the cohesive `sprite-world` module.                               |

The review resolved concrete generation assumptions: source identity is separate from slug syntax; versions, dependencies, copies and receipts follow the chosen package; module-free scaffolds support nonforest/non-RPG compositions; logical world dimensions and backing-pixel budgets are configuration.

## Authoring tools and further extraction

Root `tools/scaffold.js` supplies useful stack taxonomy (`canvas2d`, `pixi`, `threejs`, `godot`), but its stubs do not supply complete local packages. The new minimal web sources own dependencies and runnable entries. Native support is not advertised.

Root sprite generation depends on Ollama and macOS `sips`; scenery generation and its editor disagree about seeded placement. Neither is promoted wholesale. Future authoring should preserve editable sources, use one deterministic generator, preview through the actual game camera, and validate confined output paths.

The strongest independent follow-up is a renderer-neutral audio runtime: real-gesture unlock, volume buses, bounded synthesized cues and disposal. Vulpine, Echo, Breach and weather provide concrete consumers; campaign score/event routing belongs to games. The user deferred audio extraction for review after step 03. Atlas preparation belongs with sprite-world authoring. A rigid GLB store could formalize shared geometry/texture ownership and unique instance materials, but needs a concrete consumer/example and disposal tests before extraction. Landscape already supplies kit ownership helpers; avoid a parallel implementation without a demonstrated need.

Vulpine's capture/contact-sheet scripts show useful review practices but depend on game hooks. Current starting-package browser captures cover preparation needs. Broader portable capture tooling, GLB/Blender authoring, deterministic scenery editing and native Godot support remain on the [roadmap](../ROADMAP.md).
