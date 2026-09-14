# Party direction comparisons

Open the existing [art-lab comparison](http://127.0.0.1:4179/art-lab/kaida-guided-idle/). Choose Kaida, Vex or Rune. Each new sheet contains three static standing views generated together: front, back and right three-quarter. Compare the new right view against the approved current idle before deciding whether the additional directions preserve the character well enough.

| Hero | New sheet | Exact generation prompt | Provenance |
| --- | --- | --- | --- |
| Kaida | [candidate.png](kaida-directions/candidate.png) | [prompt.txt](kaida-directions/prompt.txt) | [generation.json](kaida-directions/generation.json) |
| Vex | [candidate.png](vex-directions/candidate.png) | [prompt.txt](vex-directions/prompt.txt) | [generation.json](vex-directions/generation.json) |
| Rune | [candidate.png](rune-directions/candidate.png) | [prompt.txt](rune-directions/prompt.txt) | [generation.json](rune-directions/generation.json) |

The built-in imagegen tool was used with the current approved idle sheet as the sole reference for each hero. Its interface does not expose a model selector or a verified model version. All three views of each hero were created in the same generation. No generated direction sheet is wired into the game.

All three outputs contain a painted checkerboard instead of real transparency. The comparison preserves those original pixels, labels the limitation, and uses manual A/B switching when transparent blending is unavailable. Kaida had one background-only cleanup attempt; it remained opaque and changed the rendering, so it is preserved separately and not used for comparison. Vex and Rune each used one call without retries.

Metadata crops keep complete figures and weapons visible, including Kaida's back-view sword that extends past the nominal middle cell. Declared visible bounds, excluding the painted background, establish one scale and baseline for all three candidate views. These bounds affect only presentation; they do not erase or edit pixels. The current reference and candidate sheets are normalized uniformly to comparable silhouette heights for inspection.

The original [breathing study](kaida-guided-idle/breathing-study.html) and all old assets remain available. Browser/game playtesting was intentionally left to the user.
