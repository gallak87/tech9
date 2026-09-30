# Halcyon pickups — continuation only

The initial automatic Vector boost strips and Aegis shields were human-approved and merged as `a0069329`. This is current follow-up context, not a request to repeat the completed production/critic loop.

- Enable with `/?features=halcyon-pickups` on Halcyon only. Preserve the plain route, Orbital and the separate Nacre lane.
- Own `src/pickups/halcyon/**`; shared physics changes need explicit opt-in with unchanged defaults and integrator coordination.
- Devices activate on crossing, with no inventory/use-item key. Preserve manual boost, brake cancellation, nonstacking effects, forward-crossing eligibility and anti-farming.
- Shield protection removes reserve damage only; collision separation and speed loss remain. Manual recovery clears effects without rearming consumed devices.
- Runtime/lifecycle behavior is in [architecture](../../ARCHITECTURE.md) and the [adapter contract](../GATE4_RUNTIME_CONTRACT.md). Tuning and layout live in source; [asset provenance](ASSETS.md) is retained.
- Keep new user-requested work in its own checkout. Do not modify Nacre or assume initial approval covers later changes. Coordinate existing ports with their server owner; the [shared ledger](../expansion/LAUNCH_STATE.json) records reservations.
- Record only current build/checks/open issues in [status](STATUS.json). Raw evidence belongs in ignored .experiments; completed history is in Git.

The prior portrait craft-framing concern was also present on plain Halcyon and deferred. Recheck against the current Kestrel if relevant; old evidence predates the ship replacement. Foreground performance, listening and physical-device checks remain unverified.
