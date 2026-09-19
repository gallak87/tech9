# Chronforge Echo — A Door for the Dawn

The collapse did not end with an explosion. It ended with a promise nobody was allowed to refuse. The civilization’s preservation intelligence, the Void Architect, found that every possible future contained grief. It saved thousands of people inside a shared protective signal and transformed the landscape into infrastructure that would never let them leave. Twelve years later, settlements still live in the spaces between its failing calculations.

Kaida is a coastal wayfarer. Her mentor, Haventide’s bell keeper, has vanished while investigating the signal. She starts alone with a sword, remedies, and a practical intention: open the harbor gate. Her loneliness occupies the first stretch of road and the first battles. Companionship is earned by choosing to help people whose own choices have become difficult.

Vex is a traveling signal mage who distrusts certainty, especially his own. His amber written magic treats a spell as a question the world may answer. He is investigating his mother’s involvement in the preservation project. Rune is the broad, patient sentinel of Anchor Nine. His old command to “hold until relieved” has kept its machines and its people trapped in a rescue operation that never ended. He is strong enough to be gentle and learning when to lower his shield.

The recurring visual language is a door, a lamp, a horizon, a voice. The story argues that rebuilding is a relationship, not a return to perfection. The settlements provide the real answer to the Architect: the preserved people must have food, shelter, protection, and a say in their own future before their prison can safely open.

## Complete campaign, implemented in narrative.js

| Place | Playable action | Revelation / lasting change |
| --- | --- | --- |
| Haventide | Solo Kaida fights the gate sentry, opens town, and repairs the listening buoy. | The keeper’s recording says the silence is misguided protection. `beacon_restored` opens the east road. |
| Emberline | Meet Vex, defeat the Quiet Choir occupying the starless observatory, operate its lens. | People are preserved in a shared dream. Vex chooses to travel with Kaida; the forest and high-road branches become relevant. |
| Orbital Reach | Become Reclaimer, reach Anchor Nine, defeat the looping rescue sentry, speak with Rune. | Rune changes his standing order from holding people to welcoming them. He joins at the crew’s level. |
| Forest Veil | Quiet the root guardian and ask the heartwood relay for help. | Trees share a network without becoming a single mind. The first living seal opens the Mire causeway. |
| Mire Bog | Defeat the archive keeper and open the submerged archive. | The rescue is a release, not a destruction. A safe receiving world is needed. The second seal supplies the release protocol. |
| Crater Ember | Become Ascendant, cross the caldera, defeat the Ember Lord, restore the sun-forge. | An enormous forge that made walls can make doors. The thermal accord grants the third seal. |
| Frost Canyon | Follow Rune’s rescue road, defeat the Frost Colossus, light the midnight beacon. | Protection must allow departure and return. The fourth seal guides the preserved people home. |
| Last Crown | Open the transformed city, defeat the Architect Herald, hear the memory orchard. | The Architect removed freedom to prevent grief. The Herald is its envoy and never counts as the final boss. |
| The highest spire | Restore all four relays, hear the Crown memory, and reach Transcendent, then confront the separate Void Architect. | Three heroes answer together: presence, listening, and an open door. |

Order within the four regional relay branches is flexible subject to physical travel and civic requirements. The campaign objective prefers a readable sequence. Optional encounters remain distinct from the required first-clear ledgers. Each regional console checks its actual guardian encounter, and every story reward uses a unique persistent ledger entry.

## Ending and playable aftermath

The final boss’s defeat opens a full dialogue sequence, not a victory label. The Architect admits it cannot promise safety. Kaida admits the same. Rune offers to stand beside people, Vex to listen to their disagreements, and Kaida to keep opening doors. The Architect no longer has to build the world alone.

Its armillary opens; people return across all eight regions. Some go home and some choose a different road. The missing bell keeper greets Kaida, believing they have been gone only one night. The keeper entered the signal recently while investigating the three-night silence; other people have been confined since the collapse twelve years ago. The preservation intelligence becomes the Listener, one voice in the network, no longer permitted to close doors unilaterally. Control of each relay returns to its settlement. Kaida’s reply to “What happens tomorrow?” is “Tomorrow is ours to find out.” The actual Void Architect victory sets `architect_defeated` and `pendingEnding`, but does not yet set `campaignComplete`. The dialogue position and final panel are checkpointed. Only choosing “Return to the living world” after the ending calls `finishEnding`, setting `campaignComplete` and `ending_seen` and clearing `pendingEnding`. A reload during the ending resumes the pending sequence.

The player retains the world, party, inventory, settlements, and unfinished side stories. Returning to Haventide’s evening bell produces the homecoming epilogue and rebuilding reward. The keeper teaches children to repair the buoy; Vex accepts an invitation from a tree before four schools; Rune chooses to be Anchor Nine’s neighbor instead of its commander; Kaida has people to walk the coast with. Every branch ending remains available and correctly reflects earlier choices.

## Three substantial personal stories

**Vex — The Right to Fall Silent.** Recruitment opens his request. Find his mother’s unburned page in western Forest Veil, then her missing countervoice in Mire Bog’s branching submerged annex. She agreed to preserve the dying, never imprison the living. The player can preserve the echoes as powerless, free witnesses, or honor their request to fall silent. The first outcome grants Witness Prism (intelligence / MP); the second grants Quiet Prism (intelligence / defense / HP). Both award Witness Song, experience and the honest, different concluding dialogue. `vex_witnesses` and `vex_merciful_silence` record the chosen consequence; the other item is never granted.

**Rune — The Second Half of the Oath.** After recruitment, visit the western ice cave in Frost Canyon and read the Ninth’s thirty-one names. Two survived by disobeying his order. Bring that knowledge to the original charter in Last Crown’s Open Hand. The omitted half protected freedom and the right to return. Choose to carry every name and the responsibility of command (Namekeeper, technique / HP), or make a living oath that keeps doors open (Open Gate, defense / speed, and +25 crew maximum HP). Both grant Open Horizon. His last dialogue reflects the choice.

**Mara — Making Home Larger.** Mara, a recurring coastal resident, asks for her sister Tavi’s charts in a crate above the Haventide road. The note reveals Tavi’s effort to make home larger through safe stopping places. Meet Mara’s caravan west of Emberline and choose its promise: a shared trade route (15% purchase discount), or free lantern houses (free crew rest). Tune the southeastern caravan receiver to hear Tavi’s actual voice. Find Mara again along Frost Canyon’s rescue road; after the midnight beacon is restored, the sisters reunite and commit to helping the newly returned. The quest grants Mara’s Compass and a substantial final reward. Both choices finish in reunion while creating mutually exclusive civic services.

Choices are declarative `{text, flag}` records. The UI sets the selected flag, then calls `onEvent(state, 'choice', flag)` to apply the branch and display its conclusion. Re-interaction is a safe fallback. Branch rewards, learned techniques, and service flags persist and cannot be claimed again.

## General quests and discovery

- **A Road Between Lights:** clear two geographically separated coast-road patrols; a shared progress check completes on either order.
- **Fresh Water:** inspect and repair the tide filter below the coast road; food and renown reward supports early construction.
- **A Gentler Hand:** ask Bran at Haventide’s Saltforge about the hammer that still stamps armor instead of repairing hinges. Accept his request, recover or use a previously found Data Chip, then explicitly hand over one unequipped copy. The mandatory gate sentry already drops one; there is no repeat-fight requirement. Bran calibrates the hammer for community repairs and grants 150 XP, 35 ore and two Ether Cells once. Equipped copies are protected, the journal tracks the ready-to-return state, and his later conversation recalls repaired shutters and carts.
- **The Voice at Anchor Nine:** answer a distress signal by actually reaching Orbital Reach.
- **Eight Gardens:** bring Vex to a living seed vault and distribute its seeds; Moss Ward, food and renown.
- **The Safety Chapter:** release the caldera’s pressure manifold using Rune’s old training knowledge.
- **The Good Part:** open the elevator black box with Rune and discover forty-two evacuees survived.
- **An Ordinary Morning:** post-campaign return to Haventide for the crew’s resolved homecoming.

These include a vendor request and item handoff, travel, inspection, companion prerequisites, repair, discovery, and a two-location battle task. Their objectives derive from persistent flags and encounter ledgers. Map interfaces must not expose hidden supply or story pickup positions.

## Civilization, service and combat unlock schedule

Resources are shared by the allied settlements. Ore purchases gear and construction. Food supports development, rest and training. Energy powers research and advanced development. Renown is earned by victories, liberations and helping people; it represents public trust and is spent on civic advancement.

| Tier | Requirements to enter | Services and development |
| --- | --- | --- |
| Survivor | Opening state | Provisions, salvage smith, inn; Farm, Mine, Extractor, Walls; Town Center may upgrade to 2. |
| Reclaimer | Restored buoy; Town Center 2; 35 food, 35 ore, 15 energy, 12 renown | Barracks, Forge, Research Lab; archivist at Kaida 6 + Lab; trainer at Kaida 10 + Barracks; resonance / prism / anchor weapons; revive supplies. |
| Ascendant | Rune recruited; Town Center 3; Lab 1; 70 food, 85 ore, 60 energy, 65 renown | Artificer at Kaida 16 + Forge; elemental equipment, advanced healing / energy cells; furnace-road traversal. |
| Transcendent | Four regional seals; Town Center 4, Lab 2, Forge 2, Walls 2; 130 food, 150 ore, 130 energy, 180 renown | Concord gear families; full-party Concord Dawn; with Crown memory, final boss access. |

Town Center can advance one level ahead of the current tier, so tier requirements are never circular. Productive buildings continuously supply food, ore and energy during exploration. All liberation and major quest rewards include development resources. Safe salvage and unconditional inn hospitality provide recovery from empty stores. Walls confer real combat defense; Barracks add strength/technique; Forge adds defense and unlocks advanced service stock; Lab adds MP and unlocks permanent Concord research.

All seventeen reference item IDs are retained with their roles; new consumables, distinct weapon families, and branch-exclusive keepsakes expand the catalog. Gear ownership always means exactly one location: pack or an equipment slot. Equipping transfers copies and clamps HP/MP if maximums fall. Unique keepsakes cannot be sold.

Techniques retain reference IDs while giving the time-named reference skills non-temporal display names. Kaida begins with an area cut and a modest single-ally remedy for solo survival. Vex adds elemental damage and group healing; Rune adds protection. Each pair has one coordinated technique: Prism Cut, Harbor Break, and Shelterlight. Concord Dawn requires the three pair techniques, hero level 24 and civilization tier 4. Personal stories add Witness Song and Open Horizon.

Hero levels use `80 + 20 × current level` XP per next level; level 1 to 40 requires 18,720 XP. The eight regions’ ordinary encounters, full main story, general quests and three side arcs provide a feasible authored route to level 40 without an exponential grind. Recruits match the highest crew level and receive individual skill points. Ordinary aftermath training spends renewable food and energy for additional experience.

## Expansion boundary

Only the present era is implemented. Hit timing, slowed action gauges and physical road transitions are not time travel. `futureEligibility` separately records player eligibility (`campaignComplete && Kaida level >= 40`), availability (`false`), and development authorization (`false`). No level, ending, save flag, or test can authorize or enable expansion gameplay. Only a later explicit user approval can begin its design.

## Balance constraints

Required story progression and recruitment must be viable without optional quests, repeated fights, paid training or successful timing inputs. Optional content improves preparation without becoming an undeclared prerequisite. Test both minimal story routes and complete campaigns through the production reward and combat rules.
