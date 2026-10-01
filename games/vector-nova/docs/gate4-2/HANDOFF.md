# Halcyon pickups — continuation only

The initial automatic Vector boost strips and Aegis shields were human-approved and merged as `a0069329`. This is current follow-up context, not a request to repeat the completed production/critic loop.

- Enable with `/?features=halcyon-pickups` on Halcyon only. Preserve the plain route, Orbital and the separate Nacre lane.
- Own `src/pickups/halcyon/**`; implement any necessary shared physics changes with explicit opt-in, preserve defaults and verify affected circuits yourself.
- Devices activate on crossing, with no inventory/use-item key. Preserve manual boost, brake cancellation, nonstacking effects, forward-crossing eligibility and anti-farming.
- Shield protection removes reserve damage only; collision separation and speed loss remain. Manual recovery clears effects without rearming consumed devices.
- Runtime/lifecycle behavior is in [architecture](../../ARCHITECTURE.md) and the [adapter contract](../GATE4_RUNTIME_CONTRACT.md). Tuning and layout live in source; [asset provenance](ASSETS.md) is retained.
- Keep new user-requested work in its own checkout. Do not modify Nacre or assume initial approval covers later changes. Use a free port for your own server and preserve unrelated listeners.
- Keep progress/checks/open issues in the chat and lasting decisions in the relevant docs. Raw evidence belongs in ignored .experiments; completed history is in Git.

The prior portrait craft-framing concern was also present on plain Halcyon and deferred. Recheck against the current Kestrel if relevant; old evidence predates the ship replacement. Foreground performance, listening and physical-device checks remain unverified.
