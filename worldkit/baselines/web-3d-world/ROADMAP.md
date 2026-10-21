# Baseline roadmap

- [ ] **Optimize graphics while preserving the forest's visual quality.**

  Status: planned. Profile the existing scene before choosing changes; GPU acceleration is already verified, but the dominant bottleneck has not been isolated with per-pass GPU timings.

  Investigate in this order:

  1. Measure CPU and GPU costs separately where supported, including geometry, foliage shading, atmosphere, shadow filtering and antialiasing. Compare Balanced, High and Ultra at matched viewpoints, including large/high-DPI windows. Record hardware, browser, drawing-buffer size and frame-time percentiles.
  2. Add camera-dependent levels of detail and distance culling for vegetation and trees. Preserve nearby silhouettes, blend transitions and retain useful spatial batching.
  3. Reduce foliage overdraw with tighter cutout meshes, improved clump shapes and simpler distant materials. Evaluate art quality alongside triangle and pixel cost.
  4. Evaluate adaptive scene resolution with a stable frame-rate target and native-resolution HUD. Tune atmospheric sample counts/resolution, shadow filtering and antialiasing independently to retain visible quality.
  5. Evaluate GPU-compressed textures for memory/bandwidth savings and an optional frame-rate cap for lower power use when performance has headroom. A cap is a power-control feature, not a fix for low FPS.

  Additional runtime experiments:

  - **Native Godot (near-term):** Port the same scene using shared Blender/glTF assets; tune engine-specific shading and compare frame times at matched cameras, resolution and visual quality. Measure gains rather than assume them. Consider C# for heavy custom CPU logic.
  - **WebAssembly (optional, profiling-led):** Explore only for measured CPU hotspots such as physics or pathfinding; it will not directly reduce foliage, shadow or atmosphere GPU costs. Godot web already uses Wasm and is a separate comparison from native Godot.

  Completion evidence: measured improvement on declared target hardware at comparable visual quality, before/after captures from the same trail and grove cameras, and passing browser checks including repeated quality changes and stable GPU resource counts. Preserve the five high-level tuning controls. Commit implementation; keep visual/performance review records in ignored local coordination; do not assume any individual technique will improve this scene until measured.
