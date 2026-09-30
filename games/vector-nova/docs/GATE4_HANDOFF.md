# Nacre merge and active lane coordination

**Current:** Halcyon/Asterion, the initial Halcyon pickups (`a0069329`) and the Blender Kestrel (`1dfff691`) are approved and merged. Nacre is finishing one user-requested tweak; final merge is pending. This document is the remaining integration brief, not an instruction to restart production.

| Lane                       | Current context                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nacre / fzero-41           | `/Users/g/.codex/worktrees/gate4-1-nacre-tempest/tech9`, branch `codex/gate4-1-nacre-tempest`; authoritative current handoff/status live there. The new ship has already been adopted. |
| Halcyon pickups / fzero-42 | Initial implementation merged; any later user feedback remains separate. [Continuation notes](gate4-2/HANDOFF.md).                                                                     |
| Shared game                | `/Users/g/code/scratch/tech9`, branch `g/scene-test`.                                                                                                                                  |

## When the final Nacre revision is ready

1. Inspect its exact source, dirty state and current lane handoff. Preserve the active preview and user changes.
2. Reconcile shared core/renderer/camera/UI/audio/race changes with the current shared branch. Preserve `await createShip()`, the real Halcyon pickup runtime and existing feature isolation; do not reintroduce the original no-op pickup stub.
3. Preserve this lean shared documentation. Bring across current Nacre integration notes and asset provenance, but retire completed review/iteration logs after the merge. Lasting decisions belong in architecture/art/source docs, with one current status snapshot.
4. Check Halcyon plain/features, Orbital production/shape and Nacre production/shape, including controls, pause/reset/replay, asynchronous readiness and disposal. Confirm Nacre's environment is updated once per rendered frame.
5. Update the README/status/roadmap to reflect the actual merged result. Human approval and commit/merge authority come from the user, not a critic score.

Nacre's existing eight-round formal loop is closed. Its automatic failed-jump recovery keeps the lap valid and charges only elapsed recovery time. Do not restart its critic or expand scope while merging.

## Ownership and servers

Keep lane worktrees, dependencies and build outputs separate. The parent owns server coordination: shared 5179/5180, Nacre 5191/5192, pickup review 5193/5194; ship review may use 5195/5196. Verify actual ownership before using ports. No unsolicited visible browser or video. Serialize GPU captures and preserve the current owner.

The seven-level wave still waits for Nacre completion, final reuse review and a verified common foundation. Continue through the [expansion integrator handoff](EXPANSION_INTEGRATOR_HANDOFF.md); do not launch from this merge brief.
