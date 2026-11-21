import { isEditorBiome } from './biomes.js';

export const TRACK_FORMAT = 'vector-nova-track';
export const TRACK_VERSION = 1;
export const TRACK_ID_PATTERN = /^[a-z][a-z0-9-]{0,79}$/;
export const MAX_TRACK_BYTES = 1024 * 1024;
export const MAX_TRACKS = 256;
export const MAX_JUMP_SIGNATURE_LENGTH = 150_000;

// Up to 16 authored jumps can each retain 256 baseline points and point IDs.
// Bound the JSON walk without excluding those valid documents under 1 MB.
const MAX_TRACK_VALUES = 40_000;
const encoder = new TextEncoder();
export const trackByteLength = (text) => encoder.encode(text).byteLength;

export function trackId(id) {
  if (typeof id !== 'string' || !TRACK_ID_PATTERN.test(id))
    throw new Error('Invalid track ID.');
  return id;
}

export function trackName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (
    !trimmed ||
    trimmed.length > 60 ||
    [...name].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('Track name must contain 1–60 printable characters');
  return trimmed;
}

function checkTrackFileData(document) {
  let count = 0;
  const path = [];
  function inspectChild(key, value) {
    path.push(key);
    inspect(value);
    path.pop();
  }
  function inspect(value) {
    if (++count > MAX_TRACK_VALUES || path.length > 12)
      throw new Error('Track data is too complex.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value === 'string') {
      const jumpSignature =
        path.length === 4 &&
        path[0] === 'jumps' &&
        typeof path[1] === 'number' &&
        path[2] === 'authoring' &&
        path[3] === 'signature';
      if (value.length <= (jumpSignature ? MAX_JUMP_SIGNATURE_LENGTH : 1024))
        return;
    }
    if (Array.isArray(value) && value.length <= 512) {
      for (let index = 0; index < value.length; index++)
        inspectChild(index, value[index]);
      return;
    }
    if (
      value &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      const entries = Object.entries(value);
      if (entries.length > 64) throw new Error('Track data is too complex.');
      for (const [key, child] of entries) {
        if (key.length > 80) throw new Error('Invalid track field.');
        inspectChild(key, child);
      }
      return;
    }
    throw new Error('Tracks must contain valid JSON data.');
  }

  inspect(document);
  if (
    !document ||
    document.format !== TRACK_FORMAT ||
    document.version !== TRACK_VERSION ||
    !isEditorBiome(document.biome) ||
    !Array.isArray(document.points) ||
    !Array.isArray(document.props)
  )
    throw new Error('Choose a supported Vector Nova track.');
  trackId(document.id);
  trackName(document.name);
}

export function checkTrackFileSize(bytes) {
  if (bytes > MAX_TRACK_BYTES) throw new Error('Choose a track under 1 MB.');
}

export function parseTrackFile(text) {
  checkTrackFileSize(trackByteLength(text));
  let document;
  try {
    document = JSON.parse(text.replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error('The track file could not be read.');
  }
  checkTrackFileData(document);
  return document;
}

export function serializeTrack(document) {
  checkTrackFileData(document);
  const text = JSON.stringify(document);
  checkTrackFileSize(trackByteLength(text));
  return text;
}

export function trackExportName(name) {
  const stem = name
    .replace(/[^a-z0-9 -]/gi, '')
    .trim()
    .slice(0, 60);
  return `${stem || 'track'}.vntrack.json`;
}
