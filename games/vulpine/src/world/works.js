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
// The box is a function of z, not a constant. `works.zones` is to this backend
// what `zones.js` is to `terrain`: a sequence of held stretches with a blend
// between each pair, carrying the five numbers that decide what the corridor is
// — how wide (`half`), how high the deck sits (`deckY`), how far the roof is
// over it (`roofY`), and how much stands on each flank (`rise`). A DNA with no
// zones is one implicit zone holding the flat fields for the whole corridor.
//
// A negative `rise` is a flank that FALLS instead of climbing: the same block
// run steps down and outward from the deck edge. That is the only way this
// backend can be asymmetric, and it is what an escarpment is made of.
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
const ZONE_FIELDS = ['half', 'deckY', 'roofY'];
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
  const base = { half: W.half, deckY: W.deckY, roofY: W.roofY, riseL: 1, riseR: 1 };

  if (!W.zones) {
    return {
      src, W,
      keys: [{ z: zStart, ...base }, { z: zEnd, ...base }],
      bays: patternBays(W.pattern, W.chunkLen, zStart, zEnd),
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

  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i].z < keys[i - 1].z)) {
      fail(`emitted keys are not strictly descending at index ${i}: ${keys[i - 1].z} -> ${keys[i].z}`);
    }
  }
  return { src, W, keys, bays };
}

const _S = { half: 0, deckY: 0, roofY: 0, riseL: 1, riseR: 1 };

/**
 * The corridor at `z`. Reuses one object: every caller reads its fields before
 * the next call, and a per-call allocation here would run per vertex row.
 */
function sample(z, out = _S) {
  const K = profile().keys;
  let i = 0;
  while (i < K.length - 2 && z < K[i + 1].z) i++;
  const a = K[i], b = K[i + 1];
  const t = smooth(a.z, b.z, z);
  out.half = a.half + (b.half - a.half) * t;
  out.deckY = a.deckY + (b.deckY - a.deckY) * t;
  out.roofY = a.roofY + (b.roofY - a.roofY) * t;
  out.riseL = a.riseL + (b.riseL - a.riseL) * t;
  out.riseR = a.riseR + (b.riseR - a.riseR) * t;
  return out;
}

export class Works {
  constructor(root, mats) {
    this.root = new THREE.Group();
    this.root.name = 'works';
    root.add(this.root);
    /** { plate, deck, lit } — set before the queue runs; see corneria.js. */
    this.mats = mats || {};
    this.jobs = [];
    this._chunks = [];

    const W = profile().W;
    this.cfg = W;

    const n = Math.max(1, Math.ceil((WORLD.zStart - WORLD.zEnd) / W.chunkLen));
    for (let c = 0; c < n; c++) this.jobs.push(() => this._chunk(c));
  }

  /** The deck at `z` — the whole height field on this backend. */
  static deckY(z) { return sample(z).deckY; }

  /** Corridor half-width at `z`, deck edge to deck edge. */
  static halfAt(z) { return sample(z).half; }

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
    const z1 = Math.max(WORLD.zEnd, z0 - W.chunkLen);
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
      return { z, x: centrelineX(z), y: s.deckY, half: s.half, roof: s.roofY, riseL: s.riseL, riseR: s.riseR };
    };

    // ── the box ─────────────────────────────────────────────────────────────
    // Deck, curtain and roof are all one surface per segment with a corner at
    // each end, not a box centred on the middle: `half` and `deckY` both move
    // along z, and a run of centred boxes turns a taper into a sawtooth and a
    // descent into a stair.
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
        const ma = { z: a.z, x: a.x, y: a.y + a.roof - W.roofT - 0.2, half: W.lampW * 0.5 };
        const mb = { z: b.z, x: b.x, y: b.y + b.roof - W.roofT - 0.2, half: W.lampW * 0.5 };
        plane(lit, ma, mb, 0.6);
      }
      a = b;
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
          : r.range(0.25, 1) * W.setback;
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
          // floor-to-ceiling reads as circuit board rather than as architecture:
          // what makes a run of buildings legible is the solid ones between the
          // lit ones. A third stay bare plate, and a glazed block is clad over
          // part of its height rather than all of it.
          if (r.next() > 0.34) {
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
    if (lit.length) this._chunks.push(this._merge(lit, z0, this.mats.lit));
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

  /** A rectangular rim, as four slabs — the lit frame of a bulkhead port. */
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

  _merge(list, z0, material) {
    const g = mergeList(list);
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
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
  /** The kerb a flank drops to when nothing stands on it. */
  lipH: 9,
  /** Blocks: length along z, height, and depth outward from the edge. */
  blockLen: [46, 152],
  blockH: [115, 420],
  blockD: [34, 96],
  /** How far a set-back block steps away from the corridor edge. */
  setback: 74,
  /** A falling flank: how far the first terrace sits under the deck, and how
   *  much further down each metre of setback takes the next one. */
  terraceDrop: 34,
  terraceRake: 0.62,
  capH: 7,
  roofY: 190,
  roofT: 7,
  spanT: 9,
  spanW: 26,
  spanGap: 118,
  lampW: 22,
  bulkT: 12,
  /** Clear of `blockH`'s ceiling, or the bulkhead is shorter than its neighbours. */
  bulkH: 470,
  /** The port. Sized off the offset box, not by eye — see the assert below. */
  portW: 128,
  portH: 96,
  portY: 96,
  greebles: 6,
  fade: 4200,
  /** One held stretch per entry, blended into the one before. Null is one zone
   *  holding the flat fields above for the whole corridor. */
  zones: null,
  // open, open, span, open, enclosed, span, open, bulkhead — 8 bays ≈ 4.2 km,
  // so the level runs the cycle just over twice and no two adjacent bays repeat
  // the pattern at the same point in the corridor's own meander.
  pattern: [BAY.OPEN, BAY.OPEN, BAY.SPAN, BAY.OPEN, BAY.ENCLOSED, BAY.SPAN, BAY.OPEN, BAY.BULKHEAD],
};

const BAY_KINDS = new Set(Object.values(BAY));

export { BAY, DEFAULT_WORKS };
