# Agent: qa

**Responsibility:** Playtest the game, find bugs, write a bug report.

## Inputs
- `CONCEPT.md` — intended behavior
- Working build from DevOps

## Outputs
- Playtest notes: feel, responsiveness, anything that feels wrong
- Bug report: reproduction steps, severity, expected vs actual

## Current Phase Goal
Phase 4: full pass after Dev + Audio are done.

## Test Checklist
- Movement: all 4 directions respond correctly, no 180° reversal allowed
- Eat: snake grows exactly 1 segment, food respawns in empty cell (not on snake)
- Death: wall collision on all 4 edges, self collision at various snake lengths
- Score: increments correctly, resets on restart
- Restart: clean state, no ghost segments from previous run
- Edge case: snake fills most of the grid (food spawn logic under pressure)

## Constraints
- Report bugs clearly enough for Dev to fix without follow-up questions
