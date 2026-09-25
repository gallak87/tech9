# Capability source copies

Canonical source lives under `modules/`. Runnable scenes contain local copies under `src/capabilities/<id>/src/`, with current versions and SHA-256 records in `src/capabilities/PROVENANCE.json`. Starter forks copy the whole scene; games own those files and never import framework runtime source.

The [capability index](../modules/README.md) points to each module's working example. The agent chooses a registered starter from the catalog and builds missing game behavior in its owned game. The CLI copies tested starter bundles; it is not an arbitrary module resolver. Deliberate extra-module integration must preserve folder layout, dependencies and required licenses and be validated in the consumer.

## Maintainer workflow

Follow [FRAMEWORK_DEV.md](../FRAMEWORK_DEV.md) to promote or change a capability. Each scene's `capabilities.json` names its modules. After editing and formatting canonical source and updating versions as appropriate, from `_tech9` run:

```sh
./run run sync:modules -- --write
./run test
./run run lint
```

Then run affected scene checks and real-input verification for behavior changes. Prove a fresh source fork before making a new starter available.

Sync targets registered framework scenes only. It rejects symlinks and unexpected files rather than silently deleting them; inspect and explicitly remove retired copies before syncing. Check mode detects source/version/hash drift. Make fixes in canonical source, then sync; independently editing or formatting a copy creates drift. Keep relative module layout and license notices intact. Existing games are never updated by this tool.

These machine-readable copy records support current integrity checks. Capability graduation does not require origin-game narratives, historical evaluations or promotion reports. Keep temporary work under ignored `runs/` or `.artifacts/`.

## Local runtime

From `_tech9`, `./run --runtime` shows the selected installed Node. The launcher tries explicit `TECH9_NODE`, PATH, a bundled local runtime and installed NVM runtimes, requiring `^22.13.0 || >=24.0.0`. A bad explicit override fails. It does not download runtimes, change hooks or edit the parent shell. Its shell entrypoint supports macOS/Linux; ordinary supported Node/npm remains the portable interface.

Forest dev/preview ports are 4399/4400; pond ports are 4450/4451. Browser scripts accept `SCENE_PORT` for isolated checks. Strict ports prevent silently selecting another session's port. Native capture/focus checks need an unlocked desktop; synthetic event tests have a narrower validation scope.
