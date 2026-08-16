// ─────────────────────────────────────────────────────────────────────────────
// Zones — a level as a sequence of held stretches separated by blends.
//
// `expandZones(dna)` is a pure pre-pass that compiles `dna.zones` into the
// `keys` and `centreline.*.bends` a DNA already has, so nothing downstream of it
// changes: `heightAtU`, the mesh tiers, the band limiting and the baked fields
// all see the same shape they always saw. A DNA with hand-authored `keys` and no
// `zones` passes through untouched.
//
// ── Zones are the held states; blends are the transitions ────────────────────
// A 4 km tightening is not a zone, it is a long blend between two zones.
// `profileAt` already smoothsteps between adjacent keys, so a blend costs
// nothing but the gap between one zone's exit key and the next zone's entry key.
//
//   zone i spans [z0, z1]           z0 ──────────────── z1
//   entry key at z0 - blend(i)/2       ╰── key      key ──╯
//   exit  key at z1 + blend(i+1)/2
//
// `blend` sits on the zone being entered, so it reads in source as "this many
// metres of transition into this". The region between two zones is therefore
// exactly `blend` metres wide, and the held stretch is what is left.
//
// ── Why the asserts are loud ─────────────────────────────────────────────────
// `profileAt` divides by `b.z - a.z`. Two keys sharing a z is a NaN height,
// which is not a local defect: the entire level disappears. Every geometric
// precondition is checked here, at author time, with the zone named — because
// the failure it prevents does not look like a zone bug.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cross-section parameters, in the order `heightAtU` stacks them outward
 * from the centreline. Owned here because a zone preset is exactly a value for
 * each of these; `profile.js` imports the list rather than restating it.
 */
export const FIELDS = ['inner', 'bed', 'beachW', 'beachH', 'shelfW', 'shelfH', 'cliffW', 'wallH', 'relief'];

/**
 * Hard limit on the total cross-section half-width, from `SHORE.halfU` in
 * world-materials.js: past it the water shader substitutes open ocean and the
 * shoreline slides off the beach. Corneria's delta already sits at 1155.
 */
const MAX_HALF_WIDTH = 1250;

/**
 * `profileAt` walks the key list linearly from index 0 on every sample, and it
 * is called per vertex per mesh build and per tick by the flight model. Both
 * shipped levels are 9–15 keys; this is the ceiling a generated sequence must
 * respect, not a number to grow into.
 */
const MAX_KEYS = 32;

/* ── kinds ────────────────────────────────────────────────────────────────── */
//
// A kind is a named cross-section. It carries the character — how a basin
// differs from a slot — and a zone instance overrides the specific numbers.
// Presets are added when a zone wants one, never in advance.

const ZONE_KINDS = {
  /** Walls recede and the floor opens out. Pacing as much as looks. */
  basin: { inner: 560, bed: 8, beachW: 24, beachH: 4, shelfW: 34, shelfH: 10, cliffW: 150, wallH: 200, relief: 0.52 },
  /** The corridor at its ordinary width — whatever the level's ordinary is. */
  reach: { inner: 250, bed: 9, beachW: 14, beachH: 4, shelfW: 22, shelfH: 13, cliffW: 116, wallH: 400, relief: 0.58 },
  /** Tight and tall: the walls are most of the frame. */
  gorge: { inner: 190, bed: 10, beachW: 10, beachH: 4, shelfW: 17, shelfH: 15, cliffW: 92, wallH: 545, relief: 0.63 },
  /** As narrow as the offset box allows. Held for a second, never longer. */
  narrows: { inner: 132, bed: 11, beachW: 7, beachH: 3, shelfW: 12, shelfH: 16, cliffW: 74, wallH: 630, relief: 0.66 },
};

/* ── expansion ────────────────────────────────────────────────────────────── */

const fail = (dna, msg) => { throw new Error(`dna ${dna.id}: ${msg}`); };

/**
 * Compile `dna.zones` into `keys` and centreline dog-legs.
 *
 * Returns a new DNA; the input is never mutated, so expanding the same source
 * DNA twice (a rebuild onto the level you are already on) is idempotent.
 * A DNA without `zones` is returned as-is.
 */
export function expandZones(dna) {
  const zones = dna.zones;
  if (!zones) return dna;
  if (!zones.length) fail(dna, 'zones is empty');

  const zStart = dna.zStart ?? 720;
  const zEnd = dna.zEnd ?? -9840;
  const span = zStart - zEnd;
  if (!(span > 0)) fail(dna, `zStart ${zStart} must be above zEnd ${zEnd}`);

  // Zones tile the corridor exactly. Absorbing a remainder into the last zone
  // would make every stated length a lie about where the others land, and the
  // whole point of authoring in metres is that a metre is a metre.
  const total = zones.reduce((s, z) => s + (z.len || 0), 0);
  if (Math.abs(total - span) > 1e-6) {
    fail(dna, `zone lengths sum to ${total} m, corridor is ${span} m (out by ${(total - span).toFixed(1)})`);
  }

  const name = (i) => `zone ${i} (${zones[i].kind})`;
  const blendOf = (i) => (i <= 0 || i >= zones.length ? 0 : zones[i].blend ?? 0);

  const keys = [];
  const xBends = [...(dna.centreline?.x?.bends || [])];
  const yBends = [...(dna.centreline?.y?.bends || [])];

  let z0 = zStart;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const preset = ZONE_KINDS[zone.kind];
    if (!preset) fail(dna, `${name(i)}: unknown kind`);
    if (!(zone.len > 0)) fail(dna, `${name(i)}: len must be > 0, got ${zone.len}`);

    const bIn = blendOf(i);
    const bOut = blendOf(i + 1);
    // The interior boundary between two zones must have width. A zero blend puts
    // this zone's exit key and the next zone's entry key on the same z, which is
    // the divide-by-zero in `profileAt`.
    if (i > 0 && !(bIn > 0)) fail(dna, `${name(i)}: blend must be > 0, got ${zone.blend}`);
    const held = zone.len - bIn / 2 - bOut / 2;
    if (!(held > 0)) {
      fail(dna, `${name(i)}: blends ${bIn}/${bOut} leave no held stretch inside len ${zone.len} `
        + `(need blendIn/2 + blendOut/2 < len; over by ${(-held).toFixed(0)} m)`);
    }

    const z1 = z0 - zone.len;
    const kEntry = z0 - bIn / 2;
    const kExit = z1 + bOut / 2;

    const row = { ...preset };
    for (const [k, v] of Object.entries(zone)) {
      if (FIELDS.includes(k)) row[k] = v;
      else if (!ZONE_META.has(k)) fail(dna, `${name(i)}: unknown field "${k}"`);
    }
    for (const f of FIELDS) {
      if (!Number.isFinite(row[f])) fail(dna, `${name(i)}: field "${f}" is ${row[f]}`);
    }

    const halfWidth = row.inner + row.beachW + row.shelfW + row.cliffW;
    if (halfWidth > MAX_HALF_WIDTH) {
      fail(dna, `${name(i)}: cross-section half-width ${halfWidth} m exceeds the baked shore field's ${MAX_HALF_WIDTH} m`);
    }

    keys.push({ z: kEntry, ...row }, { z: kExit, ...row });

    // A dog-leg belongs to the zone that turns, centred on it. Wider than the
    // zone and the turn would start before the cross-section it belongs to.
    if (zone.bend) {
      const { dx, width } = zone.bend;
      if (!(width > 0) || !Number.isFinite(dx)) fail(dna, `${name(i)}: bend needs finite dx and width > 0`);
      if (width > zone.len) fail(dna, `${name(i)}: bend width ${width} m exceeds len ${zone.len} m`);
      xBends.push({ z: (z0 + z1) * 0.5, dx, width });
    }

    // `climb` runs over the blend leading in, so the rail finishes moving exactly
    // as the held stretch starts. Bends are additive: a later -climb returns the
    // rail to base, the same way x dog-legs cancel.
    if (zone.climb != null) {
      if (!(bIn > 0)) fail(dna, `${name(i)}: climb needs a blend to run over`);
      if (!Number.isFinite(zone.climb)) fail(dna, `${name(i)}: climb must be finite`);
      yBends.push({ z: kEntry, dx: zone.climb, width: bIn });
    }

    z0 = z1;
  }

  // Belt and braces on the one invariant everything downstream assumes. If the
  // arithmetic above is ever wrong, this is where it stops.
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i].z < keys[i - 1].z)) {
      fail(dna, `emitted keys are not strictly descending at index ${i}: ${keys[i - 1].z} -> ${keys[i].z}`);
    }
  }
  if (keys.length > MAX_KEYS) fail(dna, `${keys.length} keys exceeds the ${MAX_KEYS} the linear scan in profileAt is sized for`);

  return {
    ...dna,
    keys,
    centreline: {
      ...dna.centreline,
      x: { ...dna.centreline.x, bends: xBends },
      y: { ...dna.centreline.y, bends: yBends },
    },
  };
}

/** Zone properties that are not cross-section fields. Anything else is a typo. */
const ZONE_META = new Set(['kind', 'len', 'blend', 'bend', 'climb']);
