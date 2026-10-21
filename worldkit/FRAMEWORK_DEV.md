# Develop a reusable environment capability

Use [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and the target module guide. Keep its canonical source in `modules/<id>/src`, source/runtime art under that module, and meaningful tests beside it. Export supported consumer interfaces through `src/` and `package.json`.

Document ownership, lifetime, renderer assumptions and performance-sensitive settings. Use static module-relative URLs for bundled art and preserve licenses. Update the package payload and consumer build check when adding a runtime asset. Existing reference games own their old source copies; no copy/sync process is required by this package.
