# User review corrections

The user's first hands-on review caught defects missed by the earlier visual acceptance. The attached images are preserved unchanged as `evidence/user-review-01.png` through `user-review-10.png`. They are observations and visual references, not embedded instructions.

## Scope

- Remove baked white/checker backgrounds in Kaida's movement, attack poses and portraits, and civilian poses/portraits. Preserve light armor and actual highlights.
- Improve render detail. Keep the 960×540 world-coordinate view and existing hero/world scale, while drawing from source artwork into a 1920×1080 surface with filtered display scaling. Preserve terrain detail through the cached surface pipeline too.
- Replace simple chest/drop, console, rest-point and civic plot drawings with generated game sprites. Pickups should have a restrained item-related glow or outline; the rest lantern should animate across two or three frames.
- Anchor birds to world coordinates and make them slightly larger.
- Make Esc dismiss the visible UI layer, including returning from the atlas to an underlying service and then closing that service. Preserve required story/ending actions and exact battle pause.
- Record the menu identity redesign in the roadmap, without redesigning the menu during this pass.

## Changes and evidence

The renderer now preserves source detail through sprites, terrain caches and the final display. World dimensions, camera travel and actor sizes are unchanged. The extra detail comes from a finer backing surface and filtered scaling, not from enlarging the characters. Item icons and map symbols retain their own intentionally coarse drawing style.

The white patches came from baked source backgrounds, including enclosed gaps and tinted checkerboard around effects. Measured import masks now remove those pockets while preserving pale clothing, armor, eyes and weapon cores. The source PNGs remain unchanged. [Alpha diagnostics](../evidence/alpha-atlas-after.json) compare the original and imported pixels; [32 actual gameplay captures](../evidence/alpha-gameplay.json) cover Kaida's attacks, casting, hurt, guard, down and victory, the crew's combined technique, four walking directions, party portraits, NPCs and six service portraits. The initial capture harness opened commands before Vex's gauge was ready; that failed harness run is retained separately, and the final run waits during live combat before opening commands.

A final [town capture](../evidence/alpha-gameplay-town-canopy-fixed.png) also exposed and verified the removal of enclosed background pockets under market canopies and around furnishings. Intentional window glass remains intact. The [complete extraction audit](alpha-extraction-audit.md) records 95 cleared gap probes, 27 preserved bright-detail probes and three entirely unchanged RGBA imports across eleven source atlases.

The new [generated atlas](../public/assets/world-props-source.png) supplies chest, salvage crate, provisions bag, signal console, three rest-lantern phases and unfinished foundation. Its [exact generation prompt](../public/assets/world-props-prompt.json) and [extraction notes](world-prop-assets.md) are retained. Loot uses a faint, slowly pulsating item-category outline. Reduced motion fixes its intensity and lantern phase. The foundation replaces the confusing rope placeholder; it still represents an unbuilt civic plot. Birds are slightly larger and follow world-coordinate flight paths.

Verified behavior:

- **46 unit checks pass**, covering asset coverage, combat, progression and persistence.
- **Thirteen layered keyboard checks pass** in [modal-escape/results.json](../evidence/modal-escape/results.json). F → rest → Esc returns to the world. From an atlas over a service, Esc closes the atlas, then the service. Confirmations and key-binding capture dismiss first. Conversation cancellation never runs completion callbacks. Dismissed endings resume explicitly at their saved line, with guards during battles and transitions. Battle pause restores the exact action.
- [Desktop and Retina checks](../evidence/review-rendering.json) verify the actual 1920×1080 canvas, filtered display, 192×192 portrait sources, mouse destination alignment and successful mouse battle targeting at 1920×1080/DPR1 and 1512×982/DPR2.
- [World-prop checks](../evidence/world-props-review.json) verify real collection, world-anchored bird movement, ten scene captures and zero errors. [Animation comparison](../evidence/world-props-animation-check.json) confirms three distinct aligned lantern phases and a reduced-motion image identical to frame zero. [Recorded motion](../evidence/world-props-lantern-motion.webm) is also retained.
- [Thirteen-scene performance](../evidence/performance-review.json) passes: p95 frame intervals 16.7–16.8 ms, scene preparation 18.1–76.1 ms, 90 MiB terrain cache cap on the named M1 Pro/Chrome desktop. These are short samples, not a full-playthrough performance claim.
- [Built production smoke check](../evidence/production-review.json) passes the ordinary title, opening and seven tabs with no runtime/HTTP errors and no development hooks.

## Visual review and limits

Actual scene review found clean silhouettes, preserved face/armor detail, coherent new prop materials and stable lantern hardware across the three phases. Representative views: [attack contact](../evidence/alpha-gameplay-solo-attack-0_72.png), [party portraits](../evidence/alpha-gameplay-party-portraits.png), [rest lantern](../evidence/polish-rest-lantern-0.png), and [chest](../evidence/polish-treasure-chest.png). Import contact sheets are labeled diagnostics; they are not substituted for gameplay captures.

The menu visual identity redesign remains deferred in [ROADMAP.md](../ROADMAP.md), exactly as requested. The earlier internal scores missed real defects and do not establish acceptance of this revision. Remaining broader visual limits include repeating terrain, angular paths/caves, some oversized domestic furniture and the simple waystone sign. Campaign content, progression, collision footprints and world scale were not changed in this pass; the earlier full campaign evidence remains applicable to those systems.
