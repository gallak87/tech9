# September 2026 UI and art archive

Preserved before merging the UI/art polish branch. All retained files are byte-for-byte copies or moves; [archive-manifest.json](archive-manifest.json) records their original locations, current locations, sizes, SHA-256 hashes and selection status. No current production asset was moved.

## Interactive UI prototypes

Open these HTML files directly in a browser. Their art is embedded, and their controls use local JavaScript. They retain the original Google Fonts stylesheet links; offline use falls back to local fonts. Sample data and combat timing are illustrative, not the production rules.

- [Menu directions](ui/chronforge-menu-directions.html): early alternative compositions.
- [Parchment and signal](ui/chronforge-parchment-and-signal.html): the geometric outer menu, parchment inner pages and separate sleek battle treatment.
- [Battle accordion](ui/chronforge-battle-accordion.html): character → command → target → timing interaction prototype.
- [Prototype art payload](ui/chronforge-ui-assets.json): the reusable embedded image data used while building these visualizations.

These previously lived only in the local Codex visualizations directory. Their originals remain there; the archive makes them available from a fresh repository checkout. Later user feedback supersedes prototype colors and spacing: see [accepted UI direction](../../docs/UI_DIRECTION.md).

## Retired art and generation attempts

`art/vex/` retains the early visible-face wizard, the first faceless design with its narrow hood, the rejected walk checkerboard, and the unselected larger-hood iterations. The live game uses the two `faceless-vex-hood-v2-*.png` sources under `public/assets/vex/`.

`art/gravbot/` retains the original stone-like design and two rejected attempts at the obsidian robot with baked checkerboard backgrounds. The live game uses `public/assets/gravbot/obsidian-gravbot-source.png`.

Exact prompts, original generation paths and decisions remain in the production documentation:

- [Original companion poses](../../docs/hero-assets.md) and [directional gait prompts](../../docs/companion-walk-prompts.json).
- [Faceless Vex prompts](../../docs/vex-art-prompts.json), [hood correction prompts](../../docs/vex-hood-v2-prompts.json) and [current Vex notes](../../docs/vex-assets.md).
- [Gravbot prompts](../../docs/gravbot-art-prompts.json) and [current Gravbot notes](../../docs/gravbot-assets.md).

Historical prompt JSON and evidence intentionally retain the paths used at the time. Use the archive manifest to resolve those paths after this move. Checkerboard failures are reference material, not import-ready transparent assets.

Current screenshots and executable browser harnesses remain under `evidence/` and `tests/` so existing review links and regression commands continue to work. The separately authored Kaida animation work is unchanged; the earlier discarded colored-limb experiments were not restored.
