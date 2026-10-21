# Steam release plan

Separate offline Electron demo/full packages and SteamPipe preparation are implemented. See [desktop.md](desktop.md) for edition scope, build/test commands, packaging boundaries and upload preparation. This file tracks remaining work; no release date is set.

## First-release scope

- Target Windows after hardware validation. Mac packages support local testing; additional advertised platforms need their own validation.
- Tentative US base price: **$1.99**, to confirm before publishing.
- Achievements, online leaderboards and Steam Cloud remain optional. Current records, ghosts and cup progress are local.

## Controller presets and dead zones

Implemented in browser, demo and full game through Settings, including the pause-menu Settings entry. Presets cover the small driving action set; arbitrary per-button remapping and rumble remain out of scope.

| Preset            | Accelerate | Brake | Boost | Airbrake |
| ----------------- | ---------- | ----- | ----- | -------- |
| Classic (default) | RT         | LT    | A     | B        |
| Shoulders         | RT         | LT    | RB    | LB       |
| Arcade            | A          | LT    | RT    | B        |

Xbox-style labels above refer to standard controller button positions.

- Left-stick steering, D-pad/stick menu navigation, A confirm, B back, Menu/Start pause and X normal race-camera cycling are shared across layouts. Off-road recovery stays automatic.
- Steering dead zone: 0–40%, default 15%, with a live stick/steering display and reset. Use D-pad while testing the stick in controller settings; other menu navigation keeps its independent 55% threshold. Steering assistance is unchanged.
- View/Select toggles music. Tunes in setup or pause opens song/volume controls; B returns to the menu.
- Presets/dead zone persist locally and update layout hints. Steam omits the in-race shortcut strip; bindings stay in Settings. Keyboard controls remain available. Settings retains the current race and its Resume action.
- Synthetic-controller checks cover all three layouts, actual driving, menu navigation, dead-zone boundaries, held buttons, pause/Settings return, disconnect/reconnect, and saved preferences. They do not certify physical hardware or Steam Input; those remain release gates below.

## Release gates

### Repository and distribution

- [ ] Move Vector Nova into a dedicated private repository when ready, including assets, local/browser tooling and desktop CI. Keep full-game build artifacts restricted to repository collaborators.
- [ ] Decide what stays publicly playable: the current browser game, a demo, or no public game. Update Pages/hosting as part of the move without affecting the other games in this repository.

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
