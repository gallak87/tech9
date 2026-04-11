# tech9 — Roadmap

## Where we are

The pipeline works as a manual simulation. `/generate` proves the design:
a concept doc feeds a director, a director selects and scopes agents, agents build the game.

Snake shipped. The proof of concept is done.

What we have is Claude-as-the-generator — the pipeline runs inside inference, not in code.
It works, but it's not repeatable or autonomous. Every run is whatever Claude decides that day.

---

## What "productionalizing" means

**Now:**
```
/generate "snake" → Claude reads skill prompt → Claude writes files by hand
```

**Goal:**
```
/generate "snake" → Concept Generator agent runs → structured CONCEPT.md output
                  → Director agent runs → structured team config output
                  → scaffolder code reads config → generates file structure
                  → agents are spawned with generated prompts → they do the work
```

The difference is repeatability and autonomy. Logic in code, not in inference.

---

## Phase 1 — Formalize the Vocabulary

Right now role definitions are prose markdown. They need to become structured definitions
that code can read and act on.

- [ ] Define a role schema (JSON or YAML): name, responsibility, inputs, outputs, dependencies, merge rules
- [ ] Convert all 10 vocabulary roles to that schema
- [ ] Define the `CONCEPT.md` schema — what fields are required, what's optional
- [ ] Define the `GAME_PLAN.md` schema — team config, phase plan, deferred decisions
- [ ] Define the agent stub schema — what every generated agent file must contain

Output: a `vocab/` directory with structured role definitions and schemas the Director can consume.

---

## Phase 2 — Build the Meta Agents as Code

Replace the manual simulation with actual logic.

### Concept Generator
- [ ] Structured prompt that outputs a valid `CONCEPT.md` (enforced schema)
- [ ] Validation step — reject/retry if required fields are missing or vague

### Director
- [ ] Reads `CONCEPT.md`, outputs a team config (structured, not prose)
- [ ] Team config drives scaffolding — deterministic file generation from config
- [ ] Merge/split logic is explicit rules, not implicit inference
- [ ] Vocabulary expansion flow: propose → human approval → write back to vocab

### Scaffolder
- [ ] Code (not Claude) that reads the Director's team config and generates:
  - `GAME_PLAN.md`
  - `agents/[role].md` stubs (from vocab templates + concept context)
  - `src/` skeleton (from devops agent)
- [ ] Idempotent — safe to re-run if the concept or team config changes

---

## Phase 3 — Prove it Scales

Run the full automated pipeline on a second game. Harder than snake.
The goal is to find where the structured output breaks down and fix the schemas.

- [ ] Pick a game with more complexity (needs level designer, asset artist, etc.)
- [ ] Run pipeline end-to-end with minimal human intervention
- [ ] Identify which agents produced bad output and why
- [ ] Iterate on role definitions and Director logic
- [ ] Ship the second game

---

## What doesn't change

- The vocabulary (roles, responsibilities, merge rules) — already solid
- The localhost-first devops pattern — baked in
- The QA-after-every-dev-session rule — non-negotiable
- The clean separation between tech9 (factory) and game repos (products)
