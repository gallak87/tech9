import * as T from 'three';
import { routeCurve, createRouteSampler } from './route.js';
import { createSeededCourseGeometry } from './seeded-course.js';
import { createSeededLayoutGeometry } from './seeded-layout.js';
import { worldPreset, REGIONAL_LAYOUT_VERSION } from './world-presets.js';
import { editorBiome, isEditorBiome, editorWorldPreset } from './biomes.js';
import {
  GENERATOR_VERSION,
  GENERATOR_VERSIONS,
  usesSeededLayout,
} from './generation-version.js';

export const DOCUMENT_FORMAT = 'vector-nova-track';
export { GENERATOR_VERSION } from './generation-version.js';
export const ENVIRONMENT_VERSION = 1;
export const ENVIRONMENT_LAYOUT_VERSION = REGIONAL_LAYOUT_VERSION;
export const JUMP_FREQUENCIES = Object.freeze([
  'none',
  'few',
  'normal',
  'many',
]);
export const JUMP_SIZES = Object.freeze(['small', 'mixed', 'large']);
export const DOWNHILL_RUNOUT = 600;
export const EDITOR_ROAD_GUIDANCE = Object.freeze({ radius: 55, grade: 0.45 });
export function editorRoadLimits(width, { strict = false } = {}) {
  return strict
    ? { radius: EDITOR_ROAD_GUIDANCE.radius, grade: EDITOR_ROAD_GUIDANCE.grade }
    : { radius: Math.max(35, width / 2 + 4), grade: 1.25 };
}

function fractionForPoint(points, courseType, index, preparedCurve = null) {
  const curve = preparedCurve ?? routeCurve({ points, courseType }),
    lengths = curve.getLengths();
  const p =
      (index /
        (courseType === 'downhill' ? points.length - 1 : points.length)) *
      (lengths.length - 1),
    low = Math.floor(p);
  return (
    T.MathUtils.lerp(
      lengths[low],
      lengths[Math.min(low + 1, lengths.length - 1)],
      p - low,
    ) / lengths.at(-1)
  );
}
export const PROP_TYPES = Object.freeze([
  'building',
  'warehouse',
  'pump',
  'trees',
]);
export const DOCUMENT_LIMITS = Object.freeze({
  points: 256,
  coordinate: 25000,
  height: 3000,
  length: 25000,
  generatorLength: 20000,
  props: 128,
  width: [32, 64],
});
const slug = /^[a-z][a-z0-9-]{0,79}$/;
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (message) => {
  throw new Error(message);
};
const number = (v, min, max, label) => {
  if (!Number.isFinite(v) || v < min || v > max)
    fail(`${label} must be between ${min} and ${max}`);
  return Object.is(v, -0) ? 0 : v;
};
const identifier = (v, label) => {
  if (typeof v !== 'string' || !slug.test(v))
    fail(`${label} must be a short lowercase identifier`);
  return v;
};
export function editorRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Validate untrusted files and copy only the versioned, data-only public schema. */
export function validateDocument(value) {
  if (!record(value) || value.format !== DOCUMENT_FORMAT || value.version !== 1)
    fail('This is not a supported Vector Nova track file (version 1)');
  if (!isEditorBiome(value.biome)) fail('Choose a supported editor biome');
  const biome = value.biome;
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.trim().length > 60 ||
    [...value.name].some((c) => c.charCodeAt(0) < 32)
  )
    fail('Track name must contain 1–60 printable characters');
  const courseType = value.courseType ?? 'circuit';
  if (!['circuit', 'downhill'].includes(courseType))
    fail('Choose Circuit or Downhill course type');
  const autoCloseRoll = value.autoCloseRoll ?? false;
  if (typeof autoCloseRoll !== 'boolean')
    fail('Automatic circuit return must be enabled or disabled');
  const g = value.generator;
  if (!record(g) || !GENERATOR_VERSIONS.includes(g.version))
    fail('Unsupported generator version');
  if (!Number.isInteger(g.seed)) fail('Seed must be an integer');
  const generator = {
    version: g.version,
    seed: number(g.seed, 0, 4294967295, 'Seed'),
    length: number(
      g.length,
      1800,
      DOCUMENT_LIMITS.generatorLength,
      'Generator length',
    ),
    bendiness: number(g.bendiness, 0, 1, 'Bendiness'),
    elevation: number(g.elevation, 0, 1, 'Elevation'),
  };
  if (usesSeededLayout(g.version)) {
    const jumpFrequency = g.jumpFrequency ?? 'normal';
    const jumpSize = g.jumpSize ?? 'mixed';
    if (!JUMP_FREQUENCIES.includes(jumpFrequency))
      fail('Choose None, Few, Normal or Many jumps');
    if (!JUMP_SIZES.includes(jumpSize))
      fail('Choose Small, Mixed or Large jumps');
    generator.jumpFrequency = jumpFrequency;
    generator.jumpSize = jumpSize;
    generator.crossovers = number(g.crossovers ?? 0, 0, 1, 'Crossovers');
  }
  const e =
    value.environment === undefined
      ? { version: ENVIRONMENT_VERSION, seed: generator.seed, layoutVersion: 0 }
      : value.environment;
  if (!record(e) || e.version !== ENVIRONMENT_VERSION)
    fail('Unsupported environment version');
  if (!Number.isInteger(e.seed)) fail('Environment seed must be an integer');
  if (![0, 1, 2, 3, 4].includes(e.layoutVersion))
    fail('Unsupported environment layout version');
  const environment = {
    version: ENVIRONMENT_VERSION,
    seed: number(e.seed, 0, 4294967295, 'Environment seed'),
    layoutVersion: e.layoutVersion,
  };
  if (!record(value.settings)) fail('Biome settings are missing');
  if (environment.layoutVersion === 0 && biome !== 'nightweir')
    fail('Only legacy Nightweir files use the roadside environment layout');
  const sceneryPreset =
    value.settings.sceneryPreset ?? editorBiome(biome).presets[0].id;
  editorWorldPreset(biome, sceneryPreset);
  const settings = {
    sceneryPreset,
    density: number(value.settings.density, 0, 1, 'Scenery density'),
    waterLevel: number(value.settings.waterLevel, -50, -8, 'Water level'),
  };
  if (
    !Array.isArray(value.points) ||
    value.points.length > DOCUMENT_LIMITS.points
  )
    fail('A track can have at most 256 road points');
  if (!Array.isArray(value.props) || value.props.length > DOCUMENT_LIMITS.props)
    fail('A track can have at most 128 scenery objects');
  const ids = new Set();
  const unique = (v, label) => {
    const id = identifier(v, label);
    if (ids.has(id)) fail(`Duplicate object identifier: ${id}`);
    ids.add(id);
    return id;
  };
  const points = value.points.map((p) => {
    if (!record(p)) fail('Invalid road point');
    return {
      id: unique(p.id, 'Point ID'),
      x: number(p.x, -25000, 25000, 'Point X'),
      y: number(p.y, 0, 3000, 'Point height'),
      z: number(p.z, -25000, 25000, 'Point Z'),
      bank: number(p.bank, -0.35, 0.35, 'Bank adjustment'),
      roll: number(p.roll ?? 0, -Math.PI * 8, Math.PI * 8, 'Road roll angle'),
    };
  });
  const props = value.props.map((p) => {
    if (!record(p) || !PROP_TYPES.includes(p.type))
      fail('Unknown scenery object');
    return {
      id: unique(p.id, 'Object ID'),
      type: p.type,
      distance: number(p.distance, 0, 1, 'Object route position'),
      lateral: number(p.lateral, -600, 600, 'Object side offset'),
      scale: number(p.scale, 0.5, 2, 'Object size'),
      rotation: number(
        p.rotation,
        -Math.PI * 2,
        Math.PI * 2,
        'Object rotation',
      ),
    };
  });
  if (!Array.isArray(value.rolls ?? []) || (value.rolls?.length ?? 0) > 16)
    fail('A circuit can have at most 16 corkscrew spans');
  const rolls = (value.rolls ?? []).map((r) => {
    if (!record(r) || !Number.isInteger(r.turns) || r.turns === 0)
      fail('Corkscrew turns must be a nonzero whole number');
    const result = {
      id: unique(r.id, 'Roll ID'),
      start: number(r.start, 0, 1, 'Roll start'),
      end: number(r.end, 0, 1, 'Roll end'),
      turns: number(r.turns, -2, 2, 'Corkscrew turns'),
    };
    if (result.end <= result.start)
      fail('A corkscrew end must follow its start');
    return result;
  });
  if (!Array.isArray(value.jumps ?? []) || (value.jumps?.length ?? 0) > 16)
    fail('A course can have at most 16 jumps');
  const jumpCurve =
    (value.jumps ?? []).some(
      (j) => j?.launchPointId !== undefined || j?.landingPointId !== undefined,
    ) && points.length >= 4
      ? routeCurve({ points, courseType })
      : null;
  const jumps = (value.jumps ?? [])
    .map((j) => {
      if (!record(j)) fail('Invalid jump span');
      const jump = {
        id: unique(j.id, 'Jump ID'),
        start: number(j.start, 0, 1, 'Jump launch'),
        end: number(j.end, 0, 1, 'Jump landing'),
        receiving: number(
          j.receiving ?? 300,
          150,
          1200,
          'Receiving deck length',
        ),
      };
      if (j.launchPointId !== undefined || j.landingPointId !== undefined) {
        jump.launchPointId = identifier(j.launchPointId, 'Launch point ID');
        jump.landingPointId = identifier(j.landingPointId, 'Landing point ID');
        const from = points.findIndex((p) => p.id === jump.launchPointId),
          to = points.findIndex((p) => p.id === jump.landingPointId);
        if (from < 0 || to < 0 || points.length < 4)
          fail('Remove the jump before deleting its launch or landing point');
        jump.start = fractionForPoint(points, courseType, from, jumpCurve);
        jump.end = fractionForPoint(points, courseType, to, jumpCurve);
      }
      if (jump.end <= jump.start)
        fail('Choose a jump landing after its launch');
      if (j.authoring !== undefined) {
        const saved = j.authoring;
        if (
          !record(saved) ||
          saved.version !== 1 ||
          !['small', 'medium', 'large'].includes(saved.size) ||
          !Array.isArray(saved.beforePoints) ||
          saved.beforePoints.length > DOCUMENT_LIMITS.points ||
          !Array.isArray(saved.generatedPointIds) ||
          !saved.generatedPointIds.length ||
          saved.generatedPointIds.length > DOCUMENT_LIMITS.points ||
          typeof saved.signature !== 'string' ||
          saved.signature.length > 150000
        )
          fail('Unsupported saved jump authoring data');
        const storedIds = new Set();
        const savedPoint = (p) => {
          if (!record(p)) fail('Invalid saved jump road point');
          const id = identifier(p.id, 'Saved jump point ID');
          if (storedIds.has(id)) fail('Duplicate saved jump point ID');
          storedIds.add(id);
          return {
            id,
            x: number(p.x, -25000, 25000, 'Saved jump point X'),
            y: number(p.y, 0, 3000, 'Saved jump point height'),
            z: number(p.z, -25000, 25000, 'Saved jump point Z'),
            bank: number(p.bank, -0.35, 0.35, 'Saved jump bank'),
            roll: number(
              p.roll ?? 0,
              -Math.PI * 8,
              Math.PI * 8,
              'Saved jump roll',
            ),
          };
        };
        const beforePoints = saved.beforePoints.map(savedPoint);
        const generatedPointIds = saved.generatedPointIds.map((id) =>
          identifier(id, 'Generated jump point ID'),
        );
        if (new Set(generatedPointIds).size !== generatedPointIds.length)
          fail('Duplicate generated jump point ID');
        let signedPoints;
        try {
          signedPoints = JSON.parse(saved.signature);
        } catch {
          fail('Invalid saved jump signature');
        }
        storedIds.clear();
        if (
          !Array.isArray(signedPoints) ||
          signedPoints.length !== generatedPointIds.length
        )
          fail('Invalid saved jump signature');
        const canonicalSignedPoints = signedPoints.map(savedPoint);
        if (
          canonicalSignedPoints.some((p, i) => p.id !== generatedPointIds[i]) ||
          JSON.stringify(canonicalSignedPoints) !== saved.signature
        )
          fail('Invalid saved jump signature');
        jump.authoring = {
          version: 1,
          size: saved.size,
          sourceOffset: number(
            saved.sourceOffset,
            0,
            DOCUMENT_LIMITS.length,
            'Saved jump source offset',
          ),
          beforeId:
            saved.beforeId === null
              ? null
              : identifier(saved.beforeId, 'Jump corridor preceding point'),
          afterId:
            saved.afterId === null
              ? null
              : identifier(saved.afterId, 'Jump corridor following point'),
          beforePoints,
          generatedPointIds,
          signature: saved.signature,
        };
      }
      return jump;
    })
    .sort((a, b) => a.start - b.start);
  const pickupSource = value.pickups ?? {
    version: 1,
    preset: 'balanced',
    density: 0.5,
    devices: [],
  };
  if (
    !record(pickupSource) ||
    pickupSource.version !== 1 ||
    !['balanced', 'boost-heavy'].includes(pickupSource.preset) ||
    !Array.isArray(pickupSource.devices) ||
    pickupSource.devices.length > 128
  )
    fail('Unsupported pickup layout');
  const pickups = {
    version: 1,
    preset: pickupSource.preset,
    density: number(pickupSource.density, 0, 1, 'Pickup density'),
    devices: pickupSource.devices.map((p) => {
      if (
        !record(p) ||
        !['vector', 'aegis', 'repulsor', 'arc', 'ion'].includes(p.type)
      )
        fail('Unknown pickup device');
      return {
        id: unique(p.id, 'Pickup ID'),
        type: p.type,
        at: number(p.at, 0, 1, 'Pickup route position'),
        lane: number(p.lane, -1, 1, 'Pickup lane'),
      };
    }),
  };
  if (
    !Array.isArray(value.biomeSpans ?? []) ||
    (value.biomeSpans?.length ?? 0) > 32
  )
    fail('A course can have at most 32 road-finish sections');
  const pointIndices = new Map(points.map((point, i) => [point.id, i]));
  const biomeSpans = (value.biomeSpans ?? [])
    .map((span) => {
      if (!record(span) || !['nightweir', 'vesper-forest'].includes(span.biome))
        fail(
          'Road-finish sections support registered Nightweir and Vesper finishes only',
        );
      const result = {
        id: unique(span.id, 'Road-finish section ID'),
        startPointId: identifier(span.startPointId, 'Road-finish start point'),
        endPointId: identifier(span.endPointId, 'Road-finish end point'),
        biome: span.biome,
      };
      const start = pointIndices.get(result.startPointId),
        end = pointIndices.get(result.endPointId);
      if (start === undefined || end === undefined)
        fail('Clear the road-finish section before deleting its endpoint');
      if (end <= start)
        fail(
          'Choose a road-finish endpoint after its start; sections cannot cross the start line',
        );
      return result;
    })
    .sort(
      (a, b) =>
        pointIndices.get(a.startPointId) - pointIndices.get(b.startPointId),
    );
  for (let i = 1; i < biomeSpans.length; i++)
    if (
      pointIndices.get(biomeSpans[i].startPointId) <
      pointIndices.get(biomeSpans[i - 1].endPointId)
    )
      fail('Road-finish sections must not overlap');
  return {
    format: DOCUMENT_FORMAT,
    version: 1,
    id: identifier(value.id, 'Track ID'),
    name: value.name.trim(),
    biome,
    courseType,
    autoCloseRoll,
    generator,
    environment,
    width: number(value.width, 32, 64, 'Road width'),
    points,
    settings,
    props,
    rolls,
    jumps,
    pickups,
    biomeSpans,
  };
}

export function documentIdentity(doc) {
  const canonical = validateDocument(doc);
  // Resolved road geometry and environment inputs own physics. Generator
  // preferences remain saved without changing regional-course identity.
  const geometry = { ...canonical };
  geometry.jumps = geometry.jumps.map((jump) => {
    const physical = { ...jump };
    delete physical.authoring;
    return physical;
  });
  if (!geometry.biomeSpans.length) delete geometry.biomeSpans;
  delete geometry.id;
  delete geometry.name;
  const legacy = canonical.environment.layoutVersion === 0;
  if (legacy) {
    // Reproduce the historical record shape for migrated files. The old seed
    // drove scenery too; use its independent successor after migration.
    delete geometry.environment;
    geometry.generator = {
      ...canonical.generator,
      seed: canonical.environment.seed,
    };
  } else delete geometry.generator;
  let hash = 2166136261;
  for (const character of JSON.stringify(geometry))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `custom-${canonical.biome}-v${legacy ? 5 : canonical.environment.layoutVersion >= 4 ? 8 : canonical.environment.layoutVersion >= 3 ? 7 : 6}-${hash.toString(16).padStart(8, '0')}`;
}

/** Environment regeneration is separate from road generation and stays data-only. */
export function setEnvironmentSeed(value, seed) {
  const document = validateDocument(value);
  document.environment = {
    version: ENVIRONMENT_VERSION,
    seed,
    layoutVersion: ENVIRONMENT_LAYOUT_VERSION,
  };
  return validateDocument(document);
}

export const documentCurve = routeCurve;

function generateLegacyDocument({
  seed = 7,
  length = 3000,
  bendiness = 0.45,
  elevation = 0.35,
  width = 40,
  density,
  waterLevel,
  courseType = 'circuit',
  seedJumps = true,
  generatorVersion = 2,
  sceneryPreset = 'waterfront',
} = {}) {
  const preset = worldPreset(sceneryPreset);
  density ??= preset.density;
  waterLevel ??= preset.waterLevel;
  if (typeof seedJumps !== 'boolean')
    fail('Seeded jumps must be enabled or disabled');
  if (generatorVersion === 2) {
    const draft = validateDocument({
      format: DOCUMENT_FORMAT,
      version: 1,
      id: `track-${seed}`,
      name:
        courseType === 'downhill'
          ? 'Untitled Nightweir Descent'
          : 'Untitled Nightweir',
      biome: 'nightweir',
      courseType,
      generator: { version: 2, seed, length, bendiness, elevation },
      width,
      points: [],
      jumps: [],
      settings: { density, waterLevel, sceneryPreset },
      props: [],
    });
    const geometry = createSeededCourseGeometry({
      seed,
      length,
      bendiness,
      elevation,
      width,
      density,
      waterLevel,
      courseType,
    });
    return validateDocument({ ...draft, ...geometry });
  }
  const random = editorRandom(seed),
    count = 16;
  const phaseA = random() * Math.PI * 2,
    phaseB = random() * Math.PI * 2;
  const points = Array.from({ length: count }, (_, i) => {
    if (courseType === 'downhill') {
      const u = Math.min(i, 12) / 12;
      return {
        id: `point-${i + 1}`,
        x:
          i >= 12
            ? 0
            : Math.sin(u * Math.PI * 3 + phaseA) *
              Math.sin(u * Math.PI) ** 2 *
              bendiness *
              90,
        y: i >= 12 ? 48 : 48 + (150 + elevation * 180) * (1 - u),
        z: i <= 12 ? u * (length - 750) : length - 750 + (i - 12) * 250,
        bank: 0,
      };
    }
    const angle = (i / count) * Math.PI * 2;
    const radius =
      (length / (Math.PI * 2)) *
      (1 +
        bendiness *
          (Math.sin(angle * 2 + phaseA) * 0.09 +
            Math.sin(angle * 3 + phaseB) * 0.04));
    return {
      id: `point-${i + 1}`,
      x: Math.sin(angle) * radius * 1.08,
      y: 52 + elevation * (Math.sin(angle * 2) * 24 + Math.cos(angle * 3) * 12),
      z: Math.cos(angle) * radius * 0.92,
      bank: 0,
    };
  });
  const doc = {
    format: DOCUMENT_FORMAT,
    version: 1,
    id: `track-${seed}`,
    name:
      courseType === 'downhill'
        ? 'Untitled Nightweir Descent'
        : 'Untitled Nightweir',
    biome: 'nightweir',
    courseType,
    generator: { version: 1, seed, length, bendiness, elevation },
    width,
    points,
    settings: { density, waterLevel, sceneryPreset },
    props: [],
  };
  validateDocument(doc);
  for (let i = 0; i < 5; i++) {
    const scale = length / documentCurve(doc).getLength();
    for (const p of points) {
      p.x *= scale;
      p.z *= scale;
    }
  }
  return validateDocument(doc);
}

const GENERATION_ATTEMPTS = 4;

function generationDraft({
  seed = 7,
  length = 3000,
  bendiness = 0.45,
  elevation = 0.35,
  crossovers = 0,
  width = 40,
  density,
  waterLevel,
  courseType = 'circuit',
  seedJumps = true,
  sceneryPreset,
  biome = 'nightweir',
  generatorVersion = GENERATOR_VERSION,
  jumpFrequency = 'normal',
  jumpSize = 'mixed',
  environment,
  environmentSeed = seed,
  settings: preservedSettings,
} = {}) {
  if (typeof seedJumps !== 'boolean')
    fail('Seeded jumps must be enabled or disabled');
  sceneryPreset = preservedSettings?.sceneryPreset ?? sceneryPreset;
  density = preservedSettings?.density ?? density;
  waterLevel = preservedSettings?.waterLevel ?? waterLevel;
  const selectedBiome = editorBiome(biome);
  const preset = editorWorldPreset(
    biome,
    sceneryPreset ?? selectedBiome.presets[0].id,
  );
  sceneryPreset = preset.id;
  return validateDocument({
    format: DOCUMENT_FORMAT,
    version: 1,
    id: `track-${seed}`,
    name:
      courseType === 'downhill'
        ? `Untitled ${selectedBiome.label} Descent`
        : `Untitled ${selectedBiome.label}`,
    biome,
    courseType,
    generator: {
      version: generatorVersion,
      seed,
      length,
      bendiness,
      elevation,
      crossovers,
      jumpFrequency: seedJumps ? jumpFrequency : 'none',
      jumpSize,
    },
    environment:
      environment === undefined
        ? {
            version: ENVIRONMENT_VERSION,
            seed: environmentSeed,
            layoutVersion: ENVIRONMENT_LAYOUT_VERSION,
          }
        : environment,
    width,
    points: [],
    jumps: [],
    props: [],
    settings: {
      sceneryPreset,
      density: density ?? preset.density,
      waterLevel: waterLevel ?? preset.waterLevel,
    },
  });
}

function legacyGeneration(draft) {
  // Selecting an old version explicitly reproduces that historical builder;
  // loading or changing preferences never calls any generator implicitly.
  const generated = generateLegacyDocument({
    ...draft.generator,
    ...draft.settings,
    generatorVersion: draft.generator.version,
    sceneryPreset:
      draft.biome === 'nightweir' ? draft.settings.sceneryPreset : 'waterfront',
    courseType: draft.courseType,
    width: draft.width,
  });
  return validateDocument({
    ...generated,
    biome: draft.biome,
    name: draft.name,
    environment: draft.environment,
    settings: draft.settings,
  });
}

function generationCandidate(draft, attempt) {
  try {
    const geometry = createSeededLayoutGeometry({
      ...draft.generator,
      courseType: draft.courseType,
      width: draft.width,
      waterLevel: draft.settings.waterLevel,
      attempt,
    });
    const document = validateDocument({ ...draft, ...geometry });
    const analysis = analyzeDocument(document, { strict: true });
    return {
      document: analysis.valid ? document : null,
      reason: analysis.errors.join(' '),
    };
  } catch (error) {
    return { document: null, reason: error.message };
  }
}

function generationFailure(reason) {
  fail(
    `This variation could not produce a drivable course. Try another seed or different jump settings. ${reason}`,
  );
}

/** Generate resolved geometry; saved points never depend on rerunning a seed. */
export function generateDocument(options = {}) {
  const draft = generationDraft(options);
  if (!usesSeededLayout(draft.generator.version))
    return legacyGeneration(draft);
  let reason;
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const candidate = generationCandidate(draft, attempt);
    if (candidate.document) return candidate.document;
    reason = candidate.reason;
  }
  return generationFailure(reason);
}

/** The UI can paint progress between deterministic candidate attempts. */
export async function generateDocumentAsync(
  options = {},
  {
    yieldControl = () => new Promise((done) => setTimeout(done, 0)),
    onProgress,
  } = {},
) {
  const draft = generationDraft(options);
  const total = usesSeededLayout(draft.generator.version)
    ? GENERATION_ATTEMPTS
    : 1;
  let reason;
  for (let attempt = 0; attempt < total; attempt++) {
    onProgress?.({ attempt: attempt + 1, total });
    await yieldControl();
    if (!usesSeededLayout(draft.generator.version))
      return legacyGeneration(draft);
    const candidate = generationCandidate(draft, attempt);
    if (candidate.document) return candidate.document;
    reason = candidate.reason;
  }
  return generationFailure(reason);
}

export function createDocument({
  seed = 7,
  blank = false,
  courseType = 'circuit',
  biome = 'nightweir',
  environment,
  environmentSeed = seed,
  settings,
} = {}) {
  const options = {
    seed,
    courseType,
    biome,
    environment,
    environmentSeed,
    settings,
  };
  const doc = blank ? generationDraft(options) : generateDocument(options);
  doc.id = `track-${globalThis.crypto.randomUUID()}`;
  return doc;
}

/** Draft files may be saved; only a complete, clear driving loop can be tested. */
export function analyzeDocument(value, { strict = false } = {}) {
  let doc;
  try {
    doc = validateDocument(value);
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
      warnings: [],
      length: 0,
      bounds: null,
      primaryIssue: {
        kind: 'document',
        pointIndex: null,
        label: 'Check track settings',
        message: error.message,
      },
    };
  }
  const errors = [],
    warnings = [];
  const issues = [];
  const limits = editorRoadLimits(doc.width, { strict });
  let primaryIssue = null,
    primaryRank = Infinity;
  const recordIssue = (rank, issue) => {
    issue = { severity: 'error', ...issue };
    issues.push({ rank, issue });
    if (issue.severity === 'error' && rank < primaryRank) {
      primaryRank = rank;
      primaryIssue = issue;
    }
  };
  if (doc.points.length < 4)
    return {
      valid: false,
      errors: [
        doc.courseType === 'downhill'
          ? 'Add at least four road points to form the descent.'
          : 'Add at least four road points to close the circuit.',
      ],
      warnings,
      length: 0,
      bounds: null,
      primaryIssue: {
        kind: 'incomplete',
        pointIndex: doc.points.length ? doc.points.length - 1 : null,
        label: 'Add road points',
        message: 'Add at least four road points before you test drive.',
      },
    };
  for (
    let i = 0;
    i < doc.points.length - (doc.courseType === 'downhill' ? 1 : 0);
    i++
  ) {
    const a = doc.points[i],
      b = doc.points[(i + 1) % doc.points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 30) {
      errors.push('Neighboring road points must be at least 30 m apart.');
      const pointIndex = (i + 1) % doc.points.length;
      recordIssue(2, {
        kind: 'spacing',
        pointIndex,
        label: 'Move these points apart',
        message: `Move point ${pointIndex + 1} at least 30 m from its neighbor.`,
      });
      break;
    }
  }
  if (errors.length)
    return {
      valid: false,
      errors,
      warnings,
      length: 0,
      bounds: null,
      primaryIssue,
    };
  const curve = documentCurve(doc),
    length = curve.getLength();
  const issueAt = (rank, kind, label, message, distance, details = {}) => {
    const station = T.MathUtils.clamp(distance, 0, length),
      parameter = curve.getUtoTmapping(station / length);
    const segments =
      doc.courseType === 'downhill' ? doc.points.length - 1 : doc.points.length;
    let pointIndex = Math.round(parameter * segments);
    pointIndex =
      doc.courseType === 'downhill'
        ? Math.min(doc.points.length - 1, pointIndex)
        : pointIndex % doc.points.length;
    const start = Math.max(0, Math.min(length - 120, station - 60)),
      end = Math.min(length, start + 120);
    const segmentIndex =
      doc.courseType === 'downhill'
        ? Math.min(segments - 1, Math.floor(parameter * segments))
        : Math.floor(parameter * segments) % segments;
    recordIssue(rank, {
      kind,
      pointIndex,
      label,
      message: typeof message === 'function' ? message(pointIndex) : message,
      start: start / length,
      end: end / length,
      distance: station,
      position: curve.getPointAt(station / length).toArray(),
      segmentStartId: doc.points[segmentIndex].id,
      segmentEndId: doc.points[(segmentIndex + 1) % doc.points.length].id,
      ...details,
    });
  };
  if (length < 1000 || length > DOCUMENT_LIMITS.length + 0.01) {
    errors.push('The finished course must be between 1,000 and 25,000 m long.');
    recordIssue(8, {
      kind: 'length',
      pointIndex: null,
      label: length < 1000 ? 'Extend this course' : 'Shorten this course',
      message: 'Keep the complete course between 1,000 and 25,000 m.',
    });
  }
  const finishDistance = doc.courseType === 'downhill' ? length - 600 : length;
  const jumps = doc.jumps.map((j) => ({
    ...j,
    takeoff: j.start * length,
    landingStart: j.end * length,
    recovery: j.end * length + j.receiving,
  }));
  let previousEnd = -1;
  for (const jump of jumps) {
    if (jump.takeoff < 160) {
      errors.push(
        'Leave at least 160 m of supported road before the first launch.',
      );
      issueAt(
        7,
        'jump',
        'Move this launch farther along',
        'Leave at least 160 m of supported approach before this launch.',
        jump.takeoff,
      );
    }
    if (jump.landingStart - jump.takeoff < 30) {
      errors.push('A jump gap must be at least 30 m long.');
      issueAt(
        7,
        'jump',
        'Lengthen this gap',
        'Move the landing at least 30 m beyond the launch.',
        jump.landingStart,
      );
    }
    if (jump.takeoff <= previousEnd + 80) {
      errors.push(
        'Jumps need separate launch and receiving runs with at least 80 m between them.',
      );
      issueAt(
        7,
        'jump',
        'Separate these jumps',
        'Leave at least 80 m between the previous receiver and this launch.',
        jump.takeoff,
      );
    }
    if (jump.recovery >= finishDistance - 40) {
      errors.push(
        'Leave the whole receiving deck before the finish and its runout.',
      );
      issueAt(
        7,
        'jump',
        'Move this landing earlier',
        'Leave the complete receiving deck before the finish and braking runout.',
        jump.landingStart,
      );
    }
    previousEnd = jump.recovery;
  }
  const isGap = (distance) =>
    jumps.some((j) => distance > j.takeoff && distance < j.landingStart);
  const count = Math.max(120, Math.ceil(length / 12));
  const samples = Array.from({ length: count }, (_, i) =>
    curve.getPointAt(i / count),
  );
  let minRadius = Infinity,
    maxGrade = 0,
    maxBankRate = 0,
    worstBend = 0,
    worstHorizontalRadius = Infinity,
    worstGrade = 0,
    worstBankPoint = 0;
  for (
    let i = 0;
    i < doc.points.length - (doc.courseType === 'downhill' ? 1 : 0);
    i++
  ) {
    const a = doc.points[i],
      b = doc.points[(i + 1) % doc.points.length];
    const bankRate =
      (Math.abs(b.bank - a.bank) * 1.5) /
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (bankRate > maxBankRate) {
      maxBankRate = bankRate;
      worstBankPoint = (i + 1) % doc.points.length;
    }
  }
  if (maxBankRate > 0.008) {
    errors.push(
      'A bank adjustment changes too quickly. Spread it over more road.',
    );
    issueAt(
      6,
      'rotation',
      'Smooth this bank',
      (i) => `Spread the bank adjustment around point ${i + 1} over more road.`,
      fractionForPoint(doc.points, doc.courseType, worstBankPoint, curve) *
        length,
    );
  }
  for (let i = 0; i < count; i++) {
    if (
      isGap((i * length) / count) ||
      (doc.courseType === 'downhill' && (i === 0 || i === count - 1))
    )
      continue;
    const a = samples[(i + count - 1) % count],
      b = samples[i],
      c = samples[(i + 1) % count];
    const before = b.clone().sub(a),
      after = c.clone().sub(b);
    const grade =
      Math.abs(after.y) / Math.max(0.001, Math.hypot(after.x, after.z));
    if (grade > maxGrade) {
      maxGrade = grade;
      worstGrade = ((i + 0.5) * length) / count;
    }
    const angle = before.angleTo(after);
    if (angle > 0.00001) {
      const radius = (before.length() + after.length()) / 2 / angle;
      if (radius < minRadius) {
        minRadius = radius;
        worstBend = (i * length) / count;
        const flatBefore = before.clone().setY(0),
          flatAfter = after.clone().setY(0);
        const flatAngle = flatBefore.angleTo(flatAfter);
        worstHorizontalRadius =
          flatAngle > 0.00001
            ? (flatBefore.length() + flatAfter.length()) / 2 / flatAngle
            : Infinity;
      }
    }
  }
  if (maxGrade > EDITOR_ROAD_GUIDANCE.grade) {
    const blocked = maxGrade > limits.grade;
    if (blocked)
      errors.push(
        'A climb is too steep. Spread the height change over more road.',
      );
    else
      warnings.push(
        'Steep climbs need a careful approach; test-drive at a controlled speed.',
      );
    issueAt(
      1,
      'grade',
      'Ease this climb',
      (i) =>
        `Climb near Point ${i + 1}: ${Math.round(maxGrade * 100)}% grade (${blocked ? `limit ${Math.round(limits.grade * 100)}%` : 'above the 45% recommendation'}). ${blocked ? 'Spread the height change over more road.' : 'Allowed for test driving; approach with care.'}`,
      worstGrade,
      {
        grade: maxGrade,
        allowedGrade: limits.grade,
        recommendedGrade: EDITOR_ROAD_GUIDANCE.grade,
        severity: blocked ? 'error' : 'warning',
      },
    );
  }
  if (minRadius < EDITOR_ROAD_GUIDANCE.radius) {
    const blocked = minRadius < limits.radius;
    if (blocked)
      errors.push(
        'A bend is too tight. Widen the corner or move its road points apart.',
      );
    else
      warnings.push(
        'Sharp turns need braking or airbraking; test-drive before sharing.',
      );
    issueAt(
      0,
      'bend',
      'Widen this corner',
      (i) =>
        `${worstHorizontalRadius >= 55 ? 'Crest or dip' : 'Corner'} near Point ${i + 1}: ${minRadius.toFixed(1)} m radius (${blocked ? `minimum ${limits.radius} m` : 'below the 55 m recommendation'}). ${blocked ? (worstHorizontalRadius >= 55 ? 'Ease the elevation transition or give it more distance.' : 'Move this point or its neighbours to open the corner.') : 'Allowed for test driving; brake into the turn.'}`,
      worstBend,
      {
        radius: minRadius,
        requiredRadius: limits.radius,
        recommendedRadius: EDITOR_ROAD_GUIDANCE.radius,
        severity: blocked ? 'error' : 'warning',
        horizontalRadius: worstHorizontalRadius,
        shape: worstHorizontalRadius >= 55 ? 'vertical' : 'turn',
      },
    );
  }
  let route;
  try {
    route = createRouteSampler(doc);
  } catch (error) {
    return {
      valid: false,
      errors: [...errors, error.message],
      warnings,
      length,
      bounds: null,
      primaryIssue: primaryIssue ?? {
        kind: 'connection',
        pointIndex: null,
        label: 'Smooth this connection',
        message: error.message,
      },
    };
  }
  if (route.rollClosure && !route.rollClosure.valid)
    errors.push(route.rollClosure.reason);
  const frameCount = Math.ceil(length / 3),
    frameStep = length / frameCount;
  const frames = Array.from({ length: frameCount }, (_, i) =>
    route.sample(i * frameStep),
  );
  let minDeckHeight = Infinity,
    maxRollRate = 0,
    maxFrameRate = 0,
    worstClearance = 0,
    worstRotation = 0,
    worstFrame = 0;
  for (let i = 0; i < frames.length; i++) {
    if (
      isGap(i * frameStep) ||
      (doc.courseType === 'downhill' && i === frames.length - 1)
    )
      continue;
    const frame = frames[i],
      next = frames[(i + 1) % frames.length];
    const deckHeight =
      frame.position.y - (Math.abs(frame.right.y) * doc.width) / 2;
    if (deckHeight < minDeckHeight) {
      minDeckHeight = deckHeight;
      worstClearance = i * frameStep;
    }
    const delta = next.roll - frame.roll;
    const rollRate =
      Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) / frameStep;
    const frameRate = frame.quaternion.angleTo(next.quaternion) / frameStep;
    if (rollRate > maxRollRate) {
      maxRollRate = rollRate;
      worstRotation = (i + 0.5) * frameStep;
    }
    if (frameRate > maxFrameRate) {
      maxFrameRate = frameRate;
      worstFrame = (i + 0.5) * frameStep;
    }
  }
  if (minDeckHeight < doc.settings.waterLevel + 4) {
    errors.push(
      'Raise the road or lower the basin water. The whole rotated deck needs at least 4 m of water clearance.',
    );
    issueAt(
      3,
      'clearance',
      'Raise this road',
      (i) =>
        `Raise point ${i + 1} so the entire rotated deck stays clear of the basin water.`,
      worstClearance,
    );
  }
  if (maxRollRate > 0.025) {
    errors.push(
      'A road rotation changes too quickly. Lengthen the shaped section or use a smaller angle.',
    );
    issueAt(
      6,
      'rotation',
      'Lengthen this rotation',
      (i) =>
        `Spread the angle change around point ${i + 1} over a longer section.`,
      worstRotation,
    );
  }
  if (maxFrameRate > 0.06) {
    errors.push(
      'A road connection twists or bends too sharply. Spread the shape over more road.',
    );
    issueAt(
      6,
      'rotation',
      'Smooth this connection',
      (i) =>
        `Spread the bend or rotation around point ${i + 1} over more road.`,
      worstFrame,
    );
  }
  if (route.rollClosure && !route.rollClosure.valid)
    issueAt(
      5,
      'closure',
      'Leave room to close the loop',
      route.rollClosure.reason,
      worstRotation,
    );
  let crossing = false;
  const exclusion = Math.ceil((doc.width * 2 + 40) / (length / count));
  const clearanceFrames = Array.from({ length: count }, (_, i) =>
    route.sample((i * length) / count),
  );
  // Neighbour buckets keep 20 km routes linear in their ordinary sparse
  // layout while retaining the exact same distance/height clearance predicate.
  const cellSize = doc.width + 16,
    buckets = new Map();
  for (let i = 0; i < count && !crossing; i++) {
    if (isGap((i * length) / count)) continue;
    const a = clearanceFrames[i],
      x = Math.floor(a.position.x / cellSize),
      z = Math.floor(a.position.z / cellSize);
    for (let dx = -1; dx <= 1 && !crossing; dx++)
      for (let dz = -1; dz <= 1 && !crossing; dz++) {
        for (const j of buckets.get(`${x + dx}:${z + dz}`) ?? []) {
          const separation = i - j;
          if (
            separation < exclusion ||
            (doc.courseType !== 'downhill' && count - separation < exclusion)
          )
            continue;
          const b = clearanceFrames[j];
          const aHeight =
            Math.abs(a.right.y) * (doc.width / 2 + 6) + Math.abs(a.up.y) * 24;
          const bHeight =
            Math.abs(b.right.y) * (doc.width / 2 + 6) + Math.abs(b.up.y) * 24;
          if (
            Math.abs(a.position.y - b.position.y) <
              Math.max(30, aHeight + bHeight) &&
            Math.hypot(
              a.position.x - b.position.x,
              a.position.z - b.position.z,
            ) < cellSize
          ) {
            crossing = true;
            issueAt(
              4,
              'crossing',
              'Separate these road sections',
              (i) =>
                `Move point ${i + 1} away from the nearby road, or leave more height clearance.`,
              (i * length) / count,
            );
            break;
          }
        }
      }
    const key = `${x}:${z}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  if (crossing)
    errors.push(
      'Two road sections are too close for their rotated road and driving corridor. Leave more space or height clearance.',
    );
  const placedProps = [];
  for (const prop of doc.props) {
    const frame = curve.getPointAt(prop.distance);
    const tangent = curve.getTangentAt(prop.distance);
    const right = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    const position = frame.addScaledVector(right, prop.lateral);
    const radius =
      (prop.type === 'warehouse' ? 60 : prop.type === 'building' ? 40 : 38) *
      prop.scale;
    if (
      placedProps.some(
        (p) =>
          Math.hypot(p.position.x - position.x, p.position.z - position.z) <
          p.radius + radius,
      )
    ) {
      errors.push(
        `Move ${prop.id} away from the other placed scenery assembly.`,
      );
      recordIssue(9, {
        kind: 'scenery',
        pointIndex: null,
        label: 'Choose another world preset',
        message:
          'These saved scenery assemblies overlap. A world preset rebuilds complete surroundings.',
      });
    }
    placedProps.push({ position, radius });
    let blockedSample = 0;
    const touchesRoad = samples.some((p, sampleIndex) => {
      const touches =
        !isGap((sampleIndex * length) / count) &&
        Math.hypot(p.x - position.x, p.z - position.z) <
          doc.width / 2 + radius + 32;
      if (touches) blockedSample = sampleIndex;
      return touches;
    });
    if (touchesRoad) {
      errors.push(`Move ${prop.id} farther from the road and camera corridor.`);
      issueAt(
        3,
        'clearance',
        'Move this road away',
        (i) =>
          `Move point ${i + 1} away from the scenery, or choose another world preset.`,
        (blockedSample * length) / count,
      );
    }
  }
  if (doc.points.length > 160)
    warnings.push(
      'Many road points can make editing harder; remove unnecessary points.',
    );
  if (minRadius < 95)
    warnings.push('Some corners are tight; test-drive them before sharing.');
  const bounds = new T.Box3().setFromPoints(samples);
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    issues: issues.sort((a, b) => a.rank - b.rank).map((entry) => entry.issue),
    advisories: issues
      .filter((entry) => entry.issue.severity === 'warning')
      .map((entry) => entry.issue),
    primaryIssue: errors.length
      ? (primaryIssue ?? {
          kind: 'layout',
          pointIndex: null,
          label: 'Check this layout',
          message: errors[0],
        })
      : null,
    length,
    finishDistance,
    jumpCount: jumps.length,
    rollClosure: route.rollClosure,
    minRadius,
    maxGrade,
    maxBankRate,
    minDeckHeight,
    maxRollRate,
    maxFrameRate,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
}

/** Fractions for a complete route, prepared once for fast editor selection.
 * Incomplete drafts have no physical route yet and return an empty array. */
export function pointRouteFractions(value) {
  const doc = validateDocument(value);
  if (doc.points.length < 4) return [];
  const curve = documentCurve(doc);
  return doc.points.map((_, index) =>
    fractionForPoint(doc.points, doc.courseType, index, curve),
  );
}

export function pointRouteFraction(value, index) {
  const doc = validateDocument(value);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= doc.points.length ||
    doc.points.length < 4
  )
    fail('Choose a valid road point on a complete loop');
  return fractionForPoint(doc.points, doc.courseType, index);
}

export function addCorkscrew(
  value,
  {
    startIndex,
    endIndex,
    start,
    end,
    turns = 1,
    id = `roll-${globalThis.crypto.randomUUID()}`,
  } = {},
) {
  const doc = validateDocument(value);
  if (startIndex !== undefined) start = pointRouteFraction(doc, startIndex);
  if (endIndex !== undefined) end = pointRouteFraction(doc, endIndex);
  if (
    !Number.isInteger(turns) ||
    ![-2, -1, 1, 2].includes(turns) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > 1 ||
    end <= start
  )
    fail(
      'Choose a corkscrew start before its end and one or two complete turns',
    );
  const span = (end - start) * routeCurve(doc).getLength();
  if (span < Math.abs(turns) * 500)
    fail(
      `A ${Math.abs(turns) * 360}° twist needs at least ${Math.abs(turns) * 500} m of road. Choose a longer section.`,
    );
  doc.rolls.push({ id, start, end, turns });
  return validateDocument(doc);
}
export const applyRollPreset = addCorkscrew;

/** Apply a small reusable rotation chunk, then retain its final orientation. */
export function applySectionShape(
  value,
  {
    startIndex,
    endIndex,
    startPointId,
    endPointId,
    type = 'roll',
    angle = 0,
  } = {},
) {
  const doc = validateDocument(value);
  if (startPointId !== undefined)
    startIndex = doc.points.findIndex((p) => p.id === startPointId);
  if (endPointId !== undefined)
    endIndex = doc.points.findIndex((p) => p.id === endPointId);
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex >= doc.points.length ||
    endIndex <= startIndex
  )
    fail('Choose a section end after its starting road point');
  if (!['roll', 'straight'].includes(type))
    fail('Choose a rotation chunk or a straight section');
  if (type === 'straight') angle = 0;
  number(angle, -Math.PI * 1.5, Math.PI * 1.5, 'Section rotation');
  const source = createRouteSampler(doc),
    start = pointRouteFraction(doc, startIndex),
    end = pointRouteFraction(doc, endIndex);
  const span =
    type === 'straight'
      ? Math.hypot(
          doc.points[endIndex].x - doc.points[startIndex].x,
          doc.points[endIndex].y - doc.points[startIndex].y,
          doc.points[endIndex].z - doc.points[startIndex].z,
        )
      : (end - start) * source.length;
  const divisions = Math.max(4, endIndex - startIndex);
  const minimum = Math.max(
    divisions * 32,
    Math.ceil((Math.abs(angle) * 1.5) / 0.022),
  );
  if (span < minimum)
    fail(
      `This rotation needs at least ${minimum} m of road. Choose a longer section or smaller angle.`,
    );
  const startPoint = doc.points[startIndex],
    endPoint = doc.points[endIndex],
    target = startPoint.roll + angle,
    delta = target - endPoint.roll;
  const samples = [];
  if (
    doc.points.length - (endIndex - startIndex - 1) + divisions - 1 >
    DOCUMENT_LIMITS.points
  )
    fail(
      'Remove some road points before shaping this section (256 point limit)',
    );
  for (let i = 0; i <= divisions; i++) {
    const u = i / divisions,
      fraction = T.MathUtils.lerp(start, end, u),
      frame = source.sample(fraction * source.length);
    const original = i === 0 ? startPoint : i === divisions ? endPoint : null;
    if (type === 'straight')
      frame.position.lerpVectors(
        new T.Vector3(startPoint.x, startPoint.y, startPoint.z),
        new T.Vector3(endPoint.x, endPoint.y, endPoint.z),
        u,
      );
    // Linear angular nodes plus smooth per-edge interpolation provide a
    // bounded connected chunk, including spans with only two starting nodes.
    samples.push({
      id: original?.id ?? `point-${globalThis.crypto.randomUUID()}`,
      x: original?.x ?? frame.position.x,
      y: original?.y ?? frame.position.y,
      z: original?.z ?? frame.position.z,
      bank: original?.bank ?? 0,
      roll: startPoint.roll + angle * u,
    });
  }
  const later = doc.points
    .slice(endIndex + 1)
    .map((p) => ({ ...p, roll: p.roll + delta }));
  doc.points = [...doc.points.slice(0, startIndex), ...samples, ...later];
  doc.autoCloseRoll = doc.courseType === 'circuit';
  const result = validateDocument(doc);
  const analysis = analyzeDocument(result);
  const closingProblem = analysis.errors.find((error) =>
    /circuit return|clear road after the final jump/.test(error),
  );
  if (closingProblem) fail(closingProblem);
  const rotationProblem = analysis.errors.find((error) =>
    /rotation changes too quickly|connection twists|Neighboring road points/.test(
      error,
    ),
  );
  if (rotationProblem)
    fail(
      'This connection needs a longer shaped section. Choose points farther apart or use a smaller angle.',
    );
  return result;
}

/** Changing course format is undoable in the UI; normalized features reset. */
export function setCourseType(value, courseType) {
  const doc = validateDocument(value);
  if (!['circuit', 'downhill'].includes(courseType))
    fail('Choose Circuit or Downhill');
  if (doc.courseType === courseType) return doc;
  doc.courseType = courseType;
  doc.autoCloseRoll = false;
  doc.rolls = [];
  doc.jumps = [];
  doc.pickups.devices = [];
  return validateDocument(doc);
}

/** Remove a real road span. Optional assistance authors visible ramp/receiver
 * points along one ballistic chord; physics never aims or kicks the vehicle. */
export function addJump(
  value,
  {
    startIndex,
    endIndex,
    startPointId,
    endPointId,
    receiving = 300,
    rampAssist = true,
    id = `jump-${globalThis.crypto.randomUUID()}`,
  } = {},
) {
  const doc = validateDocument(value);
  if (startPointId !== undefined)
    startIndex = doc.points.findIndex((p) => p.id === startPointId);
  if (endPointId !== undefined)
    endIndex = doc.points.findIndex((p) => p.id === endPointId);
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex >= doc.points.length ||
    endIndex <= startIndex
  )
    fail('Choose a landing point after the launch point');
  number(receiving, 150, 1200, 'Receiving deck length');
  const source = createRouteSampler(doc),
    launch = doc.points[startIndex],
    landing = doc.points[endIndex];
  const start = pointRouteFraction(doc, startIndex) * source.length,
    end = pointRouteFraction(doc, endIndex) * source.length;
  const finish =
    doc.courseType === 'downhill' ? source.length - 600 : source.length;
  if (start < 160) fail('Leave at least 160 m of approach before a launch');
  if (end + receiving + (rampAssist ? 450 : 40) >= finish)
    fail(
      'Choose an earlier landing or shorter receiving deck; leave room before the finish/runout',
    );
  if (end - start < 30)
    fail('Choose launch and landing points at least 30 m apart');
  if (rampAssist) {
    const launchPosition = new T.Vector3(launch.x, launch.y, launch.z),
      landingPosition = new T.Vector3(landing.x, landing.y, landing.z);
    const direction = landingPosition.clone().sub(launchPosition).setY(0);
    const gap = direction.length();
    if (gap < 30) fail('Move the landing farther away in the route map');
    direction.normalize();
    const rampLength = 120,
      guideLength = Math.min(120, gap / 3),
      slope = Math.tan(Math.PI / 12);
    // Preserve high-altitude courses: the assist is a local 35 m rise, not a
    // return to an old world's absolute elevation. Keep its guide below the cap.
    const rampHeadroom = guideLength * slope + 8;
    const launchY = Math.min(
        DOCUMENT_LIMITS.height - rampHeadroom,
        Math.max(80, launch.y + 35),
      ),
      landingY = Math.max(12, launchY - 75);
    const vectorAt = (origin, distance, y) =>
      origin.clone().addScaledVector(direction, distance).setY(y);
    const make = (at, position, original = null) => ({
      at,
      point: {
        id: original?.id ?? `point-${globalThis.crypto.randomUUID()}`,
        x: position.x,
        y: position.y,
        z: position.z,
        bank: 0,
        roll: 0,
      },
    });
    const approach = start - rampLength,
      leadInStart = Math.max(0, start - 600),
      rejoin = end + receiving + 450;
    if (
      doc.jumps.some(
        (j) =>
          leadInStart < j.end * source.length + j.receiving + 200 &&
          rejoin > j.start * source.length - 300,
      )
    )
      fail(
        'The assisted ramp would change an existing jump approach or receiving deck. Choose a separate section or disable ramp assistance.',
      );
    const kept = doc.points
      .map((point, index) => ({
        at: pointRouteFraction(doc, index) * source.length,
        point,
      }))
      .filter((entry) => entry.at < leadInStart - 40 || entry.at > rejoin + 40);
    const entries = [
      ...kept,
      ...(() => {
        const first = source.sample(leadInStart),
          target = vectorAt(
            launchPosition,
            -rampLength,
            launchY - rampLength * slope,
          );
        const curve = new T.CubicBezierCurve3(
          first.position,
          first.position
            .clone()
            .addScaledVector(
              first.tangent,
              doc.courseType === 'downhill'
                ? Math.min(160, first.position.distanceTo(target) * 0.45)
                : 100,
            ),
          target
            .clone()
            .addScaledVector(
              direction,
              doc.courseType === 'downhill'
                ? -Math.min(160, first.position.distanceTo(target) * 0.45)
                : -200,
            ),
          target,
        );
        const divisions = Math.max(3, Math.ceil(curve.getLength() / 80));
        return Array.from(
          { length: divisions + 1 },
          (_, i) => i / divisions,
        ).map((u) =>
          make(
            T.MathUtils.lerp(leadInStart, approach, u),
            curve.getPointAt(u),
            leadInStart === 0 && u === 0 ? doc.points[0] : null,
          ),
        );
      })(),
      make(start, launchPosition.setY(launchY), launch),
      make(
        start + Math.min((end - start) / 3, guideLength),
        vectorAt(launchPosition, guideLength, launchY + guideLength * slope),
      ),
      make(
        end - Math.min((end - start) / 3, guideLength),
        vectorAt(landingPosition, -guideLength, landingY),
      ),
      make(end, landingPosition.setY(landingY), landing),
      make(
        end + receiving / 2,
        vectorAt(landingPosition, receiving / 2, landingY),
      ),
      make(end + receiving, vectorAt(landingPosition, receiving, landingY)),
      ...(() => {
        const receiverEnd = vectorAt(landingPosition, receiving, landingY),
          target = source.sample(rejoin);
        const curve = new T.CubicBezierCurve3(
          receiverEnd,
          receiverEnd.clone().addScaledVector(direction, 240),
          target.position.clone().addScaledVector(target.tangent, -240),
          target.position,
        );
        return [0.25, 0.5, 0.75, 1].map((u) =>
          make(end + receiving + 450 * u, curve.getPoint(u)),
        );
      })(),
    ].sort((a, b) => a.at - b.at);
    if (entries.length > DOCUMENT_LIMITS.points)
      fail(
        'Remove some road points before adding the assisted ramp (256 point limit)',
      );
    doc.points = entries.map((entry) => entry.point);
  }
  const launchIndex = doc.points.findIndex((p) => p.id === launch.id),
    landingIndex = doc.points.findIndex((p) => p.id === landing.id);
  doc.jumps.push({
    id,
    start: pointRouteFraction(doc, launchIndex),
    end: pointRouteFraction(doc, landingIndex),
    receiving,
    launchPointId: launch.id,
    landingPointId: landing.id,
  });
  const result = validateDocument(doc),
    analysis = analyzeDocument(result);
  const conflict = analysis.errors.find((error) =>
    /Jumps need|receiving deck before|first launch|gap must/.test(error),
  );
  if (conflict) fail(conflict);
  return result;
}
