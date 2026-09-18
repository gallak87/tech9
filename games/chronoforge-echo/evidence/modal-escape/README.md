# Layered Escape regression

Run `node tests/modal-escape.mjs` against the development server at port 4321.

All 13 focused browser checks passed with zero runtime errors. Real keyboard input covers service panels, confirmations, bindings, text-only sign reading, dialogue cancellation without callbacks, nested atlas, choices, guarded ending resumption and save/load, explicit ending completion, and exact battle pause.

Escape dismisses the top layer. Cancelling a conversation does not run its completion or choice callbacks. A dismissed ending can be explicitly resumed at its saved line; it does not reopen during battles or transitions. Results: [results.json](results.json). The isolated browser was closed after capture.
