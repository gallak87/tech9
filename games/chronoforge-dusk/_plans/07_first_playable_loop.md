# 07 — First complete playable loop

**Type:** implementation milestone, sized from the accepted design. **Status:** future; not ready to execute yet.

**Requires:** 03's usable Kaida handoff, [06's playable environment](06_environment_and_traversal.md), and 05's owner-agreed story/first-region design. Confirm repeatable handoffs for the assets this loop needs using evidence from 06 or a separately assigned portion of 04; a standalone 04 exercise is not mandatory.

**Read:** [AGENTS.md](../AGENTS.md), the `STORY.md` and `GAME_DESIGN.md` produced by 05, relevant [validation](../VALIDATION.md), and the existing Dusk runtime. Refer to original content only where the accepted design calls for it.

## Outcome

One small but complete Chronoforge session:

1. Leave an inhabited home area and explore a readable route with a useful optional discovery.
2. Meet a visible enemy and transition into a battle whose setting belongs to the encounter location.
3. Make a meaningful ATB decision, win, and receive an understandable reward.
4. Equip an improvement or unlock a skill that affects the next encounter.
5. Return home and spend recovered resources on a visible, practical settlement improvement.
6. Save, resume, lose a fight, and retry without corrupting progression.

Connect this loop before deepening systems. A short, functioning sequence matters more than a wide collection of isolated modules.

## Work to size from the design

- Build on 06's tested coastal environment and traversal. Adapt the route only where the accepted design needs it, adding interactions, a visible encounter, and a useful discovery.
- Implement the agreed ATB behavior around the existing action presentation: speed-based gauges, comfortable command selection, attack, defense, one useful technique, target reaction, victory, and defeat/retry. Preserve the prototype's appealing staging without transplanting its actor runtime.
- Connect rewards, XP, an equipment/skill improvement, and a resource-funded home upgrade. Ensure the player can perceive their effects.
- Introduce player-facing HUD, pause/back, essential menus, save/load, and settings only as the loop needs them. Keep development tools separate from the player-facing flow.
- Implement the accepted opening story beats and a payoff using interactions and short crew moments. Do not substitute newly invented campaign lore during implementation.
- Add the first enemy and any additional scenery needed by the agreed loop through the proven asset route. Reuse 06's Dusk environment kit and preserve its collision, camera readability, and performance.

Asset work can deliver Vex, Rune, enemies, and props concurrently against the established handoff. Any temporary actors needed for logic must be identified; placeholders cannot establish final crew visuals or combination quality.

## Boundaries and original identity

Preserve the original crew and hopeful post-collapse setting: neon city-states, ruins, alien wilderness, and rebuilding. The original assets establish visual style; make polished new assets that belong together. Planned skill descriptions and old numerical balance are not proof that those mechanics work.

Do not force all four civilization tiers or the Void Architect's final confrontation into the opening loop. Do not fill every inventory/menu category with stubs. Do not build all regions in parallel.

## Done and next

A native playthrough demonstrates the full loop through real controls and earned resources. The owner can see how exploration, battle, crew growth, and settlement improvement connect. Save/load and retry are exercised; remaining placeholders and shortcomings are explicit.

Before assigning this milestone, split it into smaller tasks if the design makes it too broad for one useful implementation pass. Finish the region through [08](08_finish_first_region.md) rather than declaring the whole game complete here. Completing 06's environment does not complete this milestone.
