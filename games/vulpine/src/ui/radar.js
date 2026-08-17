// ─────────────────────────────────────────────────────────────────────────────
// Contact radar (bottom-centre) and the speed / altitude flanks.
//
// Oriented to the *rail*, not to the ship's own attitude — a radar that rolls
// with a barrel roll is unreadable, and the thing a player needs is "where is
// the threat relative to the direction I am travelling". Contacts outside range
// are pinned to the rim as chevrons instead of vanishing, because knowing
// something is out there and behind you is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

import { text } from './glyphs.js';
import { C, PICKUP_C, alpha, sat, clamp, approach } from './theme.js';
import { arwing, diamond } from './icons.js';

const RANGE = 1150;          // world units mapped to the rim
const SWEEP_SLICES = 16;

export class Radar {
  constructor() {
    this.contacts = 0;
    this.spd = 0;
    this.alt = 0;
    this.alert = 0;
  }

  update(dt, s) {
    const n = s.enemies.length;
    if (n > this.contacts) this.alert = 1;
    this.contacts = n;
    this.spd = approach(this.spd, s.speed, 8, dt);
    this.alt = approach(this.alt, s.alt, 6, dt);
    this.alert = Math.max(0, this.alert - dt * 1.4);
  }

  draw(g, L, s) {
    const k = L.s;
    const R = Math.min(84 * k, L.w * 0.075);
    const cx = Math.round(L.w * 0.5);
    const cy = Math.round(L.h - L.padY - R * 1.0);

    g.save();

    /* ── dish ───────────────────────────────────────────────────────────── */
    const disc = g.createRadialGradient(cx, cy - R * 0.15, R * 0.1, cx, cy, R);
    disc.addColorStop(0, 'rgba(6,20,32,0.62)');
    disc.addColorStop(0.72, 'rgba(4,13,23,0.55)');
    disc.addColorStop(1, 'rgba(2,8,15,0.36)');
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = disc;
    g.shadowColor = 'rgba(0,6,12,0.5)';
    g.shadowBlur = 14 * k;
    g.fill();
    g.shadowBlur = 0;

    // forward firing arc
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R * 0.985, -Math.PI / 2 - 0.34, -Math.PI / 2 + 0.34);
    g.closePath();
    g.fillStyle = alpha(C.ice, 0.055);
    g.fill();

    /* ── grid ───────────────────────────────────────────────────────────── */
    g.lineWidth = 1 * k;
    g.strokeStyle = alpha(C.ice, 0.16);
    for (const r of [0.36, 0.68]) {
      g.beginPath();
      g.arc(cx, cy, R * r, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
    g.strokeStyle = alpha(C.ice, 0.11);
    g.stroke();

    // bezel ticks
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const major = i % 6 === 0;
      const len = major ? R * 0.13 : R * 0.06;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineWidth = (major ? 1.6 : 1) * k;
      g.strokeStyle = alpha(C.ice, major ? 0.42 : 0.2);
      g.stroke();
    }

    /* ── sweep ──────────────────────────────────────────────────────────── */
    const sweep = (s.time * 1.35) % (Math.PI * 2) - Math.PI / 2;
    g.save();
    g.beginPath();
    g.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
    g.clip();
    for (let i = 0; i < SWEEP_SLICES; i++) {
      const t = i / SWEEP_SLICES;
      const a0 = sweep - t * 1.5;
      const a1 = a0 - 1.5 / SWEEP_SLICES - 0.012;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, a0, a1, true);
      g.closePath();
      g.fillStyle = alpha(C.ice, 0.085 * (1 - t) * (1 - t));
      g.fill();
    }
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    g.lineWidth = 1.4 * k;
    g.strokeStyle = alpha(C.ice, 0.5);
    g.stroke();
    g.restore();

    /* ── contacts ───────────────────────────────────────────────────────── */
    const F = s.fwd, Rt = s.right;
    for (const e of s.enemies) {
      const dx = e.x - s.px, dy = e.y - s.py, dz = e.z - s.pz;
      const fwd = dx * F.x + dz * F.z;
      const lat = dx * Rt.x + dz * Rt.z;
      const dist = Math.hypot(fwd, lat);
      const boss = e.boss;
      const col = boss ? C.amber : (e.ally ? C.ally : C.hostile);

      let bx, by, off = false;
      if (dist > RANGE) {
        const sc = (R * 0.94) / dist;
        bx = cx + lat * sc; by = cy - fwd * sc; off = true;
      } else {
        const sc = R * 0.94 / RANGE;
        bx = cx + lat * sc; by = cy - fwd * sc;
      }

      if (off) {
        const ang = Math.atan2(by - cy, bx - cx);
        g.save();
        g.translate(bx, by);
        g.rotate(ang + Math.PI / 2);
        g.beginPath();
        g.moveTo(0, -3.4 * k); g.lineTo(2.9 * k, 2.2 * k); g.lineTo(-2.9 * k, 2.2 * k);
        g.closePath();
        g.fillStyle = alpha(col, 0.55);
        g.fill();
        g.restore();
        continue;
      }

      // vertical separation stem — altitude is half the information in a
      // flight game and a flat blip throws it away
      const dh = clamp(dy / 90, -1, 1);
      if (Math.abs(dh) > 0.12) {
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx, by - dh * 7 * k);
        g.lineWidth = 1.1 * k;
        g.strokeStyle = alpha(col, 0.5);
        g.stroke();
      }

      const sz = boss ? 5.6 * k : 3.7 * k;
      diamond(g, bx, by, sz, col, { glow: boss ? 10 * k : 6 * k });
      // Carrying a drop: the same halo the hull wears in the world, so the
      // radar answers "which of these four is worth turning for" at a glance.
      if (e.carrier && PICKUP_C[e.carrier]) {
        const pc = PICKUP_C[e.carrier];
        g.beginPath();
        g.arc(bx, by, sz * 1.9, 0, Math.PI * 2);
        g.lineWidth = 1.5 * k;
        g.strokeStyle = alpha(pc, 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(s.time * 4.2)));
        g.shadowColor = pc; g.shadowBlur = 7 * k;
        g.stroke();
        g.shadowBlur = 0;
      }
      if (boss) {
        g.beginPath();
        g.arc(bx, by, sz * 2.1, 0, Math.PI * 2);
        g.lineWidth = 1.2 * k;
        g.strokeStyle = alpha(col, 0.55);
        g.stroke();
      }
      if (e.locked) {
        g.beginPath();
        g.arc(bx, by, sz * 2.6, 0, Math.PI * 2);
        g.lineWidth = 1.4 * k;
        g.strokeStyle = alpha(C.iceHot, 0.9);
        g.stroke();
      }
    }

    /* ── drops ──────────────────────────────────────────────────────────── */
    // Drawn after the contacts and before the player, so a drop closing on the
    // ship passes over the hostiles rather than under them. A plus rather than
    // a diamond: nothing else on this dish is a plus, so it needs no legend.
    for (const p of s.pickups || []) {
      const dx = p.x - s.px, dy = p.y - s.py, dz = p.z - s.pz;
      const fwd = dx * F.x + dz * F.z;
      const lat = dx * Rt.x + dz * Rt.z;
      const dist = Math.hypot(fwd, lat);
      const col = PICKUP_C[p.kind] || C.gold;
      const sc = (dist > RANGE ? R * 0.94 / dist : R * 0.94 / RANGE);
      const bx = cx + lat * sc, by = cy - fwd * sc;
      const a = 0.7 + 0.3 * Math.sin(s.time * 7.5);
      const r = 3.4 * k;
      g.save();
      g.strokeStyle = alpha(col, a);
      g.lineWidth = 1.9 * k;
      g.shadowColor = col; g.shadowBlur = 8 * k;
      g.beginPath();
      g.moveTo(bx - r, by); g.lineTo(bx + r, by);
      g.moveTo(bx, by - r); g.lineTo(bx, by + r);
      g.stroke();
      g.restore();
      void dy;
    }

    /* ── player ─────────────────────────────────────────────────────────── */
    const pip = 15 * k;
    g.save();
    g.globalAlpha = 0.95;
    arwing(g, cx - pip / 2, cy - pip * 0.55, pip, {
      color: '#eaf8ff', wing: 'rgba(150,205,232,0.9)', trim: C.ice,
    });
    g.restore();

    /* ── bezel ──────────────────────────────────────────────────────────── */
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.lineWidth = 1.6 * k;
    g.strokeStyle = alpha(C.ice, 0.46 + 0.3 * this.alert);
    if (this.alert > 0.02) { g.shadowColor = C.hostile; g.shadowBlur = 12 * k * this.alert; }
    g.stroke();
    g.shadowBlur = 0;

    // contacts readout inside the lower arc
    const cn = this.contacts;
    text(g, cn ? `${String(cn).padStart(2, '0')} CONTACTS` : 'NO CONTACTS', cx, cy + R * 0.66, {
      size: 8.6 * k, track: 3.2, weight: 0.16, align: 'center', baseline: 'middle',
      color: cn ? alpha(C.hostile, 0.92) : alpha(C.ice, 0.42), shadow: 4 * k,
    });

    /* ── flanking readouts ──────────────────────────────────────────────── */
    this._readout(g, k, cx - R - 20 * k, cy, 'right', 'SPD', Math.round(this.spd), C.ice);
    this._readout(g, k, cx + R + 20 * k, cy, 'left', 'ALT', Math.round(Math.max(0, this.alt)), C.ice);

    g.restore();
  }

  _readout(g, k, x, y, align, label, value, color) {
    text(g, label, x, y - 9 * k, {
      size: 9.5 * k, track: 3.4, weight: 0.15, align, baseline: 'middle',
      color: alpha(color, 0.6), shadow: 4 * k,
    });
    text(g, String(value).padStart(3, '0'), x, y + 8 * k, {
      size: 20 * k, track: 1.3, weight: 0.15, align, baseline: 'middle',
      color: alpha(color, 0.95), shadow: 6 * k,
    });
    const w = 30 * k;
    const dir = align === 'right' ? -1 : 1;
    g.save();
    g.beginPath();
    g.moveTo(x, y - 20 * k);
    g.lineTo(x, y + 19 * k);
    g.lineWidth = 1.4 * k;
    g.strokeStyle = alpha(color, 0.3);
    g.stroke();
    g.restore();
    void w; void dir;
  }
}
