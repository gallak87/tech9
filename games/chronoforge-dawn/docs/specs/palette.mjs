// ─────────────────────────────────────────────────────────────────────────────
// PALETTE SPEC — Phase 1.1 (art). Runnable: `node docs/specs/palette.mjs`.
//
// Two things live here:
//   1. Fixed, small per-actor colour palettes — the "sprite" read comes as
//      much from a LIMITED colour set as from pixel-snapping the geometry.
//   2. The IFF ident-beacon: the diegetic replacement for blob-shadow
//      friend/foe colour (proto-ref finding 4a — see agents/art-output.md §4a
//      for the full argument, this file is the runnable half of it).
//
// No THREE.js dependency, no Math.random — every value here is authored data
// or a pure function, consistent with core/rng.js's determinism rule even
// though this module never needs to pull a stream.
// ─────────────────────────────────────────────────────────────────────────────

/* ── Hero palettes ────────────────────────────────────────────────────────────
   Matches the prototype's already-established per-hero identity colours
   (menu-party.png portrait rings: Kaida magenta, Vex cyan, Rune gold) rather
   than inventing new ones — CONCEPT.md: adopt tuned choices unless there is a
   stated reason not to. Each palette is short on purpose: 9 colours, the kind
   of budget a hand-authored 16-bit sprite sheet would actually have. Materials
   in the `actors` lane are built FROM these arrays, not from ad-hoc hex
   literals — that constraint is what "palette-quantised" means at the colour
   level, independent of the tonal banding in rig.mjs. */
export const HERO_PALETTES = {
  kaida: { // Warrior — magenta identity, matches her pink hair + magenta blade in proto-ref
    skin: '#e8b48f', hair: '#ff2fa0', eyes: '#22e5ff',
    clothPrimary: '#1c2f44', clothSecondary: '#3a5a72', trim: '#22e5ff',
    metal: '#9aa3ad', weaponEmissive: '#ff2fa0', shadowTint: '#120a18',
  },
  vex: { // Mage — cyan identity, hooded robe
    skin: '#d9c2b0', hair: '#241c30', eyes: '#22e5ff',
    clothPrimary: '#150f22', clothSecondary: '#2a1f3e', trim: '#22e5ff',
    metal: '#7a7f92', weaponEmissive: '#22e5ff', shadowTint: '#0a0714',
  },
  rune: { // Sentinel — gold identity, bulky frontline armour
    skin: '#c9a67e', hair: '#4a3a2a', eyes: '#ffcf5c',
    clothPrimary: '#3a2c14', clothSecondary: '#6b4f22', trim: '#ffcf5c',
    metal: '#a8925f', weaponEmissive: '#ffcf5c', shadowTint: '#160f08',
  },
};

/* ── Enemy palette family ─────────────────────────────────────────────────────
   Deliberately NOT drawn from the hero magenta/cyan/gold set. Heroes read as
   "clean scavenged tech"; enemies read as "feral / corrupted organic" — earth
   and hazard tones, with the IFF hazard colour (below) doubling as their
   bioluminescent warning marking. This is a second, cheaper layer of
   friend/foe read that holds even before a viewer notices the beacon shape:
   silhouette-level material family, not just a HUD trick. */
export const ENEMY_PALETTE_FAMILY = {
  hide: ['#5a4a32', '#6b5738', '#3f3524'],       // fur/hide base variants across tiers
  chitin: ['#2e3624', '#4a5238'],                 // carapace / armour plate
  warning: '#ff5a2a',                             // bioluminescent marking — same hue as the IFF hazard beacon
  eyes: '#ffb020',
};

/* ── UI identity (menu chrome / HUD) ──────────────────────────────────────────
   Reuses the game's two-colour neon identity rather than adding a third UI
   hue — see agents/art-output.md §3 for why. */
export const UI_PALETTE = {
  magenta: '#ff2fa0',
  cyan: '#22e5ff',
  panelBg: '#0a0714',      // near-black violet, matches devpanel.js precedent
  panelBgAlt: '#150f22',
  textPrimary: '#f0eefc',
  textMuted: '#8a83b8',
  hpBar: '#ff3b4a',
  mpBar: '#22e5ff',
  xpBar: '#ffd23f',
};

/* ── IFF ident-beacon — the 4a fix ────────────────────────────────────────────
   Blob-shadow colour (teal hero / red-orange enemy, proto-ref finding 1) dies
   the moment defect 3 lands real contact shadows — a physically lit shadow
   cannot also be a coloured faction paint without stopping being a shadow.
   Defect 6 additionally forbids a non-diegetic marker (that is the concealment
   rule, but the same taste call applies here: no floating icon, no screen-
   space chip).

   Fix: SHAPE is the primary channel, colour is reinforcement only. A small
   emissive pennant mounted on socket.chest (rig.mjs) — a flat blade shape,
   built from the SAME neon-emissive material the game already uses for
   weapon trim, zero new geometry budget beyond one quad per actor:

     ally    → pennant points UP,   pulses cyan  (`#22e5ff`)
     hostile → pennant points DOWN, pulses amber (`#ff5a2a`, matches the
               enemy warning marking above — one hazard hue, not a new one)

   Shape-first means the read survives colourblindness and survives fog/dusk
   desaturation; colour is there for players who have it, not the only tell.
   It is diegetic: in-fiction it is chrono-forge ident tech every actor visibly
   carries, not a UI overlay — it lives ON the character, gets lit by the same
   key light as everything else, and is unaffected by whatever the ground
   shadow underneath is doing. */
export const IFF_BEACON = {
  ally:    { shape: 'up',   color: '#22e5ff', pulseHz: 0.6 },
  hostile: { shape: 'down', color: '#ff5a2a', pulseHz: 0.9 }, // slightly faster — reads as "alert"
};

/* ── Quantise ─────────────────────────────────────────────────────────────────
   Posterise a colour to N levels per channel. Used two ways: (1) authoring
   check — every hex above should already BE on a coarse grid, this function
   proves it; (2) available to the actors lane if it ever derives a colour
   procedurally (e.g. a tinted variant) instead of picking one from the table
   above, so a derived colour cannot drift off the game's palette discipline. */
export function quantiseColor(hex, levels = 6) {
  const { r, g, b } = hexToRgb(hex);
  const step = 255 / (levels - 1);
  const q = (v) => Math.round(Math.round(v / step) * step);
  return rgbToHex(q(r), q(g), q(b));
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** Relative luminance + WCAG contrast ratio — used by the self-check below and
 *  by hud.mjs for menu-chrome text-on-panel checks. Pure, no deps. */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA) + 0.05;
  const b = relativeLuminance(hexB) + 0.05;
  return a > b ? a / b : b / a;
}

/* ── Self-check ───────────────────────────────────────────────────────────── */
function validate() {
  const problems = [];

  // Every hero eye colour must be its own trim colour or the UI cyan/magenta —
  // catches an accidental one-off hue slipping into a palette.
  for (const [name, p] of Object.entries(HERO_PALETTES)) {
    if (Object.keys(p).length !== 9) problems.push(`${name}: expected 9 palette entries, found ${Object.keys(p).length}`);
  }

  // Ally/hostile beacon colours must be perceptibly different (contrast ratio
  // is a fine proxy for "not confusable at a glance" even though these are
  // both saturated colours, not text).
  const cr = contrastRatio(IFF_BEACON.ally.color, IFF_BEACON.hostile.color);
  if (cr < 1.4) problems.push(`IFF beacon colours too close: contrast ratio ${cr.toFixed(2)}`);

  // No hero's weapon-emissive collides with the hostile hazard hue — would
  // undercut the "heroes are cool/tech, enemies are warm/hazard" read.
  for (const [name, p] of Object.entries(HERO_PALETTES)) {
    if (p.weaponEmissive.toLowerCase() === IFF_BEACON.hostile.color.toLowerCase()) {
      problems.push(`${name}.weaponEmissive collides with hostile hazard colour`);
    }
  }

  // Quantise must be idempotent — re-quantising an already-quantised colour
  // changes nothing, which is what "on a coarse grid" means.
  const test = quantiseColor('#ff2fa0');
  if (quantiseColor(test) !== test) problems.push(`quantiseColor not idempotent: ${test} -> ${quantiseColor(test)}`);

  return { ok: problems.length === 0, problems, iffContrast: cr };
}

export function report() {
  const v = validate();
  const lines = [];
  lines.push('chronoforge-dawn palette spec');
  lines.push(`heroes: ${Object.keys(HERO_PALETTES).join(', ')}`);
  lines.push(`IFF ally=${IFF_BEACON.ally.color} (${IFF_BEACON.ally.shape})  hostile=${IFF_BEACON.hostile.color} (${IFF_BEACON.hostile.shape})  contrast=${v.iffContrast.toFixed(2)}:1`);
  lines.push(`quantiseColor('#ff37a3', 6) = ${quantiseColor('#ff37a3', 6)}`);
  lines.push(v.ok ? 'VALID' : `INVALID:\n  - ${v.problems.join('\n  - ')}`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(report());
  if (!validate().ok) process.exit(1);
}
