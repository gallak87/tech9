# Signal beacons

Haventide's **listening beacon** and Frost Canyon's **midnight beacon** now share
a dedicated lantern tower silhouette, separate from reward consoles. Both use
the immutable transparent `public/assets/structures/signal-beacon-source.png`.
The built-in image generation prompt and source path are in
`beacon-art-prompts.json`. The source is unlit; the renderer illuminates its two
glass panes and emits a slow amber beam once the existing restored flag is set.
Restrained motion keeps the light and beam steady.

First inspection records a persistent flag. Afterwards the nearby label shows
the actual remaining prerequisite, then an invitation to light it when ready,
then restored status. Existing saves with Haventide's `opening_seen` flag retain
the hint. Story rewards, gate conditions and interaction-to-restore are unchanged:

| Beacon | Prerequisite | Restored flag |
| --- | --- | --- |
| Haventide listening beacon | Defeat Haventide's gate sentry (`hav_guard`) | `beacon_restored` |
| Frost midnight beacon | Defeat the Frost Colossus (`frost_colossus`) | `frost_seal` |

## Other-world audit — intentionally unchanged pending design decision

These are distinct story devices, not buoys. All currently use the shared
`world_interactions` console frame (the same general terminal style previously
used by the beacons). Converting their identities requires a separate decision.

| World | Main device(s) |
| --- | --- |
| Emberline | Observatory lens; Caravan receiver |
| Forest Veil | Heartwood relay |
| Mire Bog | The submerged archive |
| Crater Ember | The sun-forge |
| Orbital Reach | The elevator oath |
| Last Crown | The memory orchard; A world left unfinished |

The weathered signal crate, tide filter and other reward/story consoles keep
their original art. Haventide's town **evening bell** is a separate ending-story
object, not a dark/unlockable road beacon, and is unchanged.

## Focused verification

`tests/beacons.browser.mjs` runs against a production preview on port 4334
(override with `ECHO_BEACON_URL`). It stages a save beside each beacon, uses
normal F/Escape/Continue controls, verifies first-inspection and reload hints,
stages the existing gate-clear flag, lights the beacon through F, and reloads
the restored save. Screenshots and report are in `evidence/beacons/`.
