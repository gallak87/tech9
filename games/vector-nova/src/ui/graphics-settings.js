// Shared by the front end, pause menu and live free-camera panel.
export function vesperGraphicsControls(settings) {
  return `<fieldset class="graphics-options"><legend>Vesper materials</legend><p>Compare effects live in Vesper Canopy.</p>${[
    ['vesperClearcoat', 'Resin clearcoat', 'Polished surface highlights'],
    [
      'vesperResinDetail',
      'Internal resin detail',
      'Layered strands and inclusions',
    ],
    [
      'vesperSurfaceDetail',
      'Organic surface detail',
      'Procedural bark, leaf and fungus grain',
    ],
  ]
    .map(
      ([key, label, help]) =>
        `<label><span>${label}<small>${help}</small></span><input type="checkbox" data-setting="${key}" ${settings[key] !== false ? 'checked' : ''}></label>`,
    )
    .join(
      '',
    )}<button type="button" data-graphics-reset>Restore material defaults</button></fieldset>`;
}
