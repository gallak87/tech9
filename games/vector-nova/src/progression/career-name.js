const icon = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

export const careerNameIcons = Object.freeze({
  pencil: icon('m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z'),
  check: icon('m5 12 4 4L19 6'),
  cancel: icon('m6 6 12 12M18 6 6 18'),
});
