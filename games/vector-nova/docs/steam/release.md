# Steam release plan

Separate offline Electron demo/full packages and SteamPipe preparation are implemented. See [desktop.md](desktop.md) for edition scope, build/test commands, packaging boundaries and upload preparation. This file tracks remaining work; no release date is set.

## First-release scope

- Target Windows after hardware validation. Mac packages support local testing; additional advertised platforms need their own validation.
- Tentative US base price: **$1.99**, to confirm before publishing.
- Achievements, online leaderboards and Steam Cloud remain optional. Current records, ghosts and cup progress are local.

## Controller presets and dead zones (deferred)

Planned for a later implementation pass in both demo and full game. Only the fixed Classic mapping exists today; there is no preset picker or dead-zone setting yet. Start with presets rather than arbitrary per-button remapping.

| Preset            | Accelerate | Brake | Boost | Airbrake |
| ----------------- | ---------- | ----- | ----- | -------- |
| Classic (default) | RT         | LT    | A     | B        |
| Shoulders         | RT         | LT    | RB    | LB       |
| Arcade            | A          | LT    | RT    | B        |

Xbox-style labels above refer to standard controller button positions.

- Keep left-stick steering, D-pad/stick menu navigation, A confirm, B back and Menu/Start pause consistent across presets.
- Add X for the normal chase/vista camera views. Do not add a recovery button: ordinary off-road recovery is automatic on a timer.
- Add an adjustable steering dead zone, a live stick indicator and reset to default. Current steering uses a 15% dead zone; menu navigation has a separate 55% threshold. Keep menu navigation independent from driving adjustments and preserve the approved 0.3 steering assistance.
- Put the preset, layout display and dead-zone control in Settings. Save the selection locally and keep control hints in sync. Existing keyboard defaults remain available.
- Freecam remains debugging-only: absent from Electron releases, with browser access gated by `?dev=1`.
- Extend automation to cover each preset, dead-zone boundaries, controller-only menus/driving/pause/results, held-button transitions and disconnect/reconnect. Current automated controller coverage is limited to input interpretation and a menu confirm/back smoke test. Real Windows/Steam controller testing remains necessary.

## Release gates

### Build and playtesting

- [ ] Run the desktop CI workflow on GitHub for both editions and target platforms.
- [ ] Test the packaged Windows builds on a clean machine: all courses, a complete cup, Time Trial records/ghosts, repeated races, track switching and ship inspection.
- [ ] Validate controller-only play, physical mappings, unplug/reconnect, Steam Input/overlay, keyboard navigation, alt-tab, fullscreen, resizing and audio.
- [ ] Test demo/full Steam installs and private-branch updates, including offline play, save persistence and separate edition data.
- [ ] Measure startup, frame pacing and memory on representative hardware; publish system requirements based on those measurements.
- [ ] Resolve release-blocking playtest findings. First acceptance milestone: a friend installs the Windows build and plays offline entirely with a controller.

### Publisher and store

- [ ] Choose the publishing identity; complete Steamworks agreements, identity, banking and tax setup. Check current [onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding) and [Steam Direct fee](https://partner.steamgames.com/doc/gettingstarted/appfee) requirements.
- [ ] Create and associate full-game/demo App IDs, assign separate Windows depots and configure their launch executables; use the [SteamPipe procedure](desktop.md#steampipe).
- [ ] Confirm commercial rights and required notices against the [asset manifest](../ASSET_MANIFEST.json), [music provenance](../audio/README.md) and [SFX terms](../audio/sfx.md). Complete the [content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey), including generated art/music disclosures.
- [ ] Prepare an accurate description, gameplay screenshots, capsule/library art and a short trailer. Set languages, supported platforms, measured requirements and [regional pricing](https://partner.steamgames.com/doc/store/pricing).
- [ ] Obtain [store/build review](https://partner.steamgames.com/doc/store/review_process), publish Coming Soon and meet current [Steam Direct waiting periods](https://partner.steamgames.com/steamdirect/). Allow time for corrections before choosing a release date.
- [ ] Confirm the final price, build and store claims; establish bug reporting and update delivery before publishing.
