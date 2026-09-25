# Scoped production lessons

Lessons are evidence, not universal engine rules. Keep their limits attached.

- **Wire a playable loop before depth.** The prior Vulpine project accumulated unwired modules across parallel lanes. Require running integration and actual input before expanding a subsystem. Source: [root framework lessons](../../meta/LESSONS.md).
- **Freeze the build being measured.** Independent file ownership does not isolate a live scene from concurrent edits. Serialize captures or use an isolated checkout/server. Applicable to browser and native games.
- **Use the instrument that answers the question.** Screenshots establish appearance; actual key input and state assertions establish control behavior; frame traces establish pacing. A clean math test cannot rule out winding/culling/shader defects. Prove a measurement sees a known positive before trusting a null result.
- **Make randomness reproducible.** Seed authored placement and separate random streams when variable counts would otherwise reshuffle unrelated content. Alder Vale is bounded authored data, not world streaming.
- **Keep render ownership explicit.** One renderer/frame loop and one camera controller; disposable layers own their resources. This is enough for the current outdoor game without an ECS.
- **Performance evidence needs context.** The forest's High/Ultra settings can saturate a GPU. Record viewport, drawing buffer, preset, browser, GPU and pacing. Headless software rendering is not a hardware benchmark.
- **A beautiful prototype is not an AAA pass.** Alder Vale ended its four-round visual gate at 6.2/10. Retain the remaining tree/ground/lighting criticism instead of laundering the score through a framework migration.

The first Alder Signal POC added concrete evidence:

- **Ordinary consumer commands belong in the fork contract.** A normal formatting pass initially rewrote the plan whose bytes were hashed in the receipt. The CLI now excludes immutable generated provenance from formatting; two real Prettier regressions and an independent review cover the fix (`4ca5d74b`).
- **Owned copies prove useful boundaries, not consumer discoverability.** The real 75-file forest fork built outside the repository, then replaced camera ownership and added a disposable game layer without framework imports or renderer changes. Its actual-input mission passed all 16 browser checks at `5099e1fb`. A fresh agent following only the docs is still a separate test.
- **Behavior and appearance need different evidence.** The game completed three repairs and a return upload through real input, but its initial AAA visual assessment was 6.0/10. Passing functional tests does not settle equipment readability or art quality. Stop at the user's playtest gate rather than silently treating either result as the other.

Evidence: [playtest QA](../runs/alder-signal/reviews/playtest-qa.json), [independent critique](../runs/alder-signal/reviews/playtest-review.json). Promote reusable code only when another game supplies a second concrete use.
