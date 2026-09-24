// Device presentation preferences deliberately live outside expedition saves.
export const MOBILE_PREFERENCES_KEY = 'chronoforge-echo:device';
export const MOBILE_DEFAULTS = Object.freeze({
  controls: 'auto',
  tapWalk: true,
  doubleTapRun: true,
  handedness: 'right',
  controlSize: 1,
  zoom: 1,
  quality: 'balanced',
  loading: 'full',
  loadingChosen: false,
});
const choices = {
  controls: ['auto', 'on', 'off'],
  handedness: ['right', 'left'],
  controlSize: [1, 1.15],
  zoom: [1, 0.88],
  quality: ['balanced', 'high'],
  loading: ['full', 'mobile'],
};
export function normalizeMobilePreferences(value = {}) {
  const out = { ...MOBILE_DEFAULTS };
  if (!value || typeof value !== 'object') return out;
  for (const [key, valid] of Object.entries(choices))
    if (valid.includes(value[key])) out[key] = value[key];
  for (const key of ['tapWalk', 'doubleTapRun', 'loadingChosen'])
    if (typeof value[key] === 'boolean') out[key] = value[key];
  return out;
}
export function readMobilePreferences(storage) {
  try {
    return normalizeMobilePreferences(
      JSON.parse(storage.getItem(MOBILE_PREFERENCES_KEY)),
    );
  } catch {
    return { ...MOBILE_DEFAULTS };
  }
}
export function saveMobilePreferences(storage, preferences) {
  try {
    storage.setItem(
      MOBILE_PREFERENCES_KEY,
      JSON.stringify(normalizeMobilePreferences(preferences)),
    );
  } catch {
    /* Private browsing may prevent device preference storage. */
  }
}
export function deviceProfile({
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
  mobile = false,
  coarse = false,
  smallScreen = false,
} = {}) {
  const touch = maxTouchPoints > 0 && coarse;
  const handheld =
    maxTouchPoints > 0 &&
    (mobile ||
      /Android|iPhone|iPad|iPod/i.test(userAgent) ||
      (platform === 'MacIntel' && maxTouchPoints > 1));
  return { touch, handheld, smallScreen };
}
export function touchEnabled(preferences, device) {
  return (
    preferences.controls === 'on' ||
    (preferences.controls === 'auto' && device.touch)
  );
}
export function loadingProfile(preferences, device, developerOverride = false) {
  return (device.handheld || device.smallScreen || developerOverride) &&
    preferences.loading === 'mobile'
    ? 'mobile'
    : 'full';
}
const select = (label, key, value, entries) =>
  `<label class="setting mobile-setting"><span>${label}</span><select aria-label="${label}" data-mobile-setting="${key}">${entries.map(([v, text]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
const loadingOptions = [
  ['full', 'Full atlas', 'Download all artwork before you start.'],
  ['mobile', 'On demand', 'Download each region’s artwork as needed.'],
];
export function mobileSettingsHTML(
  preferences,
  { handheld = false, smallScreen = false, activeLoading = 'full' } = {},
) {
  return `<section class="mobile-settings"><h3>Touch &amp; device</h3>${select(
    'Touch controls',
    'controls',
    preferences.controls,
    [
      ['auto', 'Automatic'],
      ['on', 'On'],
      ['off', 'Off'],
    ],
  )}${select('Ground taps', 'tapWalk', preferences.tapWalk, [
    [true, 'Walk to tapped point'],
    [false, 'Joystick only'],
  ])}${select('Double-tap to run', 'doubleTapRun', preferences.doubleTapRun, [
    [true, 'On'],
    [false, 'Off'],
  ])}${select('Movement stick', 'handedness', preferences.handedness, [
    ['right', 'Left thumb'],
    ['left', 'Right thumb'],
  ])}${select('Control size', 'controlSize', preferences.controlSize, [
    [1, 'Standard'],
    [1.15, 'Large'],
  ])}${select('Portrait camera', 'zoom', preferences.zoom, [
    [1, 'Standard'],
    [0.88, 'Wider view'],
  ])}${select('Mobile art quality', 'quality', preferences.quality, [
    ['balanced', 'Balanced'],
    ['high', 'High'],
  ])}${
    handheld || smallScreen
      ? `${select('Asset loading', 'loading', preferences.loading, loadingOptions)}<p class="small muted">On demand loads nearby maps as needed. Full atlas loads everything at startup. Changing this setting requires a reload.</p>${activeLoading !== preferences.loading ? '<button type="button" class="button" data-mobile-reload>Save &amp; reload to apply</button>' : ''}`
      : ''
  }</section>`;
}
export async function chooseBootLoading(shell, preferences, device, storage) {
  if (!(device.handheld || device.smallScreen) || preferences.loadingChosen)
    return;
  const loading = shell.querySelector('#loading');
  shell.dataset.loadingChoice = 'true';
  loading.innerHTML = `<div class="mobile-boot"><h2>Ready for the road?</h2><fieldset class="boot-loading-options"><legend>Artwork downloads</legend>${loadingOptions.map(([value, label, description]) => `<label class="boot-loading-option"><input type="radio" name="boot-loading" value="${value}" aria-describedby="boot-loading-${value}-hint"><span><strong>${label}</strong><small id="boot-loading-${value}-hint">${description}</small></span></label>`).join('')}</fieldset><button type="button" class="button primary">Continue</button></div>`;
  loading.querySelector(`input[value="${preferences.loading}"]`).checked = true;
  await new Promise((resolve) =>
    loading.querySelector('button').addEventListener(
      'click',
      () => {
        preferences.loading = loading.querySelector('input:checked').value;
        preferences.loadingChosen = true;
        saveMobilePreferences(storage, preferences);
        resolve();
      },
      { once: true },
    ),
  );
  delete shell.dataset.loadingChoice;
  loading.innerHTML =
    '<span class="insignia">⌁</span><p>Assembling the field atlas…</p>';
}
