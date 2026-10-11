// Shared by the front end, pause menu and live free-camera panel.
export function halcyonGraphicsControls(settings) {
  return `<fieldset class="graphics-options"><legend>Halcyon road finish</legend><label class="graphics-slider"><span>Road sheen <output data-setting-output="halcyonRoadSheen">${Math.round(settings.halcyonRoadSheen * 100)}%</output><small>0% matte · 100% damp</small></span><input aria-label="Road sheen" type="range" min="0" max="1" step=".05" data-setting="halcyonRoadSheen" value="${settings.halcyonRoadSheen}"></label><label><span>Nearby reflections<small>Reflect the surrounding city</small></span><input type="checkbox" data-setting="halcyonRoadReflections" ${settings.halcyonRoadReflections ? 'checked' : ''}></label><button type="button" data-graphics-reset="halcyon">Reset asphalt finish</button></fieldset>`;
}

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
