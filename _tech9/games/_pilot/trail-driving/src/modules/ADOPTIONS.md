# Additional game-owned module copies

The baseline's `PROVENANCE.json` describes the immutable initial copy. Trail Driving additionally adopted `follow-camera` version **1.0.1** from framework commit `0e03621d8aa488666754f0325da3651000509a0c`. Its source, tests and usage documentation are copied here; Three.js remains a consumer package dependency. The game-owned `DrivingCamera` wraps that copy with shared-world obstacle handling. Later framework extraction does not silently replace this accepted local implementation.
