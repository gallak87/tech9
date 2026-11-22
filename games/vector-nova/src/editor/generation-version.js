// Data-only version dispatch shared by document validation, presets and the UI.
export const GENERATOR_VERSION = 7;
export const GENERATOR_VERSIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
export const usesSeededLayout = (version) =>
  version >= 3 && version <= GENERATOR_VERSION;
export const SECTION_DEFAULTS = Object.freeze({ rhythm: 0.55, banking: 0.55 });
