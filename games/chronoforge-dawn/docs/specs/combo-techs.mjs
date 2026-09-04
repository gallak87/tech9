// docs/specs/combo-techs.mjs
// Dual/triple tech spec — Phase 1.1 (gamedesign). Net-new mechanic: the
// prototype has combo FRAMING only (battle.js `comboFlash`/`comboText`,
// fired today by every solo support/AoE tech via flashPortrait()) but no
// combo mechanic — there are no tuned numbers to port. Ground truth for the
// ATB math and the single-tech damage shape this extends is
// games/chronoforge/src/battle.js.

export const HERO_IDS = ['kaida', 'vex', 'rune'];

// --- ATB fill math, ported as-is from battle.js updateBattle() ---
export const HERO_FILL_DIVISOR = 59;    // hero.atb += spd/59 per 16.67ms tick
export const ENEMY_FILL_DIVISOR = 41;   // enemy.atb += spd/41 per 16.67ms tick
export const enemyTierHeadStart = tier => (tier - 1) * 8; // T1=0 .. T5=32

// ms to fill an empty gauge to 100 at a given SPD. Used to size the combo
// banking window below — not a new mechanic, just the existing math read
// off as time instead of percent.
export function fillTimeMs(spd, divisor = HERO_FILL_DIVISOR) {
  return (100 / (spd / divisor)) * 16.67;
}

// --- the trigger rule (see agents/gamedesign-output.md SS1 for full rationale) ---
// battle.js's turn arbiter always force-opens the LOWEST-INDEX ready hero's
// menu (`b.heroes.findIndex(h => h.atb >= 100)`) and Escape just closes the
// menu without changing atb — next tick the SAME hero reopens, because the
// findIndex re-picks them. There is no way today to bank one ready hero
// while acting with another, so "two heroes ready at once" is a rare
// coincidence, not something the player can set up. Combos need a real
// bank. This is a PROPOSED extension to the arbiter, required for the
// mechanic below to be reachable by play rather than by luck:
export const COMBO_TRIGGER = {
  // 4th root menu option beside attack/tech/defend. Selecting it sets
  // hero.waiting = true and returns to the sim tick WITHOUT resetting atb
  // (atb already doesn't decay once at 100 in the donor code — waiting
  // costs nothing but the wait itself).
  rootOption: 'wait',
  waitFlag: 'waiting',
  // Arbiter change: `readyHero = heroes.findIndex(h => h.hp>0 && h.atb>=100 && !h.waiting)`
  // — skips waiting heroes so a DIFFERENT ready hero's menu can open next.
  // Whenever a hero's menu opens (waiting or not) and >=1 OTHER hero is
  // ready/waiting, a 'combo' root option appears listing every entry in
  // COMBO_TECHS whose `participants` is a subset of {this hero} union
  // {every other ready/waiting hero}. Picking one consumes ALL participants'
  // gauges and MP at once; no further per-partner confirmation needed since
  // readiness already proved willingness to spend the turn.
  comboOption: 'combo',
};

// --- damage formula ---
// Solo tech shape, ported verbatim from battle.js techHit():
//   dmg = power * stat + stat * 0.5 - target.def * 0.5
// Combo shape is the SAME family over a stat SUM across participants, not a
// bespoke formula, so it reads as an extension rather than a new system:
//   dmg = power * statSum + statSum * 0.5 - target.def * defMult
export function comboDamage({ power, statSum, defMult = 0.5 }, targetDef) {
  return Math.max(1, Math.round(power * statSum + statSum * 0.5 - targetDef * defMult));
}

// Crit reuses techHit's `0.10 + crit/100` shape with a flat spectacle bonus.
// DEVIATION from donor, recorded: solo techs crit at 0.10 base; combos ask
// for real setup cost (a banked turn, doubled MP), so they get +0.05 base
// to make the investment read as more likely to pop, not just hit harder.
export const SOLO_TECH_CRIT_BASE = 0.10; // ported from battle.js techHit()
export const COMBO_CRIT_BONUS = 0.05;    // net-new
export function comboCritChance(avgCrit) {
  return SOLO_TECH_CRIT_BASE + COMBO_CRIT_BONUS + avgCrit / 100;
}

// level-1 base stats, ported verbatim from games/chronoforge/src/progression.js HERO_DEFS
export const BASE_STATS = {
  kaida: { str: 18, int: 6, tec: 8 },
  vex: { str: 6, int: 18, tec: 10 },
  rune: { str: 10, int: 8, tec: 16 },
};

export function comboStatSum(combo, statsById = BASE_STATS) {
  return combo.participants.reduce((sum, id) => sum + statsById[id][combo.statOf[id]], 0);
}

// --- the four combos ---
// gaugeCost is % of ATB consumed per participant (always 100 — a full
// banked turn, no partial-gauge combos in v1). mp is drawn from EACH hero's
// OWN mp pool at their OWN component cost (no new shared-MP resource).
// shape: 'single' one target | 'cleave' primary + 1 adjacent enemy (melee
// arc) | 'wave' every living enemy (donor's aoe:true convention, no range).
export const COMBO_TECHS = {
  rift_lance: {
    id: 'rift_lance', name: 'Rift Lance', type: 'dual',
    participants: ['kaida', 'vex'], statOf: { kaida: 'str', vex: 'int' },
    el: 'riftvoid', shape: 'single',
    power: 2.6, defMult: 0.5,
    gaugeCost: { kaida: 100, vex: 100 },
    mp: { kaida: 10, vex: 14 }, // = Kaida's chrono_strike cost + Vex's void_lance cost
    beats: { windup: 400, hit: 250, freeze: 350, recover: 600 }, // ms, total 1600
    log: (a, b, dmg, crit) => `${a} and ${b} fuse a Rift Lance${crit ? ' (CRIT)' : ''} for ${dmg}.`,
  },
  aegis_cleave: {
    id: 'aegis_cleave', name: 'Aegis Cleave', type: 'dual',
    participants: ['kaida', 'rune'], statOf: { kaida: 'str', rune: 'tec' },
    el: 'aegis', shape: 'cleave',
    power: 2.4, defMult: 0.65,
    gaugeCost: { kaida: 100, rune: 100 },
    mp: { kaida: 10, rune: 10 }, // = Kaida's chrono_strike cost + Rune's aegis_field cost
    shield: caster => Math.floor(caster.tec * 3), // reuses aegis_field's shield formula verbatim
    beats: { windup: 400, hit: 250, freeze: 350, recover: 600 },
    log: (a, b, dmg, crit) => `${a} cleaves behind ${b}'s Aegis${crit ? ' (CRIT)' : ''} for ${dmg} - party shielded.`,
  },
  null_ward: {
    id: 'null_ward', name: 'Null Ward', type: 'dual',
    participants: ['vex', 'rune'], statOf: { vex: 'int', rune: 'tec' },
    el: 'null', shape: 'wave',
    power: 2.2, defMult: 0.5,
    gaugeCost: { vex: 100, rune: 100 },
    mp: { vex: 14, rune: 10 }, // = Vex's void_lance cost + Rune's aegis_field cost
    shield: caster => Math.floor(caster.tec * 2),
    beats: { windup: 400, hit: 250, freeze: 350, recover: 600 },
    log: (a, b, dmg, crit) => `${a} and ${b} raise a Null Ward${crit ? ' (CRIT)' : ''} - ${dmg} to every foe, party shielded.`,
  },
  chronoforge_requiem: {
    id: 'chronoforge_requiem', name: 'Chronoforge Requiem', type: 'triple',
    participants: ['kaida', 'vex', 'rune'], statOf: { kaida: 'str', vex: 'int', rune: 'tec' },
    el: 'chronoforge', shape: 'wave',
    power: 1.8, defMult: 0.5,
    gaugeCost: { kaida: 100, vex: 100, rune: 100 },
    mp: { kaida: 14, vex: 18, rune: 16 }, // ~1.5x each hero's own solo tech cost - a real single-cast investment
    // ms, total 2000 - CONCEPT.md Target Feel: "a triple tech takes the
    // camera for two seconds and gives it back." This is the one combo
    // whose total duration is pinned to an explicit concept number.
    beats: { windup: 500, hit: 300, freeze: 450, recover: 750 },
    log: (dmg, crit) => `Kaida, Vex and Rune fuse the Chronoforge Requiem${crit ? ' (CRIT)' : ''} - ${dmg} to every foe.`,
  },
};

// --- self-check: `node docs/specs/combo-techs.mjs` ---
function selfCheck() {
  const failures = [];
  console.log('Combo         statSum(L1) dmg(def10) critChance(0crit) beats(ms) el         shape');
  for (const [id, c] of Object.entries(COMBO_TECHS)) {
    if (id !== c.id) failures.push(`key/id mismatch: ${id}`);
    if (!c.participants.every(p => HERO_IDS.includes(p))) failures.push(`${id}: unknown participant`);
    if (c.type === 'dual' && c.participants.length !== 2) failures.push(`${id}: dual must have exactly 2 participants`);
    if (c.type === 'triple' && c.participants.length !== 3) failures.push(`${id}: triple must have exactly 3 participants`);
    const total = Object.values(c.beats).reduce((a, b) => a + b, 0);
    if (total < 1500 || total > 3000) failures.push(`${id}: cinematic beats total ${total}ms, outside the 1.5-3s licensed cinematic window (CONTRACT.md SS"Camera")`);

    const statSum = comboStatSum(c);
    const dmg = comboDamage({ power: c.power, statSum, defMult: c.defMult }, 10);
    const crit = comboCritChance(0).toFixed(2);
    console.log(`${c.name.padEnd(22)} ${String(statSum).padEnd(11)} ${String(dmg).padEnd(10)} ${crit.padEnd(18)} ${String(total).padEnd(9)} ${c.el.padEnd(10)} ${c.shape}`);
  }

  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} issue(s):`);
    for (const f of failures) console.error(' - ' + f);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS - ${Object.keys(COMBO_TECHS).length} combos structurally valid, all cinematic beats in band.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) selfCheck();
