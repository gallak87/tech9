export const defaults = {
  volume: 0.35,
  quality: 'high',
  reducedMotion: false,
  difficulty: 'easy',
};
export function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('vector-nova.settings') || '{}',
    );
    const settings = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        saved?.[key] ?? value,
      ]),
    );
    if (!['easy', 'medium', 'hard'].includes(settings.difficulty))
      settings.difficulty = 'easy';
    return settings;
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
