# Combat choreography review

The 960×540 production battle now uses a separate, bounds-aware exchange lane for a single enemy strike. The selected defender steps beyond the party, braces, receives the contact, and returns. The attack crop's leading extent determines horizontal reach; measured source-tip height aligns long spears, claws, beaks, and fists with the defender. Other companions keep their formation. Charged all-party attacks remain at the enemy's home and send a compact wave into the crew.

Coordinated techniques retain the existing action contact, damage, MP, and readiness rules:

- **Harbor Break:** Kaida approaches Rune's braced shield, plants at 0.46–0.54 seconds, rises above the other enemies, then dives to the selected target at 0.93 seconds. Rune stays in guard. The return uses left-facing walking frames.
- **Shelterlight:** Vex casts and Rune guards through contact. A restrained pale ribbon and three moving petals join them; the target recovery rings rise with the authoritative timeline.
- **Prism Cut:** Vex feeds Kaida's prism; colored pixel ribbons carry a refracted blade fan to each selected enemy. Small faceted shards and trailing motes distinguish the contact.
- **Concord Dawn:** The three colored ribbons join at a broken, shaded pixel circle. A separate expanding sunrise and small target shards distinguish the triple attack from Prism Cut.
- **Drone Sentinel:** Its painted pulse receives a short connecting core that reaches the defender's shield rather than ending in empty air.

The timing indicator lives in the bottom command column, leaving the lower enemy lane visible. Enemy names have a restrained dark backing so ivory text remains readable on pale terrain. Floating damage numbers follow the actual visual contact position.

## Verification

`tests/choreography.mjs` captures actual production frames and uses actual keyboard choices for techniques. Presets supply party and skill prerequisites only; enemy rosters and RNG seeds choose reproducible opponents/defenders. The production update method advances exact elapsed intervals between renders. HP, MP, readiness, damage, poses, and screenshot pixels are not assigned. These are subsystem fixtures, not earned progression claims.

- `evidence/choreography-combos.json`: all four techniques passed participant MP/readiness, authoritative contact, healing pose, and shield-plant checks. Thirteen timed frames per action plus the selected-target frame.
- `evidence/choreography-enemies.json`: Frost Revenant and Ember Lord against all three heroes, plus Drone against Rune. Seven natural ATB sequences passed contact and fixed-bystander assertions. Eleven frames per action.
- `evidence/choreography-bosses.json`: Frost Colossus, Magma Behemoth, Architect Herald, and Void Architect group attacks remained anchored and hit the three living heroes at one contact. Mire Warden's single-target attack met Vex in the clear lane. Eleven frames per action.
- `evidence/browser-results-combat.json`: keyboard targeting, held-key protection, exact global pause, mouse Atlas/command/target/Execute parity, and four-enemy performance passed. No page errors, console errors, or missing assets. The 1920×1080 four-enemy sample recorded 178 frames, 8.51 ms mean and 10.30 ms p95 on this test host. This samples ordinary combat, not every scene or effect combination.
- `node --test tests/combat.test.js tests/persistence.test.js`: 23/23 passed after the final changes.

Useful review frames: `choreography-harbor_break-04.png` (shield plant), `-08.png` (contact); `choreography-prism_cut-07.png` (fan in flight); `choreography-concord_dawn-08.png` (joined sunrise); `choreography-shelterlight-07.png` (support); `choreography-frost_revenant-vex-06.png` (spear contact); `choreography-drone_sentinel-rune-06.png` (pulse-to-shield contact). All live under `evidence/`.

HMR is disconnected in both browser harnesses so concurrent development edits cannot reload the game halfway through an input sequence. The first unisolated run was invalidated by an actual development reload; the isolated rerun passed all three combat checks with a single document load.

## Defeated-pose follow-up

The old reaction timer kept a defeated enemy in `hurt` while fading it, then removed it just as `down` became available. Defeat now stamps the authoritative contact clock, renders the authored down frame at full opacity for 0.68 seconds, and fades it over 0.42 seconds. Dead foes immediately lose readiness and remain excluded from valid targets. The host advances presentation during its existing 1.35-second result interval; result updates cannot schedule actions, change resources, or award rewards.

`tests/defeat-art.mjs` legally fought the ordinary Rust Scrapper and the Void Architect using production command/target/execute flow, then captured seven exact times after the lethal contact. `evidence/defeat-art.json` records full opacity through 0.67s, 0.64 opacity at 0.83s, 0.19 at 1.02s, and removal by 1.12s. Both remained in the victory state at 1.34 seconds of the result interval and exited it at 1.36 seconds. The final-boss event opened the ending dialogue; actual keyboard navigation then reached Return and completed the campaign in Haventide.

Review `evidence/defeat-rust_scrapper-02.png` and `evidence/defeat-void_architect-02.png` for the clearly readable half-second down poses; `-04.png` shows the restrained fade. The final fixture uses the Architect's alien biome. These are legal battle sequences with preset character progression, not a claimed clean-save campaign.

The targeted `tests/browser.mjs --section=ux '--filter=save load|ending dialogue'` rerun passed both save/load/delete/corrupt-slot recovery and ending-dialogue/panel restoration after `resetSession` changed. There were no page errors, console errors, or missing assets. Combat and persistence checks now total 24/24, including a regression for down-pose hold, fade, and presentation-only result updates.

## Four-digit party HP

The earned level-38 Crown save exposed a fixed-label collision at Rune's `1132/1132`. Party status, HP label, HP number, and MP now have separate reserved widths. Four-digit HP retains its normal 9px font; measured fitting keeps longer numeric values inside their column. `tests/hp-hud.mjs` loads the unmodified `battle-void_architect` earned state through persistence and uses actual keyboard input for a normal attack. It passed with zero browser errors. The production draw pass measures 7.79 design pixels between the HP label and Rune's value, and 15.59 before MP. Actual rendered idle/contact proof is `evidence/hp-hud-earned-crown-{idle,contact}.png`, with measurements in `evidence/hp-hud-earned-crown.json`.
