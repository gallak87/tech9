# Production practices

- Build and wire the playable loop before expanding depth.
- Freeze the source under review; serialize captures or use isolated builds.
- Use real input for controls, screenshots for appearance and frame traces for pacing. Check that a measurement detects a known positive before trusting a null result.
- Seed authored placement and separate random streams so unrelated content changes do not reshuffle the scene.
- Keep one renderer/frame loop and one camera owner. Disposable layers release their own resources.
- Record browser/GPU/viewport/preset locally when making timing claims; headless scheduling is not an isolated GPU benchmark.
- Functional correctness and visual quality need separate checks. Report a failed art gate honestly at its agreed cap.
- Preserve immutable copy metadata through ordinary consumer formatting.
- Verify that a fresh consumer can use the current source without local run files.

Apply findings as code, tests or current guidance. Keep the investigation and review history in Git or ignored local coordination, not in a permanent promotion report.
