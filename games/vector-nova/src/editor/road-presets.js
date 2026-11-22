// Road-only generation preferences. Applying a card never chooses an environment
// or a seed; the caller explicitly generates and commits the new resolved road.
import { GENERATOR_VERSION } from './generation-version.js';
const preset = (value) =>
  Object.freeze({ ...value, options: Object.freeze(value.options) });

export const ROAD_PRESETS = Object.freeze([
  preset({
    id: 'stacked',
    label: 'Stacked',
    description: 'Stacked flyovers, steep returns and jump transfers.',
    circuitOnly: true,
    options: {
      length: 7500,
      bendiness: 0.92,
      elevation: 0.92,
      rhythm: 0.94,
      banking: 1,
      crossovers: 1,
      jumpFrequency: 'many',
      jumpSize: 'mixed',
    },
  }),
  preset({
    id: 'flowing',
    label: 'Flowing',
    description: 'Long banked carves, rolling crests and short jumps.',
    circuitOnly: false,
    options: {
      length: 5000,
      bendiness: 0.56,
      elevation: 0.57,
      rhythm: 0.46,
      banking: 0.6,
      crossovers: 0,
      jumpFrequency: 'few',
      jumpSize: 'small',
    },
  }),
  preset({
    id: 'technical',
    label: 'Technical',
    description: 'Quick banking changes, linked bends and mixed gaps.',
    circuitOnly: false,
    options: {
      length: 5000,
      bendiness: 0.95,
      elevation: 0.78,
      rhythm: 0.96,
      banking: 0.94,
      crossovers: 0,
      jumpFrequency: 'normal',
      jumpSize: 'mixed',
    },
  }),
  preset({
    id: 'woven',
    label: 'Woven',
    description:
      'Intertwined turns and high overpasses, with room for a full corkscrew on longer circuits.',
    circuitOnly: true,
    options: {
      length: 10000,
      bendiness: 0.84,
      elevation: 0.91,
      rhythm: 0.83,
      banking: 0.9,
      crossovers: 0.93,
      jumpFrequency: 'many',
      jumpSize: 'mixed',
    },
  }),
  preset({
    id: 'big-air',
    label: 'Big Air',
    description:
      'Roomy approaches and large jumps, fitted to the road available.',
    circuitOnly: false,
    options: {
      length: 10000,
      bendiness: 0.69,
      elevation: 0.88,
      rhythm: 0.75,
      banking: 0.78,
      crossovers: 0,
      jumpFrequency: 'many',
      jumpSize: 'large',
    },
  }),
]);

export function roadPreset(id = 'flowing') {
  const result = ROAD_PRESETS.find((value) => value.id === id);
  if (!result) throw new Error('Choose a supported road starter.');
  return result;
}

export function roadPresetOptions(id, { courseType = 'circuit', length } = {}) {
  const selected = roadPreset(id);
  if (!['circuit', 'downhill'].includes(courseType))
    throw new Error('Choose Circuit or Downhill course type.');
  if (selected.circuitOnly && courseType !== 'circuit')
    throw new Error(
      `${selected.label} is a Circuit starter. Choose another Downhill starter.`,
    );
  if (length !== undefined && !Number.isFinite(length))
    throw new Error('Road starter length must be a finite number.');
  return {
    generatorVersion: GENERATOR_VERSION,
    courseType,
    ...selected.options,
    length: Math.max(3000, Math.min(20000, length ?? selected.options.length)),
  };
}
