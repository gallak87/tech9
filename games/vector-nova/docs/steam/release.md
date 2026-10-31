# Steam release plan

## First-release scope

- **Planned US base price: $7.99.** Regional prices, any launch discount and the release date remain undecided.
- Target Windows after hardware validation. Mac packages currently support owner testing; other advertised platforms need their own validation.
- Records, ghosts, careers and cups are local. Steam achievements, online leaderboards and Cloud remain optional.

## Implemented

Offline demo/full Electron builds, Mac packaging, SteamPipe preparation, career/save ownership and controller/audio flows are implemented. Automated browser/native checks cover these flows; physical Windows/Steam Input testing remains below. See [desktop commands and boundaries](desktop.md).

The approved [Blue Hour RC2 trailer](../../marketing/rc2/README.md) is complete: 80.617 seconds at 1080p60, with its movie, script and edit snapshots retained. Store description, screenshots, capsule/library art and publishing still need preparation.

## Controller presets and dead zones

Use the [player controls](../../README.md#controls) and in-game Settings for presets, bindings and dead-zone calibration. Synthetic-controller coverage does not replace physical controller/Steam Input testing.

## Release gates

### Repository and distribution

- [ ] Move to a dedicated private repository and decide whether public hosting retains the browser game, a demo or neither; preserve other games' hosting.
- [ ] Restore `.github/workflows/vector-nova-desktop.yml.disabled` in the private repository and run desktop CI for both editions and target platforms.

### Build and playtesting

- [ ] Test the packaged Windows editions on a clean machine: offline install, every course, complete cups, Time Trial records/ghosts, all three careers, save transfer, repeated races and updates.
- [ ] Validate physical controller-only play, unplug/reconnect, Steam Input/overlay, keyboard navigation, alt-tab, fullscreen/resizing and audible audio. First acceptance: a friend installs the Windows build and plays offline entirely with a controller.
- [ ] Measure startup, frame pacing and memory on representative hardware, set measured system requirements and resolve release-blocking findings.

### Publisher and store

- [ ] Complete publisher identity, agreements, banking/tax and fee setup; consult current [onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding) and [Steam Direct](https://partner.steamgames.com/doc/gettingstarted/appfee) requirements.
- [ ] Associate full/demo App IDs, Windows depots and launch executables; validate private-branch Steam installs/updates, offline play and edition-separated saves using the [SteamPipe handoff](desktop.md#steampipe).
- [ ] Confirm commercial rights/notices against the [asset manifest](../ASSET_MANIFEST.json), [music provenance](../audio/README.md) and [SFX terms](../audio/sfx.md); complete the [content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey), including generated-content disclosures.
- [ ] Finish description, screenshots, capsule/library art, languages, supported platforms and regional prices; upload the approved trailer and check all store claims against the release build.
- [ ] Complete [store/build review](https://partner.steamgames.com/doc/store/review_process) and Coming Soon preparation; check current [Steam Direct timing](https://partner.steamgames.com/steamdirect/) before setting a date. Confirm any discount plan, bug-report channel and update delivery before publishing.
