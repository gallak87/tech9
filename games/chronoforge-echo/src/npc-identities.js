// Identity is authored data, independent of service type, display labels and scene order.
// World sprites, dialogue portraits and service portraits all use these same keys.
const people = {
  haventide_provisions: 'Iona • Tide & Table',
  haventide_smith: 'Bran • Saltforge',
  haventide_inn: 'Nessa • The Quiet Bell',
  haventide_archivist: 'Sio • Salvaged Letters',
  haventide_artificer: 'Ilex • Glass & Copper',
  haventide_trainer: 'Tarin • The Sparring Yard',
  emberline_provisions: 'Saff • Dry Goods',
  emberline_smith: 'Oro • The Brass Anvil',
  emberline_inn: 'Ley • Lantern House',
  emberline_archivist: 'Tess • Horizon Charts',
  emberline_artificer: 'Juno • Sunspun Works',
  emberline_trainer: 'Rhys • Sandfoot School',
  orbital_reach_provisions: 'Uma • Winter Stores',
  orbital_reach_smith: 'Edda • Anchor Smith',
  orbital_reach_inn: 'Pell • A Warm Place',
  orbital_reach_archivist: 'Niv • Signal Library',
  orbital_reach_artificer: 'Lio • Ninth Laboratory',
  orbital_reach_trainer: 'Gant • Sentinel Drill',
  last_crown_provisions: 'Asha • Garden Provisions',
  last_crown_smith: 'Cairn • Living Steel',
  last_crown_inn: 'Yula • Open Hearth',
  last_crown_archivist: 'Vara • The Last Index',
  last_crown_artificer: 'Moth • Possible Things',
  last_crown_trainer: 'Rook • The Human Art',
  forest_veil_provisions: 'Fen • Root & Ration',
  forest_veil_smith: 'Alder • The Mossforge',
  forest_veil_inn: 'Wren • The Leaflit Room',
  mire_bog_provisions: 'Osa • Reed Baskets',
  mire_bog_smith: 'Bram • Copperwake',
  mire_bog_inn: 'Mina • The Dry Lantern',
  crater_ember_provisions: 'Sula • Ashroad Stores',
  crater_ember_smith: 'Flint • Cinder Anvil',
  crater_ember_inn: 'Orin • The Cooling Hearth',
  frost_canyon_provisions: 'Eira • Whitepass Stores',
  frost_canyon_smith: 'Tor • The Thawforge',
  frost_canyon_inn: 'Una • The Last Quilt',
  haventide_resident: 'Lark • Tidewatch volunteer',
  emberline_resident: 'Kesh • Caravan outrider',
  orbital_reach_resident: 'Daro • Anchor mechanic',
  last_crown_resident: 'Elen • Orchard neighbor',
  hav_house_keeper: 'Anja, keeper of the tide books',
  ember_house_keeper: 'Perrin of the rain caravan',
  forest_house_keeper: 'Tala, the seedkeeper',
  mire_house_keeper: 'Esme, ferrier of names',
  crater_house_keeper: 'Toll, the furnace tender',
  orbital_house_keeper: 'Iri, anchor keeper',
  frost_house_keeper: 'Hale, rescuer of the Ninth',
  crown_house_keeper: 'Ari, gardener of imperfect things',
};
export const LOCAL_NPC_IDS = Object.freeze(Object.keys(people));
export const NPC_IDENTITIES = Object.freeze({
  ...Object.fromEntries(
    Object.entries(people).map(([id, name]) => [
      id,
      Object.freeze({ name, artKey: id }),
    ]),
  ),
  mara: Object.freeze({ name: 'Mara', artKey: 'civilian_0' }),
  tavi: Object.freeze({ name: 'Tavi', artKey: 'civilian_2' }),
  keeper: Object.freeze({ name: 'Keeper', artKey: 'civilian_4' }),
  ...Object.fromEntries(
    ['kaida', 'vex', 'rune'].map((id) => [
      id,
      Object.freeze({ name: id[0].toUpperCase() + id.slice(1), artKey: id }),
    ]),
  ),
});
const objectAliases = {
  mara_convoy: 'mara',
  mara_lantern: 'mara',
  tavi_lantern: 'tavi',
};
export function npcIdentity(objectOrId) {
  const id =
    typeof objectOrId === 'string'
      ? objectOrId
      : objectOrId?.npcIdentity || objectOrId?.hero || objectOrId?.id;
  const canonical = objectAliases[id] || id;
  return Object.hasOwn(NPC_IDENTITIES, canonical) ? canonical : null;
}
// These are exact authored speaker labels, not partial-name or cross-scene searches.
export const STORY_SPEAKERS = Object.freeze({
  Kaida: 'kaida',
  Vex: 'vex',
  Rune: 'rune',
  Mara: 'mara',
  'Mara’s signal': 'mara',
  Tavi: 'tavi',
  'Tavi’s note': 'tavi',
  'Tavi’s signal': 'tavi',
  Keeper: 'keeper',
  'Keeper’s recording': 'keeper',
  Bran: 'haventide_smith',
  Seedkeeper: 'forest_house_keeper',
  'Field notes': null,
  Narrator: null,
  'Heartwood relay': null,
  'Archive voice': null,
  'Sun-forge': null,
  'Architect’s memory': null,
  'Void Architect': null,
  'The Listener': null,
  Countervoice: null,
  Charter: null,
  Recorder: null,
  'The annex': null,
  'Unknown sentinel': null,
  'Coastal worker': null,
});
export const storySpeakerId = (speaker) =>
  Object.hasOwn(STORY_SPEAKERS, speaker) ? STORY_SPEAKERS[speaker] : null;
export const dialogueLine = (
  speaker,
  text,
  speakerId = storySpeakerId(speaker),
) => ({ speaker, text, speakerId });

// One traveling Mara, with the original quest flags and endpoints preserved.
export function npcPresent(object, state) {
  const f = state?.flags || {};
  switch (object?.id) {
    case 'mara':
      return !f.mara_chart || !!f.mara_arc_complete;
    case 'mara_convoy':
      return !!f.mara_chart && !f.mara_signal && !f.mara_arc_complete;
    case 'mara_lantern':
      return !!f.mara_signal && !f.mara_arc_complete;
    case 'tavi_lantern':
      return !!f.mara_arc_complete;
    default:
      return true;
  }
}
