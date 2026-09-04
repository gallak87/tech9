# gamedesign — Phase 1.1 output

Systems spec: dual/triple techs, inventory, shop/forge call, tech-gate curve.
Runnable artifacts ship alongside this doc under `docs/specs/`:

| File | What it is | Run it |
|---|---|---|
| `docs/specs/combo-techs.mjs` | Combo table, damage/crit formulas, ATB math, trigger rule | `node docs/specs/combo-techs.mjs` |
| `docs/specs/inventory.mjs` | 17-item catalog, drop tables, world drops, sell price, stat-diff | `node docs/specs/inventory.mjs` |
| `docs/specs/tech-gates.mjs` | Region graph, edge gate table, reachability self-check | `node docs/specs/tech-gates.mjs` |

All three exit 0 and print PASS as of this writing (see report at the end).
Evidence read before writing this: `docs/PROTO-REF.md`, all ten frames in
`shots/proto-ref/`, and the donor source `games/chronoforge/src/{battle,progression,world,base}.js`.

---

## 1. Dual and triple tech spec

The prototype has combo **framing** only — `battle.js` carries `comboFlash`/
`comboText` and fires them from `flashPortrait()` on every solo support or
AoE tech. There is no combo **mechanic**: no pairing, no combined cost, no
formula. This section designs it from scratch, grounded in the real ATB math.

### 1.1 Why the trigger needs a rule change, not just numbers

`battle.js updateBattle()`'s turn arbiter is:

```js
const readyHero = b.heroes.findIndex(h => h.hp > 0 && h.atb >= 100);
if (readyHero !== -1) { b.menu = { heroIdx: readyHero, ... }; return; }
```

This always force-opens the **lowest-index** ready hero's menu. `Escape`
just sets `b.menu = null`; next tick the same `findIndex` picks the same
hero again, because nothing changed. There is no way today to bank one
ready hero's turn while acting with another — "two heroes ready at once" is
a rare coincidence of fill timing, not something the player can set up.
Dual techs need real banking to be reachable by play instead of by luck.

**Proposed arbiter extension** (battle module territory — flagged as a
proposal per the "agents propose" scope rule, not applied by this doc):

- A 4th root menu option, **Wait**, beside Attack / Tech / Defend. Selecting
  it sets `hero.waiting = true` and returns control to the sim tick. ATB
  already doesn't decay once at 100 in the donor code, so waiting costs
  nothing but the wait itself.
- Arbiter becomes `findIndex(h => h.hp>0 && h.atb>=100 && !h.waiting)` —
  skips waiting heroes so a *different* ready hero's menu can open next.
- Whenever a hero's menu opens (waiting or not) and ≥1 **other** hero is
  ready/waiting, a **Combo** root option appears, listing every entry in
  `COMBO_TECHS` whose `participants` is a subset of "this hero + every
  other ready/waiting hero." Picking one spends every participant's turn
  and MP at once — no further per-partner confirmation, since being
  ready/waiting already proved willingness to spend the turn.

Full rule and rationale: `docs/specs/combo-techs.mjs` `COMBO_TRIGGER`.

### 1.2 Feasibility against the real ATB math

Fill time to 100 from 0, `100/(spd/59)*16.67ms` (heroes), at level-1 base SPD:

| Hero | SPD | Fill time |
|---|---|---|
| Kaida | 14 | ~7.0 s |
| Vex | 12 | ~8.2 s |
| Rune | 10 | ~9.8 s |

Kaida is reliably first-ready. Banking her (Wait) while Vex catches up costs
~1.2 s of real fight time; waiting for Rune too (triple) costs up to ~2.8 s
past Kaida's ready point, worst case ~9.8 s from a synced start. That's the
same order of magnitude as one enemy turn interleaved in between — a real
tactical choice (bank vs. act now), not a multi-fight grind. Numbers:
`docs/specs/combo-techs.mjs` `fillTimeMs()`.

### 1.3 The four combos

Damage extends the solo tech formula (`techHit()` in `battle.js`:
`power*stat + stat*0.5 - def*0.5`) to a **stat sum** across participants,
so it reads as the same formula family, not a bespoke system:

```
dmg = power * statSum + statSum * 0.5 - target.def * defMult
```

| Combo | Participants | Stats | El | Shape | Power | defMult | dmg @ L1, def10 |
|---|---|---|---|---|---|---|---|
| Rift Lance | Kaida + Vex | str+int | riftvoid | single | 2.6 | 0.5 | 107 |
| Aegis Cleave | Kaida + Rune | str+tec | aegis | cleave | 2.4 | 0.65 | 92 |
| Null Ward | Vex + Rune | int+tec | null | wave (all enemies) | 2.2 | 0.5 | 87/enemy |
| Chronoforge Requiem | Kaida+Vex+Rune | str+int+tec | chronoforge | wave (all enemies) | 1.8 | 0.5 | 115/enemy |

Compare to Kaida's solo ultimate `time_sever` (power 4.5, str only):
85 dmg at def10. Rift Lance beats it by +26% for double the MP and two
banked turns — a real payoff for the setup cost, not a strictly-better
button.

- **Gauge cost**: 100% of ATB per participant, all reset to 0 on cast. No
  partial-gauge combos in v1.
- **MP cost**: drawn from each hero's *own* pool at close to their own
  component tech's cost (no new shared-MP resource) — e.g. Rift Lance costs
  Kaida 10 MP (her `chrono_strike` cost) and Vex 14 MP (her `void_lance`
  cost) independently. Chronoforge Requiem costs each hero ~1.5× their solo
  tech cost, a real single-cast investment (14/40, 18/80, 16/50 MP against
  each hero's max).
- **Crit**: reuses `techHit`'s `0.10 + crit/100` shape plus a flat **+0.05**
  spectacle bonus (`COMBO_CRIT_BONUS`) — a stated deviation: combos already
  ask for a banked turn and 2× MP, so they should read as *more* likely to
  pop, not just hit harder.
- **Shield combos** (Aegis Cleave, Null Ward) reuse `aegis_field`'s exact
  shield formula, `Math.floor(caster.tec * 3)`, verbatim — Aegis Cleave at
  full weight (×3), Null Ward at half (×2) since its primary payload is the
  AoE nuke.
- **New elements** (`riftvoid`, `aegis`, `null`, `chronoforge`) need
  `EL_VFX`/`VFX_SPRITE` entries in the ported battle module — flagged for
  `fx`, not resolved here.

### 1.4 Cinematic beats

CONTRACT.md licenses a combo finisher a **2–3 s** `beginCinematic()` /
`endCinematic()` window. CONCEPT.md's Target Feel is more specific about the
triple: *"a triple tech takes the camera for two seconds and gives it
back."* Duals get a shorter, uniform beat sheet; the triple is pinned to
that 2000 ms line exactly.

| Beat | Dual (all 3) | Triple |
|---|---|---|
| wind-up | 400 ms | 500 ms |
| hit | 250 ms | 300 ms |
| freeze | 350 ms | 450 ms |
| recover | 600 ms | 750 ms |
| **total** | **1600 ms** | **2000 ms** |

Freeze here (350/450 ms) is deliberately longer than a solo crit's
time-freeze — **325 ms**, ported from `battle.js` (`b.timeFreeze = 325`).
Note: CONCEPT.md's Core Loop paragraph says "250 ms"; the actual source
value is 325 ms. Source wins per the task's stated priority — **325 ms is
the ported number**, 250 ms in CONCEPT.md is a rounding drift worth a word
to whoever edits that doc next, not a defect to fix here.

---

## 2. Inventory spec

17 items (`games/chronoforge/src/progression.js` `ITEM_DEFS`), 3 slots
(weapon/armor/accessory), 8 stats (str/int/tec/def/spd/crit/hp/mp). Full
catalog with `source` tags: `docs/specs/inventory.mjs`.

### 2.1 Acquisition — three paths, all ported

- **Starting kit** (5 items): `iron_blade`, `void_shard`, `rune_gauntlet`,
  `scrap_vest`, `data_chip` — ported verbatim from `initInventory()`.
- **Enemy drop tables** (17 enemies → chance-rolled items, tier bonus
  `1 + (tier-1)*0.15`) — ported verbatim from `ENEMY_TEMPLATES[*].drops`
  and `endBattle()`'s tier multiplier, **plus two new entries** (§2.2).
- **World drops**, one per outdoor region (8 total) — ported verbatim from
  `MAPS[*].worldDrop`. Every world-drop item is also a drop-table item; no
  region's world drop is exclusive to that path.

### 2.2 Deviation: two items were unreachable in the donor

`bio_weave` and `crit_lens` exist in `ITEM_DEFS` but appear in **none** of
the three acquisition paths in the donor — not the starting kit, not any
`ENEMY_TEMPLATES` drop entry, not any `worldDrop`. Confirmed by grep across
`battle.js`/`world.js`/`progression.js`: zero hits outside the catalog
definition itself. This isn't a stylistic call — Phase 8's own QA gate
requires `census.mjs` to confirm **all 17 items** reachable via a drop
table, a world drop, or the starting kit, so shipping this gap forward
would fail Dawn's own bar.

**Fix**: added as secondary drops on two currently single-drop enemies —
`bio_weave` on Drone Sentinel (T1, 6%), `crit_lens` on Glacier Wolf (T2,
6%). Both are early/mid-tier enemies so neither item becomes a late-game
bottleneck. See `ENEMY_DROP_TABLE` in `docs/specs/inventory.mjs`.

### 2.3 Stat-diff preview rule

Preview = `computeStats(heroWithCandidateEquipped) − computeStats(hero)`,
per stat, using `computeStats()` **unchanged** from `progression.js`. The
preview and the real equip run the *same* function — there is no parallel
"preview math" that can drift from what equipping actually does. Only
non-zero deltas render (`docs/specs/inventory.mjs` `statDiff()`), color-coded
green/red per the existing HP/MP/XP bar convention already in the Party tab.

### 2.4 Weapon sockets are mandatory, not decorative

All 8 weapon-slot items need a **distinct mesh** on the rig's named weapon
socket — this is a hard constraint (`gamedesign.md`, CONCEPT.md), not a
nice-to-have, because it's the only way a sword swap reads in world, battle,
*and* portrait simultaneously without a separate portrait-art pass (there is
none — portraits are rig renders per the art brief). `docs/specs/inventory.mjs`
`WEAPON_ITEMS` hands art/dev the 8 ids with their ported `color` field as
the intended material-tint hint (e.g. `void_scepter` `#c77bff`, `magma_blade`
`#ff4a2c`) — a real donor signal, not invented palette.

---

## 3. Shop / forge decision

**Decision: sell-only exchange in v1. No buy-shop. No forge crafting.**

The donor has neither — no shop UI/data anywhere, and `base.js`'s `forge`
building is a settlement structure (`tierGate: 'Ascendant'`, no `yields`,
blurb *"Crafts gear. Unlocks higher gear tiers"*) with **zero** crafting
code behind it. Both are genuinely additive: nothing tuned to inherit,
CONCEPT.md's Known Unknowns table names this explicitly as mine to decide.

**Why sell-only, not full buy/craft:**

1. Reachability is already solved without a shop. Phase 8's `census.mjs`
   gate (all 17 items via drop table / world drop / starting kit) is
   satisfied by §2 alone — a shop is not load-bearing for content access.
2. A buy-anything shop would sell the same items the 8 hidden world drops
   exist to make *discoveries*. Trivializing that with a gold-sink vendor
   undercuts a system CONCEPT.md explicitly calls out ("diegetic events...
   not a silent inventory increment").
3. Forge crafting has zero tuned baseline — 17 recipes would be invented
   from nothing, in scope nobody asked for, competing with the world-drop
   path for the same items.
4. There's a real problem sell-only *does* solve: drop rolls duplicate (no
   stacking model — inventory is a flat array of `{id}`), so duplicate/junk
   drops need somewhere to go. Selling for ore also feeds back into the
   settlement economy CONCEPT.md cares about, reinforcing the loop this
   phase's tech-gate curve is already built around.

**Sell price** (no donor baseline; new formula): `5 + statPoints × 3` ore,
where `statPoints` sums the absolute value of every stat the item grants.
Modest relative to the economy — a common early drop nets ~15–25 ore
(mine yields 1-4/tick, a T2 building costs 60-160), a rare tier-5 drop
(`titan_shard`, 191 ore) is worth real money without becoming the ore
faucet's main source; that stays the mine/farm/extractor tick.

Forge crafting is **punted to a cool-to-have backlog item**, same
treatment CONCEPT.md already gives chrono-rifts — not designed against,
not blocked, just not v1.

---

## 4. Tech-gate curve

Full table + self-check: `docs/specs/tech-gates.mjs`.

### 4.1 The graph this applies to

Ported from `world.js`: 8 outdoor regions, 7 bidirectional edges, zero
cycles, Emberline as the hub (4 of the 7 edges touch it). `level` owns final
edge placement in Phase 1.2/1.3 and is licensed to redesign this topology —
what follows is the **gate-assignment rule**, reapplicable to a new edge set
if `level` changes it, not just a one-off table.

### 4.2 The rule

1. **Gate entry edges into a new combat-difficulty tier, not lateral edges
   within one already reached.** Each region carries a donor `tier` field
   (1–4, combat difficulty). Gate the edge that *first* reaches a higher
   tier; leave same-tier lateral edges and edges already gated upstream
   (transitively reachable only through a gated edge) ungated. Stacking
   redundant gates on both a hub edge and its branches only adds confusion,
   not safety.
2. **The starting web (Haventide + everything directly T1/T2-adjacent to
   it) is always open.** A brand-new player must never face a settlement
   check before they've had a chance to earn any renown at all.
3. **Transcendent gates no edge.** CONCEPT.md: the player *wins* at
   Transcendent (+ the Void Architect fight) — it's the terminal tier, not
   a mid-game unlock checkpoint. Using it as an edge gate would make that
   edge unreachable until the game is basically over. Its only role here is
   the "everything open both ways" invariant at max tier.
4. **The inherited Emberline(T2)→Crater Ember(T4) two-tier jump is gated at
   the SAME tier as the "proper" T3→T4 route (Orbital Reach→Last Crown),
   not higher.** Per CONTRACT.md this edge should become *"the hard way in,
   not a wall."* Same tier means both open together at Ascendant: a player
   who rushes settlement tech without clearing Orbital Reach/Frost Canyon
   first can dive into Crater Ember under-leveled for its T4 mobs — that's
   the intended risk, not an extra progression wall on top of it.

### 4.3 The table

| Edge | Gate | Why |
|---|---|---|
| Haventide ↔ Emberline | Survivor | tutorial-adjacent, always open |
| Emberline ↔ Forest Veil | Survivor | lateral T2, starting web |
| Forest Veil ↔ Mire Bog | Survivor | lateral T2, starting web |
| Emberline ↔ Orbital Reach | **Reclaimer** | first T2→T3 step |
| Orbital Reach ↔ Frost Canyon | Survivor | lateral T3, transitively gated via the edge above |
| Orbital Reach ↔ Last Crown | **Ascendant** | T3→T4, the story route |
| Emberline ↔ Crater Ember | **Ascendant** | T3→T4, "the hard way in" — same tier as above, on purpose |

### 4.4 Checked against the renown/XP curve

Reclaimer needs **100 renown**; combat-only renown from clearing every
region reachable at Survivor (Haventide 13 + Emberline 28 + Forest Veil 22
+ Mire Bog 36) is **99** — one point short, closed by a single ungated
Town Center T2 upgrade (+40 renown, 120 ore/40 food, buildable turn one).
Reclaimer becomes reachable almost *exactly* at "cleared the starting web,"
never later — no stranding.

Character level tracks the same milestone: clearing those four regions
awards **1011 XP** per hero (every hero gets full battle XP, not split —
`awardXp()`), which lands a level-1 hero at **level 5** against `xpNext *=
1.55` growth. Orbital Reach and Frost Canyon are donor-tagged T3 — a level-5
party stepping into T3 content the moment Reclaimer opens is in-band, not
under-leveled.

**Donor bug found and fixed in this pass, not ported**: `base.js`'s
`research_lab` gates its own **tier-1** build behind `'Ascendant'`
(`tierGate: [null, 'Ascendant', ...]`), but `Ascendant`'s own requirement is
`researchBuilt: true` — a circular lock that makes Ascendant literally
unreachable in the donor as written. Not fixed *in* this doc (it's `base.js`
territory, ported forward into `settlement/` in Phase 9), but flagged here
because it directly touches this section's gate math: I'm treating
`research_lab` tier-1 as buildable from Survivor (like `town_center`/
`farm`/`mine`) when Phase 9 lands, and the settlement lane should carry
that fix forward rather than re-port the circular version.

### 4.5 Self-check output

```
$ node docs/specs/tech-gates.mjs
Reachability by settlement tier:
  Survivor     4/8  [emberline_region, forest_veil_region, haventide_region, mire_bog_region]
  Reclaimer    6/8  [+ frost_canyon_region, orbital_reach_region]
  Ascendant    8/8  [+ crater_ember_region, last_crown_region]
  Transcendent 8/8  [unchanged — invariant satisfied]

PASS - all 8 regions reachable, all 7 edges open by Transcendent.
```

---

## 5. Deviations from the donor — consolidated

| # | Donor number/behavior | Dawn value | Reason |
|---|---|---|---|
| 1 | No combo mechanic exists | New: 4 combos, formulas in §1 | Nothing tuned to port; net-new per CONCEPT.md Known Unknowns |
| 2 | Solo tech crit base 0.10 | Combo crit base 0.15 (+0.05) | Spectacle payoff for a banked-turn, 2×MP action |
| 3 | CONCEPT.md says crit freeze "250 ms" | Ported source value is 325 ms (`battle.js` `b.timeFreeze=325`) | Source of truth wins per task priority; CONCEPT.md text is rounding drift, not a defect |
| 4 | `bio_weave`/`crit_lens` unreachable (no starting kit/drop/world-drop entry) | Added as 6% secondary drops on Drone Sentinel / Glacier Wolf | Phase 8 census.mjs requires all 17 items reachable |
| 5 | No shop, forge unimplemented | Sell-only exchange, no buy, no crafting | See §3 — full reasoning there |
| 6 | Doorway edges ungated (tree, no gate data) | 7-edge gate table, §4 | CONCEPT.md/CONTRACT.md DECIDED tech-gating; this is the first authoring of it |
| 7 | `research_lab` tier-1 gated at Ascendant (circular w/ Ascendant's own `researchBuilt` requirement) | Treat tier-1 as ungated (Survivor) when ported to `settlement/` in Phase 9 | Donor bug — as written, Ascendant is unreachable |
| 8 | battle.js turn arbiter always force-opens lowest-index ready hero, no bank | Proposed `Wait` root option + skip-waiting arbiter (§1.1) | Required for combos to be reachable by play, not luck — flagged as a proposal for `battle` to implement |

---

## 6. Human QA pass — recommended before Phase 1.2 starts

**Worth a look, not a blocker**: nothing here is buildable yet (Phase 1.1 is
markdown + data, no `src/` changes), so there's no localhost build to click
through. What's worth eyeballing before `level` builds on top of §4:

- **The tech-gate table itself** (§4.3) — specifically whether gating
  Crater Ember at *Ascendant* (same tier as Last Crown) reads as intended
  ("hard way in") rather than as a mistake ("shouldn't the two-tier jump be
  gated *higher* than the proper route?"). This is a genuine judgment call
  I made explicit rather than silently encoded — worth a nod before `level`
  treats it as settled.
- **The combo trigger proposal** (§1.1) — it changes `battle` module
  behavior (a new `Wait` action, a changed turn arbiter) beyond pure data.
  If the human wants combos reachable a *different* way (e.g. a global
  hotkey instead of a per-hero menu option), better to redirect now than
  after `battle` implements it in Phase 7.

Nothing else here has a build to fail against yet — the three `docs/specs/`
modules are the check, and all three exit 0 (see run output above).
