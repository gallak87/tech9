// ─────────────────────────────────────────────────────────────────────────────
// HUD / MENU CHROME SPEC — Phase 1.1 (art). Runnable: `node docs/specs/hud.mjs`.
//
// The `ui` lane draws to the #ui DOM/canvas layer and never touches the Three
// scene or the post chain (ARCHITECTURE.md §4) — so "glow bleed" here is NOT
// the WebGL bloom pass. It has to be faked with CSS/canvas: layered box-shadow
// or canvas shadowBlur, radial-gradient falloff, backdrop-filter. That is a
// real constraint on this file, not a style footnote — a spec that assumed
// real bloom would hand dev something unbuildable at the DOM layer.
//
// Fixes defect 7 (1px neon rectangle, no depth/glow bleed/panel weight) and
// defect 8 (HUD is unstyled debug text) structurally: keep the prototype's
// information design (it is good — proto-ref says so explicitly), replace
// only the material.
// ─────────────────────────────────────────────────────────────────────────────

import { UI_PALETTE, contrastRatio } from './palette.mjs';
import { HERO_SPRITE_ROWS, SPRITE_PX_PER_METRE } from './rig.mjs';

/* ── Tabs — structure kept from the prototype verbatim ────────────────────── */
export const TABS = [
  { key: '1', id: 'map',       label: 'Map' },
  { key: '2', id: 'party',     label: 'Party' },
  { key: '3', id: 'inventory', label: 'Inventory' },
  { key: '4', id: 'skills',    label: 'Skills' },
  { key: '5', id: 'quests',    label: 'Quests' },
  { key: '6', id: 'save',      label: 'Save' },
  { key: '7', id: 'settings',  label: 'Settings' },
];
export const KEYBOARD_HINT = '[Q/E] tabs   [1–7] jump   [Esc/Tab] close';
export const MAP_TAB_HINT_SUFFIX = '   (Map: drag / WASD / wheel / =- zoom / R reset)';

/* ── Type scale ────────────────────────────────────────────────────────────
   Player-facing UI gets a clean sans, NOT the dev panel's monospace — sharing
   a font with devpanel.js is exactly how a HUD ends up reading as debug text
   (defect 8). Monospace is kept, deliberately, for anything tabular: stat
   columns and the keyboard hint row, where digit alignment matters more than
   personality. */
export const FONT_UI = `'Inter', 'Segoe UI', system-ui, sans-serif`;
export const FONT_MONO = `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`;

export const TYPE_SCALE = {
  tabLabel:     { size: 14, weight: 700, family: FONT_UI,   transform: 'uppercase', tracking: '0.04em' },
  sectionHead:  { size: 11, weight: 600, family: FONT_UI,   transform: 'uppercase', tracking: '0.12em', color: UI_PALETTE.textMuted },
  body:         { size: 13, weight: 400, family: FONT_UI },
  statLabel:    { size: 12, weight: 500, family: FONT_MONO, color: UI_PALETTE.textMuted },
  statValue:    { size: 13, weight: 700, family: FONT_MONO },
  bigReadout:   { size: 22, weight: 800, family: FONT_MONO }, // level, HP/MP numerals, resource counts
  keyboardHint: { size: 10, weight: 500, family: FONT_MONO, color: UI_PALETTE.textMuted, tracking: '0.02em' },
};

/* ── Panel chrome — depth, glow bleed, weight ────────────────────────────────
   Three stacked layers is the whole trick:
     1. scrim   — dims the game behind the panel so chrome reads as ON TOP,
                  not painted on the same plane (the prototype had no scrim
                  at all, which is most of why its panel felt like a rectangle
                  drawn over the game rather than a surface floating above it).
     2. panel   — translucent dark fill + backdrop blur, so it still shows the
                  world moving underneath (this is a paused overlay, not a
                  scene change).
     3. border  — a 1.5px hairline in the ACTIVE tab's colour, with the glow
                  bleed done as three stacked box-shadows at increasing blur
                  and decreasing alpha — CSS's answer to a bloom falloff curve
                  since the real bloom pass cannot reach this layer. */
export const PANEL = {
  scrim: 'rgba(4,2,10,0.55)',
  bg: 'rgba(10,7,20,0.86)',
  backdropBlurPx: 14,
  borderWidthPx: 1.5,
  cornerRadiusPx: 6,           // sci-fi panel, not soft-app rounding — small, not pill-shaped
  glowBleed: [ // [blurPx, alpha] stacked outward from the border colour
    [4, 0.55],
    [14, 0.30],
    [34, 0.14],
  ],
  cornerBracketLenPx: 18,       // small accent brackets at each panel corner — cheap, reads as "designed"
  cornerBracketWidthPx: 2,
};

export function boxShadowCss(colorHex) {
  return PANEL.glowBleed
    .map(([blur, alpha]) => `0 0 ${blur}px ${hexA(colorHex, alpha)}`)
    .concat([`inset 0 1px 0 ${hexA('#ffffff', 0.06)}`]) // faint top highlight = panel has thickness
    .join(', ');
}
function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ── HUD bars — kept red/cyan/yellow from the prototype (already legible,
   already distinct from any hero's identity colour, no reason to change) ──── */
export const HUD_BARS = { hp: UI_PALETTE.hpBar, mp: UI_PALETTE.mpBar, xp: UI_PALETTE.xpBar };

/* ── Portrait crop — the rig GENERATES this, there is nothing to match
   (proto-ref finding 4b: portraits are placeholder letter-circles) ─────────
   A dedicated camera, not a cropped gameplay frame: front three-quarter (15°
   yaw off the character's own forward, not the 55° gameplay pitch — a
   portrait shot at gameplay pitch reads as the top of a head, not a face),
   bust framing from mid-chest to just above the crown, square aspect so the
   UI can circle-crop it exactly like the prototype's K/V/R badges.

   Row density matches the OVERWORLD rig's virtual-pixel density (see
   rig.mjs SPRITE_PX_PER_METRE) rather than being independently tuned — a
   portrait rendered "sharper" than the character it belongs to would read as
   a different rendering system, which is the one thing this spec must not
   allow given the rig is the only source of portrait art. Because the crop
   shows ~0.55m of the character (bust height) at a much larger fraction of
   the frame than the overworld does, it lands at a higher ABSOLUTE virtual-
   pixel count automatically — same density, more of the character fills more
   of the frame. */
export const PORTRAIT = {
  renderPx: 256,             // square; UI applies the circle mask, not the renderer
  yawDeg: 15,                // off the character's own forward, NOT gameplay pitch
  pitchDeg: 6,                // slight down-angle, avoids a flat mugshot
  bustHeightM: 0.55,          // mid-chest to crown
  updatesOn: ['weapon:equipped', 'armor:equipped', 'accessory:equipped', 'hero:levelUp'],
  spriteRowsInFrame: Math.round(SPRITE_PX_PER_METRE * 0.55), // ≈ 15 — see rig.mjs for the formula this mirrors
};

/* ── Loot drop — diegetic, per CONCEPT.md: "not a silent inventory increment" ─
   Item mesh pops from the source (enemy or world-drop marker), arcs on a
   short physical toss, lands with one bounce, then idles as a small prop: a
   thin light pillar (reuses the emissive neon material, no new shader) plus
   the item mesh slow-rotating above it. A screen-space toast confirms the
   pickup for players who are looking at their party, not the ground. */
export const LOOT_DROP = {
  arc: { riseM: 0.6, durationS: 0.45, bounceDampening: 0.35 },
  pillar: { heightM: 1.1, widthM: 0.03, material: 'neon', colorByRarity: true },
  idleSpinDegPerS: 40,
  toast: { text: '+{itemName}', durationS: 2.2, position: 'lower-third', font: TYPE_SCALE.body },
};

/* ── Title screen — exists in the prototype, unassigned to any tier until now
   (proto-ref finding 4: lands in Tier 5 with the rest of menu chrome) ─────── */
export const TITLE_SCREEN = {
  wordmark: { text: 'CHRONOFORGE', colorPrimary: UI_PALETTE.magenta, glow: true },
  subtitle: { text: 'a post-collapse action-RPG', color: UI_PALETTE.cyan },
  buttons: ['CONTINUE', 'NEW GAME'],
  hint: '↑↓ to select · ENTER to confirm',
  saveSummaryFormat: 'Tier {settlementTier} · Lv {kaidaLv}/{vexLv}/{runeLv} · {date}',
};

/* ── Self-check ───────────────────────────────────────────────────────────── */
function validate() {
  const problems = [];
  if (TABS.length !== 7) problems.push(`expected 7 tabs, found ${TABS.length}`);
  const keys = TABS.map(t => t.key);
  if (new Set(keys).size !== keys.length) problems.push('duplicate tab hotkeys');
  if (!'1234567'.split('').every((k, i) => keys[i] === k)) problems.push('tab hotkeys must be 1..7 in order');

  // Text-on-panel contrast — WCAG AA for body text is 4.5:1.
  const bodyOnPanel = contrastRatio(UI_PALETTE.textPrimary, '#0a0714');
  if (bodyOnPanel < 4.5) problems.push(`body text on panel bg: ${bodyOnPanel.toFixed(2)}:1, needs >=4.5`);
  const mutedOnPanel = contrastRatio(UI_PALETTE.textMuted, '#0a0714');
  if (mutedOnPanel < 3.0) problems.push(`muted text on panel bg: ${mutedOnPanel.toFixed(2)}:1, needs >=3.0 (non-body text floor)`);

  if (PORTRAIT.spriteRowsInFrame < HERO_SPRITE_ROWS * 0.2) {
    problems.push('portrait sprite-row density looks too low relative to the overworld rig');
  }

  return { ok: problems.length === 0, problems, bodyOnPanel, mutedOnPanel };
}

export function report() {
  const v = validate();
  const lines = [];
  lines.push('chronoforge-dawn HUD/menu-chrome spec');
  lines.push(`tabs: ${TABS.map(t => `${t.key}:${t.id}`).join(' ')}`);
  lines.push(`hint: "${KEYBOARD_HINT}"`);
  lines.push(`body-on-panel contrast: ${v.bodyOnPanel.toFixed(2)}:1 (AA needs 4.5)`);
  lines.push(`muted-on-panel contrast: ${v.mutedOnPanel.toFixed(2)}:1`);
  lines.push(`portrait: ${PORTRAIT.renderPx}px square, yaw ${PORTRAIT.yawDeg}°, ~${PORTRAIT.spriteRowsInFrame} sprite-rows of bust`);
  lines.push(`sample glow bleed css: ${boxShadowCss(UI_PALETTE.magenta)}`);
  lines.push(v.ok ? 'VALID' : `INVALID:\n  - ${v.problems.join('\n  - ')}`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(report());
  if (!validate().ok) process.exit(1);
}
