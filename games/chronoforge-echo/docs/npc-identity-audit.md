# NPC identity coverage

World sprites, dialogue portraits and service cards use the explicit canonical keys in `src/npc-identities.js`. Display names and service types no longer choose a face. All 36 local vendors, residents and refuge hosts have individual art keys; the generated-art manifest maps those keys to distinct sprites. Portraits use the same sprite as the person in the world.

The 42 world NPC objects represent 40 people: 36 locals, Mara, Tavi, Vex and Rune. Kaida and the bell Keeper also have story speaker entries. Four formerly anonymous town residents now have names; Emberline’s refuge host is Perrin, distinct from Anchor Nine’s innkeeper Pell.

## Source of the mismatch

Dialogue previously searched every scene for the first NPC sharing the speaker label’s first word. Every “A local resident” selected Haventide’s first match, while the world body used a hash of the actual object ID. Vendors independently selected the same six bodies by service index in every town. Both routes are removed.

Narrative lines carry `speakerId`, with exact authored aliases for recordings, signals, Bran’s forge quest and Tala’s seedkeeper dialogue. Generic notes, machine voices, unidentified recorded witnesses and Countervoice remain deliberately text-only. Camps have no invented host portrait.

## Mara’s journey

Mara appears in Haventide before the route charts are found, at her Emberline convoy after the charts and before Tavi’s signal, and by the Frost rescue road after the signal. When her quest is complete she returns to Haventide and Tavi stays at the rescue road. The existing quest flags, choices, rewards and gates remain unchanged. Visibility and interaction eligibility share `npcPresent`; these stages also work on existing saves.

## World coverage

| Scene | Object | Display name | Identity | Service |
| --- | --- | --- | --- | --- |
| emberline | mara_convoy | Mara’s caravan | mara | Conversation |
| frost_canyon | mara_lantern | Mara • Keeper of lights | mara | Conversation |
| frost_canyon | tavi_lantern | Tavi • Keeper of the rescue light | tavi | Conversation |
| haventide_town | haventide_provisions | Iona • Tide & Table | haventide_provisions | provisions |
| haventide_town | haventide_smith | Bran • Saltforge | haventide_smith | smith |
| haventide_town | haventide_inn | Nessa • The Quiet Bell | haventide_inn | inn |
| haventide_town | haventide_archivist | Sio • Salvaged Letters | haventide_archivist | archivist |
| haventide_town | haventide_artificer | Ilex • Glass & Copper | haventide_artificer | artificer |
| haventide_town | haventide_trainer | Tarin • The Sparring Yard | haventide_trainer | trainer |
| haventide_town | haventide_resident | Lark • Tidewatch volunteer | haventide_resident | Conversation |
| haventide_town | mara | Mara | mara | Conversation |
| emberline_town | emberline_provisions | Saff • Dry Goods | emberline_provisions | provisions |
| emberline_town | emberline_smith | Oro • The Brass Anvil | emberline_smith | smith |
| emberline_town | emberline_inn | Ley • Lantern House | emberline_inn | inn |
| emberline_town | emberline_archivist | Tess • Horizon Charts | emberline_archivist | archivist |
| emberline_town | emberline_artificer | Juno • Sunspun Works | emberline_artificer | artificer |
| emberline_town | emberline_trainer | Rhys • Sandfoot School | emberline_trainer | trainer |
| emberline_town | emberline_resident | Kesh • Caravan outrider | emberline_resident | Conversation |
| emberline_town | vex | Vex | vex | Conversation |
| orbital_reach_town | orbital_reach_provisions | Uma • Winter Stores | orbital_reach_provisions | provisions |
| orbital_reach_town | orbital_reach_smith | Edda • Anchor Smith | orbital_reach_smith | smith |
| orbital_reach_town | orbital_reach_inn | Pell • A Warm Place | orbital_reach_inn | inn |
| orbital_reach_town | orbital_reach_archivist | Niv • Signal Library | orbital_reach_archivist | archivist |
| orbital_reach_town | orbital_reach_artificer | Lio • Ninth Laboratory | orbital_reach_artificer | artificer |
| orbital_reach_town | orbital_reach_trainer | Gant • Sentinel Drill | orbital_reach_trainer | trainer |
| orbital_reach_town | orbital_reach_resident | Daro • Anchor mechanic | orbital_reach_resident | Conversation |
| orbital_reach_town | rune | Rune | rune | Conversation |
| last_crown_town | last_crown_provisions | Asha • Garden Provisions | last_crown_provisions | provisions |
| last_crown_town | last_crown_smith | Cairn • Living Steel | last_crown_smith | smith |
| last_crown_town | last_crown_inn | Yula • Open Hearth | last_crown_inn | inn |
| last_crown_town | last_crown_archivist | Vara • The Last Index | last_crown_archivist | archivist |
| last_crown_town | last_crown_artificer | Moth • Possible Things | last_crown_artificer | artificer |
| last_crown_town | last_crown_trainer | Rook • The Human Art | last_crown_trainer | trainer |
| last_crown_town | last_crown_resident | Elen • Orchard neighbor | last_crown_resident | Conversation |
| hav_house | hav_house_keeper | Anja, keeper of the tide books | hav_house_keeper | rest |
| ember_house | ember_house_keeper | Perrin of the rain caravan | ember_house_keeper | rest |
| forest_house | forest_house_keeper | Tala, the seedkeeper | forest_house_keeper | rest |
| mire_house | mire_house_keeper | Esme, ferrier of names | mire_house_keeper | rest |
| crater_house | crater_house_keeper | Toll, the furnace tender | crater_house_keeper | rest |
| orbital_house | orbital_house_keeper | Iri, anchor keeper | orbital_house_keeper | rest |
| frost_house | frost_house_keeper | Hale, rescuer of the Ninth | frost_house_keeper | rest |
| crown_house | crown_house_keeper | Ari, gardener of imperfect things | crown_house_keeper | rest |

## Verification

- `tests/npc-identities.test.js`: complete world registry, speaker mapping, local identity uniqueness, Mara stages and save roundtrips.
- `tests/npc-dialogues.browser.mjs`: local production game with staged adjacent saves and ordinary F/Enter/Escape interactions. Samples Orbital resident dialogue, all four town smiths, Bran’s quest, Anja and Perrin’s refuge cards, Tavi after the quest and an unattended camp.
