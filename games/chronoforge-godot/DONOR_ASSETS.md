# Read-only donor pointers

Root: `/Users/g/code/scratch/chronoforge-dusk-creative/games/chronoforge-dusk` (`codex/dusk-creative`, transition commit `0def60f560886833c815b6646762146dbef67a31`). Read `_prep/LIVE_ASSETS.json` and actual descriptors before copying dependencies. Preserve original/editable sources, material maps, licences and retained motion; repair paths/hashes explicitly in the new project. Copy only needed closures, not the old application.

- Selected Kaida: `game/assets/kaida/a2/model.glb`; physical descriptor/catalog and `_prep/assets/kaida/sources/a2-physical`.
- Selected Vex: `game/assets/vex/local-r1/model.glb`; `_prep/assets/vex_grounded_walk/transport/manifest.json` and selected prepared-staff metadata.
- Selected Rune: `game/assets/rune/local-r2/model.glb`; `_prep/assets/rune_grounded_walk/transport/manifest.json`, selected hammer/shield/contact contracts (no inherited archived r6 turn contract).
- Enemies: selected `game/assets/scrapper/local-r1/`, `warden/local-r1/`, `tender/local-r1/`, and actual catalog entries. Confirm identity against Echo; Warden cannot silently replace Drone Sentinel. Search donor Drone Sentinel sources before generating another model.
- Gear: `game/assets/campaign/equipment/`; reusable `prepared_melee.gd`, `prepared_vex.gd`, `prepared_rune.gd`, `melee_profiles.gd`, `melee_receive.gd`, wearable armor/accessory helpers. They are coupled to descriptors/res paths; adapt dependencies deliberately.
- Motion: retained original Mixamo and selected descriptor clip inputs. Keep recognisable gait/attack flavor. Autonomous old Rehearsal gameplay timing is not a new rules authority.
- Environments: selected coast kit/vegetation/rock/building/timber/PBR materials and Blender masters are ingredients. Old inlet world/layout/242floors/stage/camera contracts may be discarded.
- Useful UI prototype: `_prep/echo_alignment/ui_candidate.patch` contains Echo-styled HUD/title/Party equipped3D idle. It is UNVERIFIED candidate source, not an automatically applicable new-runtime patch.
- Existing Echo audio render: `game/audio/echo/`, `_prep/audio/echo_audio.json`, `_prep/audio/render_echo.mjs`. Original source module SHA823872c8246dae13b3f5a2ec5188c519a932fe2c211351fe982d3a76dc5509b3. Offline render17files, no clipping/nonfinite samples; no listening/production integration acceptance.

Legacy Dusk saves/tests/captures/r20 and unfinished Tavi-seat experiment are not new-scope evidence or required inputs. No fallback should be retained for this project. Do not modify donor `game/export_presets.cfg` or the owner's data.
