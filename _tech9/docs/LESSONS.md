# Production practices

- Build and wire the playable loop before expanding depth.
- Review committed source and serialize browser captures against that build.
- Use real input for controls, screenshots for appearance and frame traces for pacing. Confirm that a measurement detects a known positive before interpreting a null result.
- Seed authored placement and separate random streams for unrelated content.
- Keep one renderer/frame loop and one camera owner. Disposable layers release their resources.
- Record browser, GPU, viewport and preset with frame timings and measurement limits.
- Assess functional correctness and visual quality separately. Report the actual art-gate result at its agreed cap.
- Preserve immutable copy metadata through package formatting.
