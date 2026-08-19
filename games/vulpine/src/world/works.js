import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { chamferBox, boltRow, louvers } from '../render/geobuild.js';
import { WORLD, centrelineX, centrelineY } from './profile.js';

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
// ── Bays ─────────────────────────────────────────────────────────────────────
// The level is a sequence of bays, each one chunk long, and the bay kind is what
// varies along z. Authored as a repeating pattern rather than sampled randomly,
// because the point is rhythm — open, open, spanned, enclosed, open — and a
// random walk over four kinds produces mush, which is the same mistake the
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

export class Works {
  constructor(root, mats) {
    this.root = new THREE.Group();
    this.root.name = 'works';
    root.add(this.root);
    /** { plate, deck, lit } — set before the queue runs; see corneria.js. */
    this.mats = mats || {};
    this.jobs = [];
    this._chunks = [];

    const W = { ...DEFAULT_WORKS, ...(WORLD.works || {}) };
    this.cfg = W;

    const n = Math.max(1, Math.ceil((WORLD.zStart - WORLD.zEnd) / W.chunkLen));
    this._bays = [];
    for (let c = 0; c < n; c++) this._bays.push(W.pattern[c % W.pattern.length]);
    for (let c = 0; c < n; c++) this.jobs.push(() => this._chunk(c));
  }

  /** The deck is flat, so this is the whole height field. */
  static deckY() { return (WORLD.works || DEFAULT_WORKS).deckY ?? DEFAULT_WORKS.deckY; }

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
  ceilingAt(z) {
    const W = this.cfg;
    const ci = Math.floor((WORLD.zStart - z) / W.chunkLen);
    const kind = this._bays[ci];
    if (kind === BAY.ENCLOSED) return W.deckY + W.roofY - W.roofT - 1.1;
    if (kind === BAY.SPAN) return W.deckY + W.roofY - W.spanT * 0.5;
    return Infinity;
  }

  _chunk(ci) {
    const W = this.cfg;
    const kind = this._bays[ci];
    const z0 = WORLD.zStart - ci * W.chunkLen;
    const z1 = Math.max(WORLD.zEnd, z0 - W.chunkLen);
    const r = new RNG(`${WORLD.id}:works-${ci}`);

    const plate = [];   // hull plating, ribs, roof
    const deck = [];    // the floor
    const lit = [];     // window strips and lamp banks

    const push = (into, geo, x, y, z, ry = 0) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      into.push({ geo, m });
    };

    // ── deck ────────────────────────────────────────────────────────────────
    // One slab per chunk, following the rail laterally. Segmented along z so it
    // tracks the meander instead of shearing off it.
    const SEGS = 6;
    for (let i = 0; i < SEGS; i++) {
      const za = z0 - (i / SEGS) * W.chunkLen;
      const zb = z0 - ((i + 1) / SEGS) * W.chunkLen;
      const zm = (za + zb) * 0.5;
      push(deck, this._slab(W.half * 2, W.deckT, Math.abs(za - zb) + 0.5),
        centrelineX(zm), W.deckY - W.deckT * 0.5, zm);
    }

    // ── massing ─────────────────────────────────────────────────────────────
    // The sides are a run of blocks, not a wall. A flat plane with a lit band
    // across it reads as an extruded trough with a racing stripe on it — the
    // same mistake the canyon makes, a cross-section with decoration applied —
    // because at 175 m/s what says "built" is *silhouette*, and a plane has
    // none. Blocks vary in height, depth and setback, so the skyline steps and
    // the recesses read as bays rather than as holes.
    //
    // A `curtain` runs continuously at the corridor edge underneath them, so a
    // set-back block leaves an upper-level recess instead of a gap you can see
    // the stars through at deck level.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < SEGS; i++) {
        const za = z0 - (i / SEGS) * W.chunkLen;
        const zb = z0 - ((i + 1) / SEGS) * W.chunkLen;
        const zm = (za + zb) * 0.5;
        push(plate, this._slab(W.wallT, W.curtainH, Math.abs(za - zb) + 0.5),
          centrelineX(zm) + side * W.half, W.deckY + W.curtainH * 0.5, zm);
      }

      let z = z0;
      while (z > z1) {
        const zb = Math.max(z1, z - r.range(W.blockLen[0], W.blockLen[1]));
        const zm = (z + zb) * 0.5;
        const len = z - zb;
        if (len < 8) break;
        const h = r.range(W.blockH[0], W.blockH[1]);
        const depth = r.range(W.blockD[0], W.blockD[1]);
        // Most blocks sit on the corridor edge; a minority step back, and that
        // minority is what stops the run reading as one extrusion.
        const set = r.next() < 0.42 ? r.range(12, W.setback) : 0;
        const xin = centrelineX(zm) + side * (W.half + set);

        push(plate, this._slab(depth, h, len + 0.5), xin + side * depth * 0.5,
          W.deckY + h * 0.5, zm);
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
            W.deckY + fh * 0.5 + (h - fh) * r.range(0, 0.35), zm);
        }
        // A cap band, so a block terminates rather than just stopping.
        push(plate, this._slab(depth + 5, W.capH, len + 5.5), xin + side * depth * 0.5,
          W.deckY + h + W.capH * 0.5, zm);
        z = zb;
      }
    }

    // ── deck lighting ───────────────────────────────────────────────────────
    // In every bay, not only the roofed ones. The IBL here is a starfield, which
    // is black, so inside a box the only things with any area contributing light
    // are these — and a bay without them measured 42% of the frame crushed to
    // pure black.
    for (let i = 0; i < SEGS; i++) {
      const za = z0 - (i / SEGS) * W.chunkLen;
      const zb = z0 - ((i + 1) / SEGS) * W.chunkLen;
      const zm = (za + zb) * 0.5;
      for (const s2 of [-1, 1]) {
        push(lit, this._slab(W.lampW * 0.5, 1.2, Math.abs(za - zb) * 0.9),
          centrelineX(zm) + s2 * W.half * 0.55, W.deckY + 2.2, zm);
      }
    }

    // ── what is overhead ────────────────────────────────────────────────────
    if (kind === BAY.SPAN) {
      for (let z = z0 - W.spanGap * 0.5; z > z1; z -= W.spanGap) {
        const x = centrelineX(z);
        push(plate, this._slab(W.half * 2, W.spanT, W.spanW), x, W.deckY + W.roofY, z);
        // Hangers down from the span ends, so a gantry is carried rather than
        // floating. Fixed length: with massing there is no single wall head to
        // land on any more.
        const hang = W.roofY * 0.34;
        for (const s of [-1, 1]) {
          push(plate, this._slab(W.spanT * 0.7, hang, W.spanW * 0.7),
            x + s * (W.half - W.wallT), W.deckY + W.roofY - hang * 0.5, z);
        }
      }
    } else if (kind === BAY.ENCLOSED) {
      for (let i = 0; i < SEGS; i++) {
        const za = z0 - (i / SEGS) * W.chunkLen;
        const zb = z0 - ((i + 1) / SEGS) * W.chunkLen;
        const zm = (za + zb) * 0.5;
        push(plate, this._slab(W.half * 2, W.roofT, Math.abs(za - zb) + 0.5),
          centrelineX(zm), W.deckY + W.roofY, zm);
        // Lamp runs down the roof line: with the sky gone this is the only light
        // shaping the tunnel, and an unlit tunnel is a black rectangle.
        push(lit, this._slab(W.lampW, 0.6, Math.abs(za - zb) * 0.86),
          centrelineX(zm), W.deckY + W.roofY - W.roofT - 0.5, zm);
      }
    } else if (kind === BAY.BULKHEAD) {
      // A wall across the corridor with a port through it. The port is centred
      // on the rail and sized off the offset box, so it is always flyable —
      // asserted rather than eyeballed, because a bulkhead you cannot pass is a
      // level that cannot be finished.
      const z = (z0 + z1) * 0.5;
      const x = centrelineX(z);
      const pw = W.portW, ph = W.portH, py = W.deckY + W.portY;
      // Above the tallest block, not at the roof line. Stopping at `roofY` in an
      // OPEN bay left a slab shorter than its own surroundings with stars over
      // the top of it — a billboard with a hole, not a wall that seals.
      const top = W.deckY + W.bulkH;
      // left / right / over / under the port
      push(plate, this._slab(W.half - pw, top - W.deckY, W.bulkT),
        x - (W.half + pw) * 0.5, W.deckY + (top - W.deckY) * 0.5, z);
      push(plate, this._slab(W.half - pw, top - W.deckY, W.bulkT),
        x + (W.half + pw) * 0.5, W.deckY + (top - W.deckY) * 0.5, z);
      push(plate, this._slab(pw * 2, top - (py + ph * 0.5), W.bulkT),
        x, (top + py + ph * 0.5) * 0.5, z);
      push(plate, this._slab(pw * 2, (py - ph * 0.5) - W.deckY, W.bulkT),
        x, (W.deckY + py - ph * 0.5) * 0.5, z);
      // a lit rim around the port so it reads as a way through, not a shadow
      push(lit, this._ring(pw, ph, 1.6, W.bulkT * 0.6), x, py, z - W.bulkT * 0.6);
      // Buttresses either side, so a wall this tall is carried rather than
      // standing on its own edge.
      for (const s2 of [-1, 1]) {
        push(plate, this._slab(W.bulkT * 2.2, top - W.deckY, W.bulkT * 3),
          x + s2 * (W.half - W.bulkT), W.deckY + (top - W.deckY) * 0.5, z);
      }
    }

    // ── greebles ────────────────────────────────────────────────────────────
    // Cheap, and the only thing standing between "built" and "extruded". Two per
    // chunk on alternating walls, from a fixed stream so the level is stable.
    for (let i = 0; i < W.greebles; i++) {
      const z = r.range(z0, z1);
      const side = r.sign();
      const x = centrelineX(z) + side * (W.half - W.wallT);
      const y = W.deckY + r.range(24, W.roofY * 0.72);
      if (r.next() < 0.5) {
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

/** Overridable per DNA via `works: {…}`. Metres throughout. */
const DEFAULT_WORKS = {
  chunkLen: 520,
  /** Corridor half-width. Well outside the ±105 offset box. */
  half: 190,
  deckY: -26,
  deckT: 6,
  wallT: 7,
  /** Continuous at the corridor edge, under the massing. */
  curtainH: 44,
  /** Blocks: length along z, height, and depth outward from the edge. */
  blockLen: [46, 152],
  blockH: [115, 420],
  blockD: [34, 96],
  /** How far a set-back block steps away from the corridor edge. */
  setback: 74,
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
  // open, open, span, open, enclosed, span, open, bulkhead — 8 bays ≈ 4.2 km,
  // so the level runs the cycle just over twice and no two adjacent bays repeat
  // the pattern at the same point in the corridor's own meander.
  pattern: [BAY.OPEN, BAY.OPEN, BAY.SPAN, BAY.OPEN, BAY.ENCLOSED, BAY.SPAN, BAY.OPEN, BAY.BULKHEAD],
};

export { BAY, DEFAULT_WORKS };
