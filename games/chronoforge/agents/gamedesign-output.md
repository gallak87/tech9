# Game Design Spec — Chronoforge

Authoritative source for mechanics, balance, and progression. Consumed by dev, level, art, audio.

---

## 1. Heroes (fixed party of 3)

| id | name | class | weapon | stat focus | role |
|----|------|-------|--------|-----------|------|
| `kaida` | Kaida Vale | Striker | pulse-blade | STR / HP | melee burst, crit-heavy |
| `vex` | Vex Noctra | Mystic | chrono-staff | INT / MP | ranged AoE, DoT, buff/debuff |
| `rune` | Rune Orbital | Engineer | forge-hammer + drones | TEC / DEF | support, shields, summons |

**Hero stats:** `HP, MP, STR, INT, TEC, DEF, SPD, CRIT`

**Level curve:** XP needed at level N = `50 * N^1.5`. Cap at **level 15** for v1.
- Per level up: `+8% HP, +6% MP, +1 to primary stat, +0.5 to secondaries, +1 skill point`.

**Skill tree (per hero):** 12 nodes, 3 branches of 4 nodes each.
- Branch A — **Offense:** damage up, crit up, new tech unlocked at node 4.
- Branch B — **Defense/Utility:** HP/DEF up, status resist, revive-on-death unlocked at node 4.
- Branch C — **Tech Synergy:** MP efficiency, combo access, 3rd dual-tech partner unlocked at node 4.

---

## 2. ATB Battle System

**Gauge:** 0→100. Fills at rate `SPD / 100` per frame (60fps).

**Actions when gauge ≥ 100:**
- **Basic Attack** — free, costs full gauge
- **Tech** — costs MP, costs full gauge
- **Dual-Tech** — requires 2 heroes at 100; consumes both gauges + MP from both
- **Triple-Tech** — requires all 3 at 100; consumes all + heavy MP
- **Item** — free, costs full gauge

**Damage formula (basic attack):**
```
dmg = (atk.STR * 1.5 - tgt.DEF * 0.8) * rand(0.9, 1.1)
crit: 5% base + CRIT stat; crit_dmg = dmg * 1.8, triggers 250ms time-freeze + screen-shake
```

**Damage formula (tech):**
```
dmg = (tech.power + atk.stat * tech.coefficient - tgt.DEF * 0.5) * elementMult
```

**Status effects:** `stun, burn, freeze, poison, shield, regen, haste, slow` — 3-turn default duration.

**Element wheel:** `Fire > Ice > Void > Fire` (1.5× multiplier on advantage, 0.75× on disadvantage). Neutral elements: `Physical, Tech`.

### Techs (v1 roster — 3 per hero)

| hero | tech | cost | type | effect |
|------|------|------|------|--------|
| Kaida | Rift Cleave | 8 MP | Phys AoE | 3-target cleave, `STR*2.0 - DEF*0.5` |
| Kaida | Chrono Lunge | 12 MP | Phys single | high crit (20%), `STR*2.5` |
| Kaida | Blade Storm | 20 MP | Phys AoE | all enemies, `STR*1.6` × 2 hits |
| Vex | Time Splinter | 10 MP | Void DoT | stacking bleed, 3 turns |
| Vex | Gravity Well | 14 MP | Ice AoE | slow + `INT*1.8` |
| Vex | Void Lance | 18 MP | Void single | pierce DEF, `INT*2.3` |
| Rune | Aegis Field | 10 MP | Support | team shield (absorbs 30% of TEC × 3 HP) |
| Rune | Drone Salvo | 12 MP | Tech ranged | 3 drones, `TEC*1.4` each, random targets |
| Rune | Overcharge | 16 MP | Support | party +25% SPD for 3 turns |

### Dual-Techs (3, one per pair)

| pair | name | cost | effect |
|------|------|------|--------|
| Kaida + Vex | **Chronoslash** | 20 MP each | time-freeze, 4 hits, `(STR + INT) * 1.8` |
| Kaida + Rune | **Hammerfall Pulse** | 18 MP each | smash + shockwave AoE, `(STR + TEC) * 1.6` + stun |
| Vex + Rune | **Voidshard Field** | 22 MP each | 3-tile mark then detonate, `(INT + TEC) * 2.0` |

### Triple-Tech (1)

| name | cost | effect |
|------|------|--------|
| **Aeon Sunder** | 30 MP all | unlocks at Transcendent tier. All-enemy wipe, `(STR+INT+TEC) * 2.5` + full-screen scripted cinematic |

---

## 3. Economy & Base

**Resources:** `Food, Ore, Energy, Renown, Skill Points`
- Food: consumed by inn-heal and barracks training
- Ore: consumed by forge (gear crafting) and building upgrades
- Energy: required at Tier 2+ structures/upgrades
- Renown: gates tech tier advancement (from quests + city liberation)
- Skill Points: from leveling, spent in skill trees

**Resource tick:** every 5 real-time seconds while in overworld OR base view.

### Buildings

| id | name | tier 1 cost | tier 1 yield / tick | upgrade path |
|----|------|-------------|---------------------|--------------|
| `town_center` | Town Center | free (start) | — | HP / population cap |
| `farm` | Farm | 20 ore | +2 food | +2/+3/+5 food per tier |
| `mine` | Mine | 30 ore | +1 ore | +1/+2/+3/+4 ore per tier |
| `energy_extractor` | Energy Extractor | 50 ore + Reclaimer tier | +1 energy (T2 only) | +1/+2/+3 energy (T2/T3/T4) |
| `barracks` | Barracks | 40 ore, 20 food | — (trains units) | unlock hero unit cap |
| `forge` | Forge | 60 ore + Ascendant tier | — (crafts gear) | unlock gear tier T2/T3/T4 |
| `research_lab` | Research Lab | 80 ore, 30 energy + Ascendant | — (research unlocks) | unlocks new techs/passives |
| `wall` | Wall | 20 ore | +passive DEF buff to base | raid mitigation (scripted raids only) |

### Tech Tiers

| tier | unlock threshold | visual upgrade | gameplay unlocks |
|------|-----------------|----------------|------------------|
| **Survivor** | start | wood/scrap shacks | Town Center, Farm, Mine |
| **Reclaimer** | 100 Renown + 50 Ore spent | scavenged metal | Energy Extractor, Barracks, 2nd tech slot per hero |
| **Ascendant** | 300 Renown + Research Lab built | polished alloy + neon trim | Forge, Research Lab, Wall, dual-techs unlocked |
| **Transcendent** | 800 Renown + "Broken Crown" quest complete | full neon sci-fi | Aeon Sunder triple-tech, T4 gear, endgame |

---

## 4. Gear

**Slots per hero:** weapon / armor / accessory.

**Gear tiers:** T1 (Survivor) → T2 (Reclaimer) → T3 (Ascendant) → T4 (Transcendent).

Each gear piece has: `tier, stat_rolls (2-4 random stat bonuses), elem_affinity (optional)`.

**Stat diff preview** on hover/select: every affected stat shows `+X` or `-X` in green/red before the swap is confirmed.

---

## 5. Enemies (v1)

| id | name | role | signature |
|----|------|------|-----------|
| `rust_scrapper` | Rust Scrapper | melee grunt | rusty cleave |
| `drone_sentinel` | Drone Sentinel | flying ranged | seeker missile |
| `mutant_hound` | Mutant Hound | pack runner | pounce |
| `gravbot` | Grav-Bot | heavy tank | shield slam |
| `neon_cultist` | Neon Cultist | caster | buff ally / curse party |
| `sandworm_hatchling` | Sandworm Hatchling | dodge evader | burrow strike |
| `wraith_core` | Wraith-Core | teleporter | phase-hit |
| `architect_herald` | Architect Herald | mini-boss | scripted phase fight |
| `void_architect` | Void Architect | final boss | 3-phase encounter (Phase 6 gated) |

**Enemy scaling:** `HP = base * (1 + zone_tier * 0.4)`, stats scale similarly. Drops scale to zone tier.

---

## 6. Win / Lose

- **Lose:** party wipe (all 3 heroes at 0 HP for >2s) → reload from last **city rest** checkpoint. No permadeath.
- **Win:** reach Transcendent tier, clear "Broken Crown" quest, defeat Void Architect in final scripted battle.

---

## 7. Scoring

- **Civilization Power Index** = `sum(building_levels) + (tech_tier * 100) + (avg_hero_level * 10)`
- **Renown** = quest completion + cities liberated (separate from Power Index, gates tier advancement)

---

## 8. Data schema contracts (for dev)

```ts
Hero { id, name, class, level, xp, stats{HP,MP,STR,INT,TEC,DEF,SPD,CRIT},
       hp, mp, gauge, equipped{weapon,armor,accessory}, skillPoints, tree[] }

Enemy { id, name, stats, hp, gauge, element, loot[] }

Tech { id, owner, name, cost_mp, type, power, coefficient, element, target }

Building { id, type, tier, x, y, yields[], upgradeCost[], workers }

Resources { food, ore, energy, renown, skillPoints }

SaveState { version, heroes[], inventory[], world{visited[], fog[]}, base{buildings[]}, resources, tier, questLog[] }
```

---

## 9. Deferred / later-phase tuning

- Exact yield curves, upgrade cost curves, enemy HP numbers — tune in Phase 4-5 balance passes
- Skill-tree node wording and exact numbers — Phase 5
- Void Architect 3-phase script — Phase 6
