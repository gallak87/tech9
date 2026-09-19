// Transient display state. This object never becomes part of a saved expedition.
export class ArtPreview {
  open = false;
  townCenterLevel = null;
  townCenterRegion = 'haventide';

  setOpen(open) {
    this.open = open;
    if (!open) this.resetSelection();
  }

  resetSelection() {
    this.townCenterLevel = null;
    this.townCenterRegion = 'haventide';
  }

  selectTown(region) {
    if (
      !['haventide', 'emberline', 'orbital_reach', 'last_crown'].includes(
        region,
      )
    )
      throw Error('Unknown preview town.');
    if (this.open) this.townCenterRegion = region;
  }

  selectTownCenter(level) {
    if (level !== null && (!Number.isInteger(level) || level < 1 || level > 4))
      throw Error('Preview level must be 1–4 or null.');
    if (this.open) this.townCenterLevel = level;
  }

  visualState(state) {
    return this.open &&
      (this.townCenterLevel !== null || this.townCenterRegion !== 'haventide')
      ? {
          ...state,
          townCenterArtRegion: this.townCenterRegion,
          townInteriorArtRegion: this.townCenterRegion,
          buildings: {
            ...state.buildings,
            town_center: this.townCenterLevel ?? state.buildings.town_center,
          },
        }
      : state;
  }
}
