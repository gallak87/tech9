// ─────────────────────────────────────────────────────────────────────────────
// Rear-threat arcs.
//
// Being flanked is fair; being shot by something the frame never gave you a way
// to notice is not. A hostile behind the player is off-screen by definition, so
// the only place left to say so is the border.
//
// Arcs sit on an ellipse hugging the frame, at the bearing of the threat in the
// *rail* frame — the same frame the radar uses, so "that side of the radar" and
// "that side of the screen" always agree. Intensity tracks how squarely the
// hostile is pointed at the player rather than merely how close it is: a foe
// crossing behind you is not the same event as one lining up a shot.
//
// The bearing is held off the bottom centre, where the radar lives.
// ─────────────────────────────────────────────────────────────────────────────

import { C, alpha, sat, clamp, approach } from './theme.js';

const BEHIND = -0.18;        // cos of the bearing past which a foe counts as rear
const AIM_ON = 0.55;         // cos of the foe's nose-to-player angle to register
const RANGE = 1400;          // m; past this a rear hostile is not yet a threat
const GAP = 0.42;            // rad held clear of bottom centre, for the radar
const HALF = 0.30;           // rad, half-width of one arc
const MAX_ARCS = 4;

export class ThreatArcs {
  constructor() {
    this.arcs = [];          // { key, ang, level, fade }
    this.pulse = 0;
  }

  update(dt, s) {
    this.pulse += dt;
    const F = s.fwd, Rt = s.right;
    const live = new Map();

    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (e.ally) continue;
      const dx = e.x - s.px, dy = e.y - s.py, dz = e.z - s.pz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1 || dist > RANGE) continue;

      const fwd = (dx * F.x + dz * F.z) / dist;
      if (fwd > BEHIND) continue;                      // not behind us
      const aim = e.aim == null ? 1 : e.aim;
      if (aim < AIM_ON) continue;                      // behind, but not on us

      // Bearing on the ring, 0 = dead ahead, growing clockwise. Held out of the
      // bottom-centre gap so an arc never lands on top of the radar.
      const lat = (dx * Rt.x + dz * Rt.z) / dist;
      const side = lat >= 0 ? 1 : -1;
      const bearing = Math.atan2(Math.abs(lat), fwd);  // 0..PI, magnitude only
      const ang = side * Math.min(bearing, Math.PI - GAP);

      // Nearer and better-aimed reads hotter. Range is the weaker term on
      // purpose — a distant hostile with your six is still worth the warning.
      const level = sat((aim - AIM_ON) / (1 - AIM_ON)) * (0.45 + 0.55 * (1 - dist / RANGE));
      const key = side > 0 ? 'r' + Math.round(ang * 4) : 'l' + Math.round(ang * 4);
      const prev = live.get(key);
      if (!prev || level > prev.level) live.set(key, { key, ang, level });
    }

    // Fade arcs in and out rather than popping, and keep the loudest few.
    for (const a of this.arcs) {
      const hit = live.get(a.key);
      if (hit) {
        a.ang = approach(a.ang, hit.ang, 6, dt);
        a.level = approach(a.level, hit.level, 7, dt);
        a.fade = approach(a.fade, 1, 9, dt);
        live.delete(a.key);
      } else {
        a.fade = approach(a.fade, 0, 5, dt);
      }
    }
    // Prune before admitting new arcs: a fresh arc starts at fade 0 and would
    // be culled by the same pass that created it.
    this.arcs = this.arcs.filter((a) => a.fade > 0.004);
    for (const n of live.values()) this.arcs.push({ ...n, fade: 0 });
    this.arcs
      .sort((a, b) => b.level * b.fade - a.level * a.fade)
      .splice(MAX_ARCS);
  }

  draw(g, L, s) {
    if (!this.arcs.length) return;
    const k = L.s;
    const cx = L.w * 0.5, cy = L.h * 0.5;
    const rx = L.w * 0.5 - L.padX * 0.5;
    const ry = L.h * 0.5 - L.padY * 0.5;

    g.save();
    g.lineCap = 'round';
    for (const a of this.arcs) {
      const v = a.level * a.fade;
      if (v <= 0.004) continue;
      // A locked-on threat throbs; a merely-aimed one sits steady.
      const beat = 0.78 + 0.22 * Math.sin(this.pulse * (5.0 + 3.5 * a.level));
      const heat = v * beat;

      // The ellipse is sampled directly so the band hugs a widescreen frame
      // instead of bulging away from the short edges.
      g.beginPath();
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        // ang is measured from "ahead"; screen up is -Y.
        const t = a.ang - HALF + (2 * HALF) * (i / steps);
        const x = cx + Math.sin(t) * rx;
        const y = cy - Math.cos(t) * ry;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = alpha(C.hostile, clamp(0.16 + 0.72 * heat, 0, 0.95));
      g.lineWidth = (2.2 + 4.6 * v) * k;
      g.shadowColor = alpha(C.hostile, 0.85 * heat);
      g.shadowBlur = (10 + 22 * v) * k;
      g.stroke();

      // Inner hairline keeps the arc legible where the glow washes out.
      g.shadowBlur = 0;
      g.strokeStyle = alpha(C.iceHot, 0.10 + 0.34 * heat);
      g.lineWidth = 1.1 * k;
      g.stroke();
    }
    g.restore();
  }
}
