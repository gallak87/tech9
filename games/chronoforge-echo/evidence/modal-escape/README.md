# Layered Escape regression

Run `node tests/modal-escape.mjs` with the development server at port 4321.

All seven focused browser checks passed, with zero browser/runtime errors. Input uses actual F, Tab, Enter, Escape and Backspace events. Fixtures select existing service positions and progression gates, prepare a battle or ending, and probe callback preservation; this is not a campaign or performance run.

Escape cancels binding capture, cancels a visible confirmation, closes the atlas, or dismisses a service/help panel, in that order. The next Escape acts on the newly revealed layer. With no dismissible layer it opens the atlas. Conversations and the ending stay intact underneath it; Backspace never advances or completes them.

Evidence in [results.json](results.json) covers the reported rest interaction, vendor/build nesting, confirmation cancellation without deleting a record, help, bindings, explicit dialogue/choice callbacks, real ending completion and exact battle pause across all seven tabs. [rest-open.png](rest-open.png) and [rest-closed.png](rest-closed.png) show the reported flow before and after one Escape. The merchant portrait was measured at 192×192 intrinsic pixels and the unchanged 96×96 CSS display size at a 1920×1080 viewport; keyboard focus remained on Rest.

The browser was closed after capture. Separately, all 24 combat and persistence invariant tests passed.
