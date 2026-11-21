import { assetURL } from '../assets/url.js';
import { EDITOR_BIOMES, editorBiome, editorWorldPreset } from './biomes.js';

// Registered images only: course files never supply resource paths.
const presets = Object.freeze(
  Object.fromEntries(
    EDITOR_BIOMES.flatMap((biome) =>
      biome.presets.map((preset) => [
        `${biome.id}/${preset.id}`,
        `assets/editor/environments/${biome.id}-${preset.id}.webp`,
      ]),
    ),
  ),
);

export function environmentThumbnailPath(biomeId, presetId) {
  const biome = editorBiome(biomeId);
  const preset = editorWorldPreset(biome.id, presetId ?? biome.presets[0].id);
  return presets[`${biome.id}/${preset.id}`];
}

export function environmentThumbnail(biomeId, presetId) {
  return assetURL(environmentThumbnailPath(biomeId, presetId));
}
