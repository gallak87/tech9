import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { chamferBox, boltRow, louvers } from '../render/geobuild.js';
import { WORLD, centrelineX, centrelineY, smooth } from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// The `works` backend — a corridor through something that was built.
//
// The third composition in the game, and the first that is not natural rock.
// `terrain` is ground-below-walls-either-side-sky-above; `field` is bodies in
// every direction with stars between them; this is a *box*. Flat plate, right
// angles, a deck under you and — the part neither of the others can do — a roof
// over you for stretches at a time.
//
// ── Why a roof is the whole point ────────────────────────────────────────────
// The heightfield is single-valued, so `terrain` can never put geometry above
// the rail at any parameter value. `field` gets bodies overhead but they are
// scattered, so the sky is always visible past them. A closed span is the only
// thing in the game that takes the sky away completely, and going from open to
// enclosed and back is a change no amount of re-authoring a canyon can produce.
//
// ── What it has to provide ───────────────────────────────────────────────────
// The same two things every backend provides: the rail is unchanged, and
// `groundAt` is the deck — a real floor here, unlike the belt, so the ground
// cushion, the AI's altitude clamps and the ground batteries all work normally.
//
// ── Zones ────────────────────────────────────────────────────────────────────
// The box is a function of z. `works.zones` is to this backend what `zones.js`
// is to `terrain`: a sequence of held stretches with a blend
// between each pair, carrying the five numbers that decide what the corridor is
// — how wide (`half`), how high the deck sits (`deckY`), how far the roof is
// over it (`roofY`), and how much stands on each flank (`rise`). A DNA with no
// zones is one implicit zone holding the flat fields for the whole corridor.
//
// A negative `rise` is a flank that FALLS instead of climbing: the same block
// run steps down and outward from the deck edge. That is the only way this
// backend can be asymmetric, and it is what an escarpment is made of.
//
// ── The run past the end ─────────────────────────────────────────────────────
// `run` is metres of corridor built PAST `zEnd`, and it exists because the rail
// does not stop for the boss. `flight.railZ` advances at cruise speed for the
// whole fight and nothing ends the level until the carrier dies, so a finale
// that takes 45 s is fought 7.9 km outside a world that stops at `zEnd`. On a
// backend whose corridor is a box, outside it is not "over open ocean" — it is
// a starfield with nothing in it at all.
//
// The last zone simply holds: its exit key and its final bay run are extended
// to `zEnd - run`, so the dock the fight belongs in keeps going rather than a
// new shape being invented for it. The cost is chunks, and they are cheap —
// 2.9 ms and 4515 triangles each, all of them past `fade` and therefore hidden
// until the ship is in them.
//
// ── Bays ─────────────────────────────────────────────────────────────────────
// What is overhead is discrete and does not blend, so it is not a zone field:
// `bays` is a run list, and a zone names either one kind or a pattern cycled on
// the chunk grid within it. Authored as a repeating pattern rather than sampled
// randomly, because the point is rhythm — open, open, spanned, enclosed, open —
// and a random walk over four kinds produces mush, which is the same mistake the
// corridor's `keys` made when they were interpolated on a uniform grid.
// ─────────────────────────────────────────────────────────────────────────────

/** What sits over the corridor in a bay. */
const BAY = {
  /** Nothing. Sky, and the walls run up past the frame. */
  OPEN: 'open',
  /** Gantries: ribs across the gap you fly under, sky between them. */
  SPAN: 'span',
  /** A continuous roof. No sky at all. */
  ENCLOSED: 'enclosed',
  /** A wall across the corridor with a port cut through it. */
  BULKHEAD: 'bulkhead',
};

/* ── the corridor profile ─────────────────────────────────────────────────── */
//
// Compiled once per DNA and sampled as a pure function of z, so `groundAt` and
// `ceilingAt` answer before any mesh exists and the offline gates can read the
// corridor without a browser. Cached on the identity of the source object: a
// rebuild onto the level you are already on hands back the same one.

/** Numeric fields a zone holds. Blended smoothstep between zone keys. */
const ZONE_FIELDS = ['half', 'deckY', 'roofY', 'glaze'];
/** Zone properties that are not blended numbers. Anything else is a typo. */
const ZONE_META = new Set(['len', 'blend', 'bay', 'rise']);

let _profile = null;

/** Compiled profile for the active DNA. */
function profile() {
  const src = WORLD.works || DEFAULT_WORKS;
  if (_profile && _profile.src === src) return _profile;
  _profile = compile(src);
  return _profile;
}

/**
 * Bay runs for a chunk-grid pattern — one run per chunk over `[z0, z1)`,
 * adjacent runs of the same kind merged.
 *
 * The chunk is the unit because a bay is a piece of built structure and the
 * build queue is per chunk; merging is what lets a zone name one kind and get a
 * single continuous roof rather than a seam every 520 m.
 */
function patternBays(pattern, chunkLen, z0, z1, phase = 0) {
  const runs = [];
  const n = Math.max(1, Math.ceil((z0 - z1) / chunkLen));
  for (let c = 0; c < n; c++) {
    const kind = pattern[(c + phase) % pattern.length];
    const a = z0 - c * chunkLen, b = Math.max(z1, a - chunkLen);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.z1 = b;
    else runs.push({ z0: a, z1: b, kind });
  }
  return runs;
}

function compile(src) {
  const W = { ...DEFAULT_WORKS, ...src };
  const zStart = WORLD.zStart, zEnd = WORLD.zEnd;
  const fail = (m) => { throw new Error(`works ${WORLD.id}: ${m}`); };
  if (!(W.run >= 0)) fail(`run must be >= 0, got ${W.run}`);
  // Where the built corridor actually stops. The level is `zEnd`; this is
  // `zEnd` plus the boss run, and it is what the chunk count and the last
  // zone's held stretch are sized against.
  const zLast = zEnd - W.run;
  const base = { half: W.half, deckY: W.deckY, roofY: W.roofY, glaze: W.glaze, riseL: 1, riseR: 1 };

  if (!W.zones) {
    return {
      src, W, zLast,
      keys: [{ z: zStart, ...base }, { z: zLast, ...base }],
      bays: patternBays(W.pattern, W.chunkLen, zStart, zLast),
    };
  }

  const zones = W.zones;
  if (!zones.length) fail('zones is empty');
  const span = zStart - zEnd;
  // Zones tile the corridor exactly, for the reason zones.js states: absorbing
  // a remainder into the last one makes every stated length a lie about where
  // the others land.
  const total = zones.reduce((s, z) => s + (z.len || 0), 0);
  if (Math.abs(total - span) > 1e-6) {
    fail(`zone lengths sum to ${total} m, corridor is ${span} m (out by ${(total - span).toFixed(1)})`);
  }

  const name = (i) => `works zone ${i}`;
  const blendOf = (i) => (i <= 0 || i >= zones.length ? 0 : zones[i].blend ?? 0);
  const keys = [];
  const bays = [];
  let z0 = zStart;

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (!(zone.len > 0)) fail(`${name(i)}: len must be > 0, got ${zone.len}`);
    for (const k of Object.keys(zone)) {
      if (!ZONE_FIELDS.includes(k) && !ZONE_META.has(k)) fail(`${name(i)}: unknown field "${k}"`);
    }

    const bIn = blendOf(i), bOut = blendOf(i + 1);
    // Two keys sharing a z divides by zero in `sample`, which is not a local
    // defect: every query in the corridor answers NaN and nothing clamps.
    if (i > 0 && !(bIn > 0)) fail(`${name(i)}: blend must be > 0, got ${zone.blend}`);
    const held = zone.len - bIn / 2 - bOut / 2;
    if (!(held > 0)) {
      fail(`${name(i)}: blends ${bIn}/${bOut} leave no held stretch inside len ${zone.len} m`);
    }

    const row = { ...base };
    for (const f of ZONE_FIELDS) if (zone[f] != null) row[f] = zone[f];
    for (const f of ZONE_FIELDS) {
      if (!Number.isFinite(row[f])) fail(`${name(i)}: field "${f}" is ${row[f]}`);
    }
    if (zone.rise != null) {
      if (!Array.isArray(zone.rise) || zone.rise.length !== 2 || !zone.rise.every(Number.isFinite)) {
        fail(`${name(i)}: rise must be two finite numbers [u<0, u>0]`);
      }
      [row.riseL, row.riseR] = zone.rise;
    }

    const z1 = z0 - zone.len;
    keys.push({ z: z0 - bIn / 2, ...row }, { z: z1 + bOut / 2, ...row });

    const bay = zone.bay ?? BAY.OPEN;
    const kinds = Array.isArray(bay) ? bay : [bay];
    for (const k of kinds) if (!BAY_KINDS.has(k)) fail(`${name(i)}: unknown bay "${k}"`);
    for (const run of patternBays(kinds, W.chunkLen, z0, z1)) {
      const last = bays[bays.length - 1];
      if (last && last.kind === run.kind) last.z1 = run.z1;
      else bays.push(run);
    }

    z0 = z1;
  }

  // The last zone holds through the run. Its exit key and its final bay run
  // already carry that zone's numbers, so extending both is the whole of it —
  // no shape is invented for the stretch the boss is fought in.
  keys[keys.length - 1].z = zLast;
  bays[bays.length - 1].z1 = zLast;

  // A bulkhead you cannot pass is a level that cannot be finished, so the port
  // is checked against the offset box rather than eyeballed. Measured at the
  // wall's own z, because both the deck it is dimensioned off and the rail the
  // box hangs from move along the corridor.
  for (const run of bays) {
    if (run.kind !== BAY.BULKHEAD) continue;
    const z = (run.z0 + run.z1) * 0.5;
    const deck = sampleKeys(keys, z);
    const rail = centrelineY(z);
    const lo = deck.deckY + W.portY - W.portH, hi = deck.deckY + W.portY + W.portH;
    if (W.portW < BOX_X) fail(`bulkhead at z ${z}: port half-width ${W.portW} is inside the ${BOX_X} m box`);
    if (lo > rail - BOX_Y_DOWN || hi < rail + BOX_Y_UP) {
      fail(`bulkhead at z ${z}: port spans ${lo.toFixed(0)}..${hi.toFixed(0)} and the box needs `
        + `${(rail - BOX_Y_DOWN).toFixed(0)}..${(rail + BOX_Y_UP).toFixed(0)}`);
    }
  }

  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i].z < keys[i - 1].z)) {
      fail(`emitted keys are not strictly descending at index ${i}: ${keys[i - 1].z} -> ${keys[i].z}`);
    }
  }
  return { src, W, zLast, keys, bays };
}

/**
 * Where the roof's lamp runs sit, as fractions of `half`. One run down the
 * middle of a narrow bay; a room wide enough to lose its own ceiling in the
 * dark gets a run every `lampEvery` metres, symmetric about the rail.
 */
function lampRuns(W, half) {
  const n = Math.max(1, Math.min(W.lampMax, Math.round((half * 2) / W.lampEvery)));
  if (n === 1) return [0];
  const out = [];
  for (let i = 0; i < n; i++) out.push(-0.72 + (1.44 * i) / (n - 1));
  return out;
}

// From `flight.js` TUNE. The corridor is the player's whole allowance, so both
// the port assert above and anything else that asks "does the ship fit" measure
// against these and not against a number that looks generous.
const BOX_X = 105, BOX_Y_UP = 78, BOX_Y_DOWN = 46;

/** Blend a key list at `z`. Split out so `compile` can assert on its own keys. */
function sampleKeys(K, z, out = {}) {
  let i = 0;
  while (i < K.length - 2 && z < K[i + 1].z) i++;
  const a = K[i], b = K[i + 1];
  const t = smooth(a.z, b.z, z);
  out.half = a.half + (b.half - a.half) * t;
  out.deckY = a.deckY + (b.deckY - a.deckY) * t;
  out.roofY = a.roofY + (b.roofY - a.roofY) * t;
  out.glaze = a.glaze + (b.glaze - a.glaze) * t;
  out.riseL = a.riseL + (b.riseL - a.riseL) * t;
  out.riseR = a.riseR + (b.riseR - a.riseR) * t;
  return out;
}

const _S = { half: 0, deckY: 0, roofY: 0, glaze: 0, riseL: 1, riseR: 1 };

/**
 * The corridor at `z`. Reuses one object: every caller reads its fields before
 * the next call, and a per-call allocation here would run per vertex row.
 */
function sample(z, out = _S) { return sampleKeys(profile().keys, z, out); }

export class Works {
  constructor(root, mats) {
    this.root = new THREE.Group();
    this.root.name = 'works';
    root.add(this.root);
    /** { plate, deck, lit } — set before the queue runs; see corneria.js. */
    this.mats = mats || {};
    this.jobs = [];
    this._chunks = [];

    const P = profile();
    const W = P.W;
    this.cfg = W;

    const n = Math.max(1, Math.ceil((WORLD.zStart - P.zLast) / W.chunkLen));
    for (let c = 0; c < n; c++) this.jobs.push(() => this._chunk(c));
  }

  /** The deck at `z` — the whole height field on this backend. */
  static deckY(z) { return sample(z).deckY; }

  /** Corridor half-width at `z`, deck edge to deck edge. */
  static halfAt(z) { return sample(z).half; }

  /** Last z the corridor is built to — `zEnd` plus the boss run. */
  static builtTo() { return profile().zLast; }

  /** What stands on each flank at `z`, as a multiple of the block height. */
  static riseAt(z) { const s = sample(z); return [s.riseL, s.riseR]; }

  /** What is overhead at `z`. */
  static bayAt(z) {
    const bays = profile().bays;
    for (let i = 0; i < bays.length; i++) {
      if (z <= bays[i].z0 && z > bays[i].z1) return bays[i].kind;
    }
    return z > bays[0].z0 ? bays[0].kind : bays[bays.length - 1].kind;
  }

  /**
   * Underside of what is overhead at `z`, or Infinity where the bay is open.
   * The counterpart to `deckY` and the reason `ceilingAt` exists on the world
   * at all: this is the only backend that puts geometry above the rail, so it
   * is the only one anything that flies has to be told to stay under.
   *
   * A SPAN answers a ceiling even though there is sky between its ribs. Gaps
   * are 118 m apart and ribs 26 m wide, so a craft that ignored the bay would
   * clear four gaps and hit the fifth; holding everything under the gantry line
   * is both cheaper and what the level's own comms promise ("no room to climb
   * out"). Lamp runs hang below the enclosed roof, so it answers under those.
   */
  static ceilingY(z) {
    const P = profile();
    const kind = Works.bayAt(z);
    if (kind !== BAY.ENCLOSED && kind !== BAY.SPAN) return Infinity;
    const s = sample(z);
    const roof = s.deckY + s.roofY;
    return kind === BAY.ENCLOSED ? roof - P.W.roofT - 1.1 : roof - P.W.spanT * 0.5;
  }

  ceilingAt(z) { return Works.ceilingY(z); }

  _chunk(ci) {
    const W = this.cfg;
    const z0 = WORLD.zStart - ci * W.chunkLen;
    const z1 = Math.max(profile().zLast, z0 - W.chunkLen);
    const r = new RNG(`${WORLD.id}:works-${ci}`);

    const plate = [];   // hull plating, ribs, roof
    const deck = [];    // the floor
    const lit = [];     // window strips and lamp banks
    const spent = [];   // per-corner plates, disposed once merged

    const push = (into, geo, x, y, z, ry = 0) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      into.push({ geo, m });
    };
    const plane = (into, a, b, t) => {
      const g = ramp(a.x, a.y, a.half, a.z, b.x, b.y, b.half, b.z, t);
      spent.push(g);
      into.push({ geo: g, m: _IDENT });
    };

    // The corridor at a z: everything the geometry below is placed against.
    const at = (z) => {
      const s = sample(z);
      return {
        z, x: centrelineX(z), y: s.deckY, half: s.half, roof: s.roofY,
        glaze: s.glaze, riseL: s.riseL, riseR: s.riseR,
      };
    };

    // ── the box ─────────────────────────────────────────────────────────────
    // Deck, curtain and roof are all one surface per segment with a corner at
    // each end, not a box centred on the middle: `half` and `deckY` both move
    // along z, and a run of centred boxes turns a taper into a sawtooth and a
    // descent into a stair. Measured over the Foundry at the 86.7 m segment the
    // mesher uses: the deck edge would step 85 m where the assembly floor
    // widens and the deck 207 m through the shaft.
    const SEGS = 6;
    let a = at(z0);
    for (let i = 0; i < SEGS; i++) {
      const b = at(z0 - ((i + 1) / SEGS) * W.chunkLen);
      const zm = (a.z + b.z) * 0.5;
      const kind = Works.bayAt(zm);

      plane(deck, a, b, W.deckT);

      // The curtain runs continuously at the corridor edge underneath the
      // massing, so a set-back block leaves an upper-level recess instead of a
      // gap you can see the stars through at deck level. On a flank that falls
      // there is no massing to close off and it drops to a kerb.
      for (const side of [-1, 1]) {
        const ra = side < 0 ? a.riseL : a.riseR, rb = side < 0 ? b.riseL : b.riseR;
        const ha = Math.max(W.lipH, W.curtainH * ra), hb = Math.max(W.lipH, W.curtainH * rb);
        const ca = { z: a.z, x: a.x + side * a.half, y: a.y + ha, half: W.wallT * 0.5 };
        const cb = { z: b.z, x: b.x + side * b.half, y: b.y + hb, half: W.wallT * 0.5 };
        plane(plate, ca, cb, Math.max(ha, hb));
      }

      // ── deck lighting ─────────────────────────────────────────────────────
      // In every bay, not only the roofed ones. The IBL here is a starfield,
      // which is black, so inside a box the only things with any area
      // contributing light are these — and a bay without them measured 42% of
      // the frame crushed to pure black.
      for (const side of [-1, 1]) {
        const la = { z: a.z, x: a.x + side * a.half * 0.55, y: a.y + 2.8, half: W.lampW * 0.25 };
        const lb = { z: b.z, x: b.x + side * b.half * 0.55, y: b.y + 2.8, half: W.lampW * 0.25 };
        plane(lit, la, lb, 1.2);
      }

      if (kind === BAY.ENCLOSED) {
        plane(plate, { ...a, y: a.y + a.roof + W.roofT * 0.5 }, { ...b, y: b.y + b.roof + W.roofT * 0.5 }, W.roofT);
        // Lamp runs down the roof line: with the sky gone this is the only
        // light shaping the tunnel, and an unlit tunnel is a black rectangle.
        //
        // How many is a function of how wide the room is, not a constant: one
        // run down the middle is 22 m of articulation across a ceiling that is
        // 860 m wide on the assembly floor. This is a coverage argument, not a
        // brightness one — there are no local lights in this game, so a fixture
        // is bright pixels and nothing else.
        const runs = lampRuns(W, (a.half + b.half) * 0.5);
        for (const f of runs) {
          const ma = { z: a.z, x: a.x + f * a.half, y: a.y + a.roof - W.roofT - 0.2, half: W.lampW * 0.5 };
          const mb = { z: b.z, x: b.x + f * b.half, y: b.y + b.roof - W.roofT - 0.2, half: W.lampW * 0.5 };
          plane(lit, ma, mb, 0.6);
        }
      }
      a = b;
    }

    // ── the rhythm ──────────────────────────────────────────────────────────
    // One spacing, read twice: a rib across the roof and a strip across the
    // deck at the same z. Two things come out of it that nothing else in this
    // backend provides. A roof is otherwise a single untextured plate — the
    // largest flat face in the game and the one CONTRACT rule 5 names — and at
    // 175 m/s a corridor with nothing crossing it has no speed cue at all: the
    // walls stream past at the edge of frame while the middle of the screen,
    // which is where the player is looking, holds still.
    for (let z = z0 - W.ribGap * 0.5; z > z1; z -= W.ribGap) {
      const ca = at(Math.min(z0, z + W.ribW * 0.5));
      const cb = at(Math.max(z1, z - W.ribW * 0.5));
      if (ca.z - cb.z < 0.5) continue;
      // Proud of the deck rather than inlaid: an inlay at a grazing angle is
      // hidden by the plate in front of it from the one camera that matters.
      plane(lit, { ...ca, y: ca.y + 0.5 }, { ...cb, y: cb.y + 0.5 }, 0.5);
      if (Works.bayAt(z) !== BAY.ENCLOSED) continue;
      plane(plate, { ...ca, y: ca.y + ca.roof - W.roofT }, { ...cb, y: cb.y + cb.roof - W.roofT }, W.ribD);
    }

    // ── massing ─────────────────────────────────────────────────────────────
    // The sides are a run of blocks, not a wall. A flat plane with a lit band
    // across it reads as an extruded trough with a racing stripe on it — the
    // same mistake the canyon makes, a cross-section with decoration applied —
    // because at 175 m/s what says "built" is *silhouette*, and a plane has
    // none. Blocks vary in height, depth and setback, so the skyline steps and
    // the recesses read as bays rather than as holes.
    //
    // `rise` scales the run and decides which way it goes. Positive climbs off
    // the deck edge; negative steps down and outward from it, each block lower
    // than the one inboard of it, which is the escarpment.
    for (let side = -1; side <= 1; side += 2) {
      let z = z0;
      while (z > z1) {
        const zb = Math.max(z1, z - r.range(W.blockLen[0], W.blockLen[1]));
        const zm = (z + zb) * 0.5;
        const len = z - zb;
        if (len < 8) break;
        const c = at(zm);
        const rise = side < 0 ? c.riseL : c.riseR;
        const h = r.range(W.blockH[0], W.blockH[1]) * Math.abs(rise);
        const depth = r.range(W.blockD[0], W.blockD[1]);
        // Most blocks sit on the corridor edge; a minority step back, and that
        // minority is what stops the run reading as one extrusion. A falling
        // flank always steps back, because the step outward is the terrace.
        const set = rise >= 0
          ? (r.next() < 0.42 ? r.range(12, W.setback) : 0)
          : r.range(0.25, 1) * W.setback * W.fallOut;
        const xin = c.x + side * (c.half + set);
        // Top of the block. Below the deck on a falling flank, and further
        // below the further out it stands.
        const top = rise >= 0 ? c.y + h : c.y - (W.terraceDrop + set * W.terraceRake);

        if (Math.abs(rise) > 0.02) {
          push(plate, this._slab(depth, h, len + 0.5), xin + side * depth * 0.5, top - h * 0.5, zm);
          // The façade. `cityMaterial` is a window *grid* keyed to world position
          // and was written to clad a whole face — given one, it tiles windows up
          // the full height and across the full width for free, which is the
          // entire difference between a building and a lit stripe.
          //
          // But NOT on every block. Glazing every face wall-to-wall and
          // floor-to-ceiling reads as circuit board rather than as
          // architecture: what makes a run of buildings legible is the solid
          // ones between the lit ones. A glazed block is also clad over part of
          // its height rather than all of it.
          //
          // `glaze` is a zone field because the window grid is the strongest
          // signal in every frame of this level, and a corridor through a works
          // that carries as much of it inside as out reads as a street at
          // night wherever it goes. It falls away as the level goes in.
          if (r.next() < c.glaze) {
            const fh = h * r.range(0.52, 0.95);
            push(lit, this._slab(0.8, fh, len * 0.94), xin - side * 0.6,
              top - h + fh * 0.5 + (h - fh) * r.range(0, 0.35), zm);
          }
          // A cap band, so a block terminates rather than just stopping.
          push(plate, this._slab(depth + 5, W.capH, len + 5.5), xin + side * depth * 0.5,
            top + W.capH * 0.5, zm);
        }
        z = zb;
      }
    }

    // ── what is overhead ────────────────────────────────────────────────────
    // Spans and bulkheads are placed along the bay run, not the chunk: a zone
    // names what is over it and the runs are where the kinds actually change.
    for (const run of profile().bays) {
      if (run.z0 <= z1 || run.z1 >= z0) continue;
      if (run.kind === BAY.SPAN) {
        for (let z = run.z0 - W.spanGap * 0.5; z > run.z1; z -= W.spanGap) {
          if (z > z0 || z <= z1) continue;
          const c = at(z);
          push(plate, this._slab(c.half * 2, W.spanT, W.spanW), c.x, c.y + c.roof, z);
          // Hangers down from the span ends, so a gantry is carried rather than
          // floating. Fixed fraction of the drop: with massing there is no
          // single wall head to land on any more.
          const hang = c.roof * 0.34;
          for (const s of [-1, 1]) {
            push(plate, this._slab(W.spanT * 0.7, hang, W.spanW * 0.7),
              c.x + s * (c.half - W.wallT), c.y + c.roof - hang * 0.5, z);
          }
        }
      } else if (run.kind === BAY.BULKHEAD) {
        // A wall across the corridor with a port through it. The port is centred
        // on the rail and sized off the offset box, so it is always flyable —
        // asserted rather than eyeballed, because a bulkhead you cannot pass is a
        // level that cannot be finished.
        const z = (run.z0 + run.z1) * 0.5;
        if (z > z0 || z <= z1) continue;
        const c = at(z);
        const pw = W.portW, ph = W.portH, py = c.y + W.portY;
        // Above the tallest block, not at the roof line. Stopping at `roofY` in
        // an OPEN bay left a slab shorter than its own surroundings with stars
        // over the top of it — a billboard with a hole, not a wall that seals.
        const top = c.y + W.bulkH;
        // left / right / over / under the port
        push(plate, this._slab(c.half - pw, top - c.y, W.bulkT),
          c.x - (c.half + pw) * 0.5, c.y + (top - c.y) * 0.5, z);
        push(plate, this._slab(c.half - pw, top - c.y, W.bulkT),
          c.x + (c.half + pw) * 0.5, c.y + (top - c.y) * 0.5, z);
        push(plate, this._slab(pw * 2, top - (py + ph * 0.5), W.bulkT),
          c.x, (top + py + ph * 0.5) * 0.5, z);
        push(plate, this._slab(pw * 2, (py - ph * 0.5) - c.y, W.bulkT),
          c.x, (c.y + py - ph * 0.5) * 0.5, z);
        // a lit rim around the port so it reads as a way through, not a shadow
        push(lit, this._ring(pw, ph, 1.6, W.bulkT * 0.6), c.x, py, z - W.bulkT * 0.6);
        // Buttresses either side, so a wall this tall is carried rather than
        // standing on its own edge.
        for (const s2 of [-1, 1]) {
          push(plate, this._slab(W.bulkT * 2.2, top - c.y, W.bulkT * 3),
            c.x + s2 * (c.half - W.bulkT), c.y + (top - c.y) * 0.5, z);
        }
      }
    }

    // ── berths ──────────────────────────────────────────────────────────────
    // A capital hull on the stocks. The level is called the Foundry and its
    // comms say "whatever they built in here" and "so that's what they were
    // building"; without this there is nothing under construction anywhere in
    // it, and the finale is fought in a bare rectangle.
    //
    // Held outboard of `u`, which is authored clear of both the player's 105 m
    // box and the boss station's 96 — nothing in this backend has collision, so
    // a berth inside either would be flown through rather than hit. They run
    // through the boss run as well as the dock, because the fight is most of
    // the time anything is seen from here.
    const B = W.berths;
    if (B) {
      for (let z = B.from, i = 0; z > B.to; z -= B.gap, i++) {
        if (z > z0 || z <= z1) continue;
        const c = at(z);
        const side = i % 2 ? 1 : -1;
        const x = c.x + side * B.u;
        const y = c.y;
        // Half-built, and that is what makes it read. A hull under
        // construction is a solid tapered mass aft with the frames still open
        // forward — the completed part and the part that is not. Frames alone,
        // however carefully tapered, read as a row of goalposts from every
        // angle except broadside, because nothing about a constant ring says
        // which way a ship points.
        //
        // `sin(pi t)` is the section: full amidships, pinched at both ends.
        const sect = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.55);
        const half = (t) => B.beam * 0.5 * (0.22 + 0.78 * sect(t));
        const zAt = (t) => z + B.len * (0.5 - t);
        // Plated aft. Corner-exact segments, so the taper is the shape rather
        // than a stack of boxes stepping.
        const SEG = 6;
        for (let i = 0; i < SEG; i++) {
          const t0 = (i / SEG) * B.plated, t1 = ((i + 1) / SEG) * B.plated;
          plane(plate,
            { z: zAt(t0), x, y: y + B.hullH, half: half(t0) },
            { z: zAt(t1), x, y: y + B.hullH, half: half(t1) }, B.hullH);
        }
        // Open frames forward of it, standing on the keel line.
        for (let f = 0; f < B.frames; f++) {
          const t = B.plated + (1 - B.plated) * ((f + 0.5) / B.frames);
          const hh = B.ribH * 0.5 * (0.40 + 0.60 * sect(t));
          push(plate, this._ring(half(t), hh, B.ribT, B.ribT * 1.6), x, y + hh, zAt(t));
        }
        // The keel runs the whole length under both, so the bow is carried and
        // the two halves are one object.
        push(plate, this._slab(B.beam * 0.30, B.keelH, B.len), x, y + B.keelH * 0.5, z);
        // Scaffold: masts either side with a gantry across the top, so the hull
        // reads as held rather than parked, and the silhouette carries above it.
        // The masts carry the berth's light — a strip on the inboard face,
        // which is the only vertical accent in a level built out of horizontals.
        for (let m = 0; m < 3; m++) {
          const mz = zAt((m + 0.5) / 3);
          for (const s2 of [-1, 1]) {
            push(plate, this._slab(B.mastT, B.mastH, B.mastT), x + s2 * B.span, y + B.mastH * 0.5, mz);
            push(lit, this._slab(0.8, B.mastH * 0.82, B.mastT * 0.6),
              x + s2 * (B.span - B.mastT * 0.5 - 0.5), y + B.mastH * 0.5, mz);
          }
          push(plate, this._slab(B.span * 2 + B.mastT, B.mastT, B.mastT * 1.4),
            x, y + B.mastH, mz);
        }
      }
    }

    // ── greebles ────────────────────────────────────────────────────────────
    // Cheap, and the only thing standing between "built" and "extruded". Two per
    // chunk on alternating walls, from a fixed stream so the level is stable.
    for (let i = 0; i < W.greebles; i++) {
      const z = r.range(z0, z1);
      const side = r.sign();
      const c = at(z);
      const x = c.x + side * (c.half - W.wallT);
      const y = c.y + r.range(24, c.roof * 0.72);
      const louvered = r.next() < 0.5;
      // A falling flank has no wall above the deck to mount anything on. Tested
      // after the draws, not before: a skipped greeble must not move the stream
      // for the ones after it.
      if ((side < 0 ? c.riseL : c.riseR) <= 0.02) continue;
      if (louvered) {
        push(plate, louvers({ n: 5, w: 7.0, h: 0.9, d: 2.2, gap: 1.4, tilt: -0.5 }),
          x - side * 1.1, y, z, side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
      } else {
        push(plate, boltRow({ from: [0, 0, -6], to: [0, 0, 6], n: 7, r: 0.45, h: 0.30, sides: 6 }),
          x - side * 0.6, y, z);
      }
    }

    if (deck.length) this._chunks.push(this._merge(deck, z0, this.mats.deck));
    if (plate.length) this._chunks.push(this._merge(plate, z0, this.mats.plate));
    if (lit.length) this._chunks.push(this._merge(lit, z0, this.mats.lit, false));
    for (const g of spent) g.dispose();
  }

  /* ── prefabs, cached by dimensions ─────────────────────────────────────── */
  // A chunk reuses a handful of box sizes many times over, and every one of them
  // is a fresh BufferGeometry otherwise.

  _key(...a) { return a.map(v => v.toFixed(2)).join('|'); }

  _slab(w, h, d) {
    this._cache ||= new Map();
    const k = 's' + this._key(w, h, d);
    let g = this._cache.get(k);
    if (!g) { g = chamferBox(Math.max(0.05, w), Math.max(0.05, h), Math.max(0.05, d), 0.10, 1); this._cache.set(k, g); }
    return g;
  }

  /** A rectangular rim, as four slabs — a bulkhead port's lit frame, and a
   *  hull frame on the stocks. */
  _ring(hw, hh, t, d) {
    this._cache ||= new Map();
    const k = 'g' + this._key(hw, hh, t, d);
    let g = this._cache.get(k);
    if (g) return g;
    const parts = [
      { g: chamferBox(hw * 2 + t * 2, t, d, 0.05, 1), y: hh + t * 0.5, x: 0 },
      { g: chamferBox(hw * 2 + t * 2, t, d, 0.05, 1), y: -hh - t * 0.5, x: 0 },
      { g: chamferBox(t, hh * 2, d, 0.05, 1), y: 0, x: hw + t * 0.5 },
      { g: chamferBox(t, hh * 2, d, 0.05, 1), y: 0, x: -hw - t * 0.5 },
    ];
    g = mergeList(parts.map(p => ({
      geo: p.g,
      m: new THREE.Matrix4().makeTranslation(p.x, p.y, 0),
    })));
    for (const p of parts) p.g.dispose();
    this._cache.set(k, g);
    return g;
  }

  _merge(list, z0, material, casts = true) {
    const g = mergeList(list);
    const mesh = new THREE.Mesh(g, material);
    // A light fixture is not an occluder. It also keeps a third of this
    // backend's meshes out of the shadow pass — one of the three merges per
    // chunk is `lit`.
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    mesh.userData.z = z0;
    this.root.add(mesh);
    return mesh;
  }

  updateLOD(camPos) {
    const W = this.cfg;
    for (const m of this._chunks) m.visible = Math.abs(m.userData.z - camPos.z) < W.fade;
  }

  dispose() {
    for (const m of this._chunks) m.geometry.dispose();
    this._chunks.length = 0;
    if (this._cache) { for (const g of this._cache.values()) g.dispose(); this._cache.clear(); }
    this.root.parent?.remove(this.root);
    this.jobs = [];
  }
}

const _IDENT = /* @__PURE__ */ new THREE.Matrix4();

/**
 * A plate with a corner at each end: width and height are given twice, so one
 * segment of a deck that widens or descends is a single surface.
 *
 * `y` is the top face and `t` the thickness under it. Winding is decided by the
 * outward hint per face rather than by writing the six corner orders out by
 * hand — the two ends taper independently, and a face order that is right for a
 * box is not necessarily right for a wedge.
 */
function ramp(xa, ya, ha, za, xb, yb, hb, zb, t) {
  const T = [
    [xa - ha, ya, za], [xa + ha, ya, za],
    [xb + hb, yb, zb], [xb - hb, yb, zb],
  ];
  const B = T.map(p => [p[0], p[1] - t, p[2]]);
  const pos = [], nrm = [], idx = [];
  const quad = (p0, p1, p2, p3, ox, oy, oz) => {
    let nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
    let ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    let nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const flip = nx * ox + ny * oy + nz * oz < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    const base = pos.length / 3;
    for (const p of (flip ? [p3, p2, p1, p0] : [p0, p1, p2, p3])) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx / l, ny / l, nz / l);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(T[0], T[1], T[2], T[3], 0, 1, 0);
  quad(B[0], B[1], B[2], B[3], 0, -1, 0);
  quad(T[0], T[3], B[3], B[0], -1, 0, 0);
  quad(T[1], T[2], B[2], B[1], 1, 0, 0);
  quad(T[0], T[1], B[1], B[0], 0, 0, 1);
  quad(T[3], T[2], B[2], B[3], 0, 0, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return g;
}

/** Bake a list of `{ geo, m }` into one indexed BufferGeometry. */
function mergeList(list) {
  let nv = 0, ni = 0;
  for (const b of list) {
    nv += b.geo.attributes.position.count;
    ni += b.geo.index ? b.geo.index.count : b.geo.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();

  for (const b of list) {
    const bp = b.geo.attributes.position, bn = b.geo.attributes.normal;
    const bi = b.geo.index;
    nm.getNormalMatrix(b.m);
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i).applyMatrix4(b.m);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(bn, i).applyMatrix3(nm).normalize();
      nrm[(vo + i) * 3] = v.x; nrm[(vo + i) * 3 + 1] = v.y; nrm[(vo + i) * 3 + 2] = v.z;
    }
    if (bi) for (let i = 0; i < bi.count; i++) idx[io + i] = bi.getX(i) + vo;
    else for (let i = 0; i < bp.count; i++) idx[io + i] = i + vo;
    vo += bp.count;
    io += bi ? bi.count : bp.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Overridable per DNA via `works: {…}`. Metres throughout.
 *
 * The flat fields are the corridor a DNA gets without authoring one. `zones`
 * overrides `half`, `deckY`, `roofY` and the flanks along z; everything else
 * here — thicknesses, block ranges, the port — is constant for a level.
 */
const DEFAULT_WORKS = {
  chunkLen: 520,
  /** Corridor half-width. Well outside the ±105 offset box. */
  half: 190,
  deckY: -26,
  deckT: 6,
  wallT: 7,
  /** Continuous at the corridor edge, under the massing. */
  curtainH: 44,
  /** The kerb a flank drops to when nothing stands on it. Low, because it is
   *  what the eye looks over: from the rail the sight line past the deck edge
   *  drops about 0.33 m per metre outboard, and everything under it is hidden
   *  by the kerb itself. */
  lipH: 4,
  /** Blocks: length along z, height, and depth outward from the edge. */
  blockLen: [46, 152],
  blockH: [115, 420],
  blockD: [34, 96],
  /** How far a set-back block steps away from the corridor edge. */
  setback: 74,
  /** Fraction of blocks clad in window grid. See the comment at its use. */
  glaze: 0.66,
  /** A falling flank: how far the first terrace sits under the deck, how much
   *  further down each metre of setback takes the next one, and how much wider
   *  its steps run than a climbing flank's.
   *
   *  `terraceRake` is bounded by geometry rather than by taste, and getting it
   *  wrong hides the whole flank. From the rail the sight line past the deck
   *  edge falls about 0.33 m per metre outboard; a rake steeper than that takes
   *  every terrace under it, so the fall is occluded by its own kerb from every
   *  camera on the corridor and only shows from one parked outside. Measured on
   *  the gantry run: at 0.62 nothing is visible at any setback, in or out.
   *  0.14 against a 0.33 sight line puts the shoulder in frame and keeps the
   *  deep part hidden, which is what standing on a ledge looks like. */
  terraceDrop: 12,
  terraceRake: 0.14,
  fallOut: 2.0,
  capH: 7,
  roofY: 190,
  roofT: 7,
  spanT: 9,
  spanW: 26,
  spanGap: 118,
  lampW: 22,
  /** Metres of corridor width per roof lamp run, and the cap on how many. */
  lampEvery: 240,
  lampMax: 5,
  /** The transverse rhythm: spacing, the strip's length along z, and how far a
   *  roof rib hangs below the plate. */
  ribGap: 130,
  ribW: 9,
  ribD: 5,
  bulkT: 12,
  /** Clear of `blockH`'s ceiling, or the bulkhead is shorter than its neighbours. */
  bulkH: 470,
  /** The port. Sized off the offset box, not by eye — `compile` asserts it. */
  portW: 128,
  portH: 96,
  portY: 96,
  greebles: 6,
  fade: 4200,
  /** Metres of corridor built past `zEnd`, for the boss fight the rail flies
   *  into. See "The run past the end" above. */
  run: 0,
  /** Hulls on the stocks: a run of berths from `from` to `to` every `gap`,
   *  alternating sides at `±u`. Null for a corridor that builds nothing. */
  berths: null,
  /** One held stretch per entry, blended into the one before. Null is one zone
   *  holding the flat fields above for the whole corridor. */
  zones: null,
  // open, open, span, open, enclosed, span, open, bulkhead — 8 bays ≈ 4.2 km.
  // What a corridor with no `zones` gets: a 9 km one runs the cycle just over
  // twice, and no two adjacent bays repeat at the same point in it.
  pattern: [BAY.OPEN, BAY.OPEN, BAY.SPAN, BAY.OPEN, BAY.ENCLOSED, BAY.SPAN, BAY.OPEN, BAY.BULKHEAD],
};

const BAY_KINDS = new Set(Object.values(BAY));

export { BAY, DEFAULT_WORKS };
