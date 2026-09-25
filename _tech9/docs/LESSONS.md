# Scoped production lessons

Lessons are evidence, not universal engine rules. Keep their limits attached.

- **Wire a playable loop before depth.** The prior Vulpine project accumulated unwired modules across parallel lanes. Require running integration and actual input before expanding a subsystem. Source: [root framework lessons](../../meta/LESSONS.md).
- **Freeze the build being measured.** Independent file ownership does not isolate a live scene from concurrent edits. Serialize captures or use an isolated checkout/server. Applicable to browser and native games.
- **Use the instrument that answers the question.** Screenshots establish appearance; actual key input and state assertions establish control behavior; frame traces establish pacing. A clean math test cannot rule out winding/culling/shader defects. Prove a measurement sees a known positive before trusting a null result.
- **Make randomness reproducible.** Seed authored placement and separate random streams when variable counts would otherwise reshuffle unrelated content. Alder Vale is bounded authored data, not world streaming.
- **Keep render ownership explicit.** One renderer/frame loop and one camera controller; disposable layers own their resources. This is enough for the current outdoor game without an ECS.
- **Performance evidence needs context.** The forest's High/Ultra settings can saturate a GPU. Record viewport, drawing buffer, preset, browser, GPU and pacing. Headless software rendering is not a hardware benchmark.
- **A beautiful prototype is not an AAA pass.** Alder Vale ended its four-round visual gate at 6.2/10. Retain the remaining tree/ground/lighting criticism instead of laundering the score through a framework migration.

Add proof-game lessons after its completed playthrough and independent review. Promote reusable code only when another game supplies a second concrete use.
