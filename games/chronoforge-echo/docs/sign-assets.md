# Outdoor waymarker

The flat arrow sign was replaced with one original generated timber-and-copper waymarker, with weathered teal paint and an engraved three-stop route motif. Its rectangular, direction-neutral board works for the southern and northern Emberline branches and for warning notices. Directions remain in the readable sign panel; the sprite contains no text or arrow.

The built-in `image_gen.imagegen` tool generated this single asset. [Exact prompt and source provenance](sign-art-prompts.json) identify the original output and selected local file, `public/assets/signs/road-waymarker-source.png`. No CLI fallback, color key, alpha repair or source-image edit was used. The source is an unchanged 1254×1254 RGBA PNG, 795,197 bytes; [alpha/hash evidence](../evidence/sign-refresh/source-alpha.json) confirms 1,180,593 fully transparent pixels, transparent corners and byte equality with the tool output.

`src/sign-art.js` defines one measured crop: `(245,101,764,1054)`, foot anchor `(385,1046)` relative to that crop, fixed height 62 world units (about 45 units wide). `assets.js` loads it as a required local asset, and `art.js` draws it with the existing world coordinate/depth system and a small contact shadow. The complete image has transparent margin; pale engraving is preserved. One source serves all nine existing outdoor `type:'sign'` objects. Domestic letters remain `type:'console'` and keep their desk sprite; world data and furniture were not changed.

`node tests/sign-art.mjs` passed: nine actual scene captures, 70 loaded assets, no page/console or asset errors, and a household-letter control. Every captured sign was visually reviewed at production 960×540 logical scale with 1920×1080 backing. The board's scale, silhouette, wood grain, pale route motif and alpha read correctly against coast, desert, forest, mire, volcanic, snow, ice and alien ground. No clipping, painted checkerboard or pale fringe was visible. These use explicitly documented party-position/camera and cleared-encounter fixtures, not earned-progression claims. The browser closed on completion and the shared server was left running.

Representative evidence:

- Emberline southern branch [before](../evidence/sign-refresh/before-ember_forest_sign.png) and [after](../evidence/sign-refresh/ember_forest_sign.png).
- [Emberline northern branch](../evidence/sign-refresh/ember_crater_sign.png), [snow](../evidence/sign-refresh/orbital_frost_sign.png), [dark volcanic ground](../evidence/sign-refresh/crater_warning.png).
- [Domestic letter unchanged](../evidence/sign-refresh/domestic-letter-unchanged.png).
- [All nine capture records](../evidence/sign-refresh/results.json).

The existing asset test's six-frame minimum was narrowed only for the new static `roadSign` kind; animated actors and previous multi-frame sheets retain the minimum. `node --test tests/assets.test.js` passes both asset tests.
