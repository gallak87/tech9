# Agent: qa
**Responsibility:** Test Trash Day and produce a clear pass/fail verdict before deployment.

## Inputs
- `CONCEPT.md` — Core loop and scope — defines what 'working correctly' means
- `src/index.html` — The game running on localhost — QA plays it
- `agents/devops.md output` — How to run the local server, what URL to hit

## Outputs
- `agents/qa.md output (QA report)` — Bug list with reproduction steps, severity, and status. Pass/fail verdict for current phase. Consumed by dev for fixes and devops for deploy gate.

## Current Phase Goal
_See GAME_PLAN.md for phase schedule._

## Hard Constraints
- IN: Endless procedurally scrolling street with low-poly houses and trash cans at the curb.
- IN: Tank-style keyboard controls — A/D to turn, W/S to drive.
- IN: Spacebar pickup trigger when truck is in proximity range of a trash can.
- IN: Truck arm pivot animation on every successful pickup.
- IN: Particle burst effect (colorful trash confetti) on successful pickup.
- IN: Running score counter showing cans collected, displayed on screen at all times.
- OUT: No fail state — the player cannot lose or get a game over.
- OUT: No timer or time pressure of any kind.
- OUT: No audio — sound is out of scope for v1.
- OUT: No mobile or touch controls in v1.
- OUT: No high score persistence — score resets on page reload.
- OUT: No level select, checkpoints, or distinct level structure.