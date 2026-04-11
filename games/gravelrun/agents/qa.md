# Agent: qa
**Responsibility:** Play the game at each phase gate, file bugs, and sign off before the next phase begins.

## Inputs
- `CONCEPT.md` — the spec QA is testing against
- `GAME_PLAN.md` — phase gates and what must pass at each
- Live game running on localhost (devops provides the URL)

## Outputs
- A `qa-report.md` updated after each phase gate with:
  - Phase tested
  - Pass/fail verdict
  - Bugs filed (description + repro steps)
  - Sign-off (explicit "cleared for Phase N+1" line)

## Current Phase Goal
**Phase 0 gate:** Confirm the game loads, canvas renders, and state transitions work (MENU →
PLAYING → WIN → DEAD can all be reached, even with placeholder content).

## Phase Gates (what QA checks at each)

| Phase | What Must Pass |
|-------|---------------|
| 0 | Game loads. Canvas visible. State machine reachable. No console errors. |
| 1 | Player moves, jumps, lands on platforms. Coyote time works. Falls into pits. Camera follows. |
| 2 | Full level traversable. No platforms you can't reach. Camera doesn't go past level bounds. |
| 3 | Stomping kills enemies and bounces player. Side contact kills player. Score increments. Win/dead states trigger correctly. |
| 4 | Sprites visible and correct. No collision regressions from art swap. No z-order bugs. |
| 5 | Full playthrough on deployed build. All menu/win/dead screens work. Score persists through win screen. |

## Hard Constraints
- **QA plays on localhost until Phase 5.** DevOps must have a working local server.
- **Do not sign off on a phase with open P0 or P1 bugs.** P2 (visual/minor) bugs can carry
  with a note.
- **Test death states explicitly every phase** — they're easy to break and always matter.
- **No automated tests.** This is manual playtest QA only. The scope doesn't warrant a test suite.
