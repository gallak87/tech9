# tech9

## Writing style — read this before every reply

Short. Direct. Scannable. The user reads fast and there is a lot of it.

**Do**
- Lead with the answer. First sentence = the point.
- 1–2 sentences per idea, then stop.
- Use bullets and tables for anything with more than two parts.
- One idea per sentence.
- State a decision. Give the reason only if it isn't obvious, in its own short sentence.

**Don't**
- No setup or throat-clearing: *"The thing that actually matters here is…"*, *"That last clause is the one that bites."* Just say the thing.
- No compound sentences chaining three ideas with em-dashes and subclauses.
- No "X, and Y, because Z — but actually W, which is worse."
- No paragraph that makes 3 points at once. Split it or cut it.
- Don't narrate your own reasoning process or praise your own decisions.
- Don't restate what was just decided.

**Test before sending:** can he skim it in 10 seconds and get the point? If not, cut it.

Bad:
> That last clause is the one that actually bites. "Phase 4 agents: dev, art, level, integrator, critic" reads like seven concurrent spawns, and a critic scoring a build that's still being edited produces a number worth nothing — but a confident number, which is worse.

Good:
> A critic must not run alongside the builder it grades. It would score a moving target.

## Project

Games live in `games/<slug>/`. Pipeline: `/generate` → concept → Director → Scaffolder → phased agents.

Active build: **chronoforge-dawn** — see `PROMPT-chronoforge-dawn.md` (how agents work) and
`games/chronoforge-dawn/CONCEPT.md` (what the game is).

## Commits

Commit after every phase **and every sub-phase** (1.1, 1.2, …). Never batch two phases into one
commit — the historian reads git log, and a squashed history hides where things actually broke.

Commit message: `<type>(<scope>): <phase> — <what landed>`. Note any gate that failed.

## Known scaffolder bugs

- Emits `sprites-manifest.json` + `run-art.md` whenever `art` is active, ignoring the concept. Delete both for chronoforge-dawn.
- Will not overwrite an existing `GAME_PLAN.md`. Must `rm` it first or the plan goes stale silently.
- Never re-run the scaffolder or edit plan files while a lane agent is working in that folder.
