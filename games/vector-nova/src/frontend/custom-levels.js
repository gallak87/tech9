import { escapeHTML as escape } from '../ui/html.js';

export const supportsCustomLevels = (mode) =>
  ['race', 'practice', 'time-trial'].includes(mode);

export function courseSources(custom) {
  return `<nav class="course-sources" aria-label="Track library"><button data-action="game-levels" aria-pressed="${!custom}">Game tracks</button><button data-action="custom-levels" aria-pressed="${custom}">Custom levels</button></nav>`;
}

export function customLevelPanel({
  courses,
  selected,
  loading,
  error,
  trackCard,
}) {
  const create = '<button data-action="create-level">Create level</button>';
  const edit = '<button data-action="edit-level">Edit level</button>';
  const retry = '<button data-action="custom-levels">Try again</button>';
  if (loading || error || !courses.size) {
    const title = loading
      ? 'Opening your library…'
      : error
        ? 'Library unavailable'
        : 'No custom levels yet';
    const detail = loading
      ? ''
      : error
        ? escape(error)
        : 'Save a track in the Editor to race it here.';
    return `<section class="custom-library-empty" aria-live="polite"><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ''}${loading ? '' : error ? retry : '<button class="primary" data-action="create-level">Create level →</button>'}</section>`;
  }
  const course = courses.get(selected);
  const actions = `<div class="custom-library-actions">${course ? edit : ''}${create}</div>`;
  return `<section class="circuit-picker-panel custom-library" aria-label="Choose a custom level"><div class="circuit-hero" aria-live="polite"></div><div class="circuit-grid" role="group" aria-label="Saved levels"><div class="track-group">${[...courses.values()].map(trackCard).join('')}</div></div>${actions}<div class="transfer-slot track-transfer"></div></section>`;
}
