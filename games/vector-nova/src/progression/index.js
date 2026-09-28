export const defaults = {
  volume: 0.35,
  quality: 'high',
  reducedMotion: false,
};
export function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('vector-nova.settings') || '{}',
    );
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        saved?.[key] ?? value,
      ]),
    );
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
