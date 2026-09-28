export const defaults = {
  volume: 0.35,
  quality: 'high',
  reducedMotion: false,
  assistance: true,
};
export function loadSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem('vector-nova.settings') || '{}'),
    };
  } catch {
    return { ...defaults };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem('vector-nova.settings', JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
